import { supabaseAdmin, hasServiceRole } from "../config/supabase.js";
import { ApiError, fromSupabase } from "../utils/ApiError.js";
import {
    provisionUser,
    deleteAuthUser,
    setUserPassword,
    ensureProfile,
    resolveAuthUserId,
} from "./users.service.js";
import { ROLES } from "../utils/roles.js";
import { LEAD_STATUS } from "../utils/leadStatus.js";
import { columnExists } from "../utils/db.js";
import { logActivity } from "./activity.service.js";

// Domain table -> activity entity type.
const ENTITY_TYPE = { sales_team: "sales", lead_managers: "lead_manager" };

/**
 * Best-effort store of the plaintext password for the card's eye-icon reveal.
 * Silently ignored if the table has no `temp_password` column yet (run the
 * ALTER TABLE in db/schema.sql to enable it).
 */
const setTempPassword = async (table, id, password) => {
    if (!password) return;
    const { error } = await supabaseAdmin
        .from(table)
        .update({ temp_password: password })
        .eq("id", id);
    if (error && !/column|temp_password/i.test(error.message)) {
        // Only surface unexpected errors; a missing column is fine.
        console.warn(`temp_password update on ${table} failed:`, error.message);
    }
};

/**
 * Generic "team member" service backing both the sales team and lead managers.
 * Each team member is: an auth user + a profiles row + a domain row
 * (sales_team / lead_managers).
 *
 * @param {"sales_team"|"lead_managers"} table
 * @param {string} role  profiles.role to stamp (salesman / leadmanager)
 */
const makeTeamService = (table, role) => ({
    async list() {
        let query = supabaseAdmin
            .from(table)
            .select("*")
            .order("created_at", { ascending: false });
        if (await columnExists(table, "deleted_at")) query = query.is("deleted_at", null);
        if (await columnExists(table, "archived_at")) query = query.is("archived_at", null);
        const { data, error } = await query;
        if (error) throw fromSupabase(error);
        return data;
    },

    async get(id) {
        const { data, error } = await supabaseAdmin
            .from(table)
            .select("*")
            .eq("id", id)
            .single();
        if (error) throw fromSupabase(error);
        return data;
    },

    async create(body) {
        const { password, ...rest } = body;

        // Drop commission_rate if the column isn't there yet (pre-migration).
        if (rest.commission_rate !== undefined && !(await columnExists(table, "commission_rate"))) {
            delete rest.commission_rate;
        }

        // Provision a login account when the service-role key is configured AND
        // a password was supplied. Otherwise create the row only, so the member
        // still shows in the admin list (no login until an account is added).
        let userId = null;
        let loginEmail = rest.email || "";
        if (hasServiceRole && password) {
            ({ userId, loginEmail } = await provisionUser({
                email: rest.email,
                phone: rest.phone,
                password,
                name: rest.name,
                role,
            }));
        }

        // NB: sales_team / lead_managers have no `status` column
        // (sales_team uses `active`), and no `updated_at`.
        const insert = {
            ...rest,
            user_id: userId,
            login_email: loginEmail || rest.email || null,
        };

        const { data, error } = await supabaseAdmin
            .from(table)
            .insert(insert)
            .select()
            .single();

        if (error) {
            // Undo the auth user so a retry isn't blocked by a duplicate email.
            if (userId) await deleteAuthUser(userId);
            throw fromSupabase(error);
        }
        await setTempPassword(table, data.id, password);
        return data;
    },

    async update(id, body) {
        // Never let password / immutable identity fields hit the domain table.
        const { password, user_id, login_email, ...rest } = body;

        if (rest.commission_rate !== undefined && !(await columnExists(table, "commission_rate"))) {
            delete rest.commission_rate;
        }

        if (password && hasServiceRole) {
            const existing = await this.get(id);
            if (existing?.user_id) await setUserPassword(existing.user_id, password);
        }

        const { data, error } = await supabaseAdmin
            .from(table)
            .update(rest)
            .eq("id", id)
            .select()
            .single();
        if (error) throw fromSupabase(error);
        if (password) await setTempPassword(table, id, password);
        return data;
    },

    async remove(id, actorName) {
        const existing = await this.get(id);

        if (await columnExists(table, "deleted_at")) {
            // Soft delete → moves to Trash.
            const { error } = await supabaseAdmin
                .from(table)
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", id);
            if (error) throw fromSupabase(error);
        } else {
            // Pre-migration fallback: hard delete + remove auth user.
            const { error } = await supabaseAdmin.from(table).delete().eq("id", id);
            if (error) throw fromSupabase(error);
            if (existing?.user_id) await deleteAuthUser(existing.user_id);
        }

        await logActivity({
            action: "deleted",
            entityType: ENTITY_TYPE[table],
            entityId: id,
            entityName: existing?.name,
            actorName,
        });
        return { id };
    },

    /**
     * Archive — hide from the main list via archived_at (kept out of Trash).
     * Needs the archived_at migration; errors clearly if it's missing.
     */
    async archive(id, actorName) {
        if (!(await columnExists(table, "archived_at"))) {
            throw new ApiError(400, "Archiving needs the latest DB migration (archived_at column).");
        }
        const existing = await this.get(id).catch(() => null);
        const { error } = await supabaseAdmin
            .from(table)
            .update({ archived_at: new Date().toISOString() })
            .eq("id", id);
        if (error) throw fromSupabase(error);

        await logActivity({
            action: "archived",
            entityType: ENTITY_TYPE[table],
            entityId: id,
            entityName: existing?.name,
            actorName,
        });
        return { id };
    },

    /**
     * Set the login password. If this row already has an auth account, just
     * change the password. If it doesn't (e.g. created before the service-role
     * key was configured), provision one now — i.e. "enable login".
     */
    async resetPassword(id, password) {
        if (!hasServiceRole) {
            throw new ApiError(
                500,
                "Server is not configured with SUPABASE_SERVICE_ROLE_KEY — cannot manage logins."
            );
        }
        const existing = await this.get(id);

        // Find the real auth user even if this row's user_id is missing.
        const authId = await resolveAuthUserId({
            userId: existing?.user_id,
            phone: existing?.phone,
        });

        if (authId) {
            await setUserPassword(authId, password);
            // Repair/ensure the profiles row so phone login can find them.
            await ensureProfile({
                userId: authId,
                name: existing.name,
                email: existing.login_email || existing.email,
                phone: existing.phone,
                role,
            });
            if (existing.user_id !== authId) {
                await supabaseAdmin
                    .from(table)
                    .update({ user_id: authId })
                    .eq("id", id);
            }
            await setTempPassword(table, id, password);
            return { id, loginEnabled: true, password };
        }

        // No auth user anywhere — provision a new login account.
        const { userId, loginEmail } = await provisionUser({
            email: existing.email,
            phone: existing.phone,
            password,
            name: existing.name,
            role,
        });

        const { error } = await supabaseAdmin
            .from(table)
            .update({ user_id: userId, login_email: loginEmail })
            .eq("id", id);
        if (error) {
            await deleteAuthUser(userId);
            throw fromSupabase(error);
        }
        await setTempPassword(table, id, password);
        return { id, loginEnabled: true, password };
    },
});

export const salesService = makeTeamService("sales_team", ROLES.SALESMAN);
export const leadManagerService = makeTeamService(
    "lead_managers",
    ROLES.LEAD_MANAGER
);

/**
 * Find the sales_team row for a logged-in user (by auth user_id, then phone).
 * Used by the salesman dashboard and lead claiming.
 */
export const resolveSalesMember = async ({ userId, phone }) => {
    if (userId) {
        const { data } = await supabaseAdmin
            .from("sales_team")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();
        if (data) return data;
    }
    if (phone) {
        const { data } = await supabaseAdmin
            .from("sales_team")
            .select("*")
            .eq("phone", String(phone).trim())
            .maybeSingle();
        if (data) return data;
    }
    return null;
};

/**
 * Sales team enriched with per-member lead stats — powers the Lead Manager /
 * admin "Sales Team" board (load bars, top performers, stat cards).
 */
export const getSalesTeamStats = async () => {
    let q = supabaseAdmin
        .from("sales_team")
        .select("*")
        .order("created_at", { ascending: false });
    if (await columnExists("sales_team", "deleted_at")) q = q.is("deleted_at", null);
    if (await columnExists("sales_team", "archived_at")) q = q.is("archived_at", null);
    const { data: members, error } = await q;
    if (error) throw fromSupabase(error);

    const { data: leads = [] } = await supabaseAdmin
        .from("leads")
        .select("assigned_to, status, is_vip")
        .is("deleted_at", null);
    const allLeads = leads || [];

    return (members || []).map((m) => {
        const mine = allLeads.filter((l) => l.assigned_to === m.id);
        const assigned = mine.length;
        const converted = mine.filter((l) => l.status === LEAD_STATUS.CONVERTED).length;
        const failed = mine.filter((l) => l.status === LEAD_STATUS.FAILED).length;
        const vip = mine.filter((l) => l.is_vip).length;
        const active = Math.max(0, assigned - converted - failed);
        const capacity = Number(m.max_lead_capacity || m.capacity || 10);
        const conversionRate = assigned ? Math.round((converted / assigned) * 100) : 0;
        // Productivity score: conversions weighted highest, then active load + VIPs.
        const score = converted * 10 + active + vip * 2;
        return {
            id: m.id,
            name: m.name,
            phone: m.phone,
            role: m.role,
            photo_url: m.photo_url,
            languages: m.languages || [],
            capacity,
            assigned,
            active,
            converted,
            failed,
            vip,
            conversionRate,
            score,
        };
    });
};

/** The logged-in salesman's own profile + stats + assigned leads. */
export const getSalesSelf = async ({ userId, phone }) => {
    const member = await resolveSalesMember({ userId, phone });
    if (!member) throw ApiError.notFound("Sales record not found");

    const { data: leads = [] } = await supabaseAdmin
        .from("leads")
        .select("id, name, phone, location, status, notes, value, created_at, partner_id")
        .eq("assigned_to", member.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

    const rows = leads || [];
    const convertedRows = rows.filter((l) => l.status === LEAD_STATUS.CONVERTED);
    const converted = convertedRows.length;
    const conversionRequested = rows.filter(
        (l) => l.status === LEAD_STATUS.CONVERSION_REQUESTED
    ).length;
    const failed = rows.filter((l) => l.status === LEAD_STATUS.FAILED).length;
    const earnings = convertedRows.reduce((s, l) => s + Number(l.value || 0), 0);

    return {
        member,
        stats: {
            totalLeads: rows.length,
            converted,
            active: rows.length - converted - failed,
            conversionRequested,
            earnings,
        },
        leads: rows,
    };
};
