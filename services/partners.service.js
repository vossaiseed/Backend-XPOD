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

const TABLE = "partners";

/**
 * Find the partner row that belongs to a logged-in user — by auth user_id,
 * falling back to phone (some rows predate the user_id link). Returns null if
 * none. Shared by the dashboard and by lead creation (to stamp partner_id).
 */
export const resolvePartner = async ({ userId, phone }) => {
    if (userId) {
        const { data } = await supabaseAdmin
            .from(TABLE)
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();
        if (data) return data;
    }
    if (phone) {
        const { data } = await supabaseAdmin
            .from(TABLE)
            .select("*")
            .eq("phone", String(phone).trim())
            .maybeSingle();
        if (data) return data;
    }
    return null;
};

/**
 * The logged-in partner's own profile + stats + leads.
 */
export const getPartnerSelf = async ({ userId, phone }) => {
    const partner = await resolvePartner({ userId, phone });
    if (!partner) throw ApiError.notFound("Partner record not found");

    const { data: leads = [] } = await supabaseAdmin
        .from("leads")
        .select("*")
        .eq("partner_id", partner.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

    const rows = leads || [];
    const converted = rows.filter((l) => l.status === LEAD_STATUS.CONVERTED);
    const royaltyEarned = converted.reduce(
        (sum, l) =>
            // prefer the per-deal royalty captured at conversion, else the partner's default
            sum +
            (Number(l.value || 0) *
                Number(l.royalty_percent ?? partner.royalty_percent ?? 0)) /
                100,
        0
    );

    // Recent activity = latest reports on this partner's leads (sales updates,
    // conversions, etc.). Best-effort: empty if the lead_reports table is absent.
    let recentActivity = [];
    const leadIds = rows.map((l) => l.id);
    if (leadIds.length) {
        const { data: reports } = await supabaseAdmin
            .from("lead_reports")
            .select("*")
            .in("lead_id", leadIds)
            .order("created_at", { ascending: false })
            .limit(15);
        const nameById = Object.fromEntries(rows.map((l) => [l.id, l.name]));
        recentActivity = (reports || []).map((r) => ({
            ...r,
            lead_name: nameById[r.lead_id] || "",
        }));
    }

    return {
        partner,
        stats: {
            totalLeads: rows.length,
            converted: converted.length,
            activeLeads: rows.length - converted.length,
            royaltyEarned,
        },
        leads: rows,
        recentActivity,
    };
};

export const listPartners = async () => {
    let query = supabaseAdmin
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: false });
    if (await columnExists(TABLE, "deleted_at")) query = query.is("deleted_at", null);
    if (await columnExists(TABLE, "archived_at")) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) throw fromSupabase(error);
    return data;
};

export const getPartner = async (id) => {
    const { data, error } = await supabaseAdmin
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .single();
    if (error) throw fromSupabase(error);
    return data;
};

export const createPartner = async (body) => {
    const { password, royalty_percent, ...rest } = body;

    // Provision a login account when the service-role key is configured.
    // Otherwise create the partner row only, so the record still appears in
    // the admin list (it just won't have a login until an account is added).
    let userId = null;
    let loginEmail = rest.email || "";
    if (hasServiceRole) {
        ({ userId, loginEmail } = await provisionUser({
            email: rest.email,
            phone: rest.phone,
            password,
            name: rest.name,
            role: ROLES.PARTNER,
        }));
    }

    const insert = {
        ...rest,
        user_id: userId,
        email: rest.email || loginEmail || "",
        royalty_percent: royalty_percent || 0,
        temp_password: password || null, // dev convenience; remove in prod
        status: "active",
    };

    const { data, error } = await supabaseAdmin
        .from(TABLE)
        .insert(insert)
        .select()
        .single();

    if (error) {
        if (userId) await deleteAuthUser(userId);
        throw fromSupabase(error);
    }
    return data;
};

export const updatePartner = async (id, body) => {
    const { password, user_id, ...rest } = body;

    if (password) {
        const existing = await getPartner(id);
        if (existing?.user_id) await setUserPassword(existing.user_id, password);
    }

    const { data, error } = await supabaseAdmin
        .from(TABLE)
        .update(rest)
        .eq("id", id)
        .select()
        .single();
    if (error) throw fromSupabase(error);
    return data;
};

/**
 * Set a partner's login password. Provisions an auth account if the partner
 * doesn't have one yet ("enable login"); otherwise just changes the password.
 */
export const resetPartnerPassword = async (id, password) => {
    if (!hasServiceRole) {
        throw new ApiError(
            500,
            "Server is not configured with SUPABASE_SERVICE_ROLE_KEY — cannot manage logins."
        );
    }
    const existing = await getPartner(id);

    // Find the real auth user (even if this row's user_id is missing).
    const authId = await resolveAuthUserId({
        userId: existing?.user_id,
        phone: existing?.phone,
    });

    if (authId) {
        await setUserPassword(authId, password);
        await ensureProfile({
            userId: authId,
            name: existing.name,
            email: existing.email,
            phone: existing.phone,
            role: ROLES.PARTNER,
        });
        // Link user_id back if missing, and store the new password so the
        // card's eye-icon reveal shows it.
        await supabaseAdmin
            .from(TABLE)
            .update({ user_id: authId, temp_password: password })
            .eq("id", id);
        return { id, loginEnabled: true, password };
    }

    // No auth user anywhere — provision a new one.
    const { userId, loginEmail } = await provisionUser({
        email: existing.email,
        phone: existing.phone,
        password,
        name: existing.name,
        role: ROLES.PARTNER,
    });

    const { error } = await supabaseAdmin
        .from(TABLE)
        .update({
            user_id: userId,
            email: existing.email || loginEmail,
            temp_password: password,
        })
        .eq("id", id);
    if (error) {
        await deleteAuthUser(userId);
        throw fromSupabase(error);
    }
    return { id, loginEnabled: true, password };
};

// Move to Trash — soft delete via deleted_at (falls back to hard delete only
// if the migration hasn't been run).
export const deletePartner = async (id, actorName) => {
    const existing = await getPartner(id).catch(() => null);

    if (await columnExists(TABLE, "deleted_at")) {
        const { error } = await supabaseAdmin
            .from(TABLE)
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", id);
        if (error) throw fromSupabase(error);
    } else {
        const { error } = await supabaseAdmin.from(TABLE).delete().eq("id", id);
        if (error) throw fromSupabase(error);
        if (existing?.user_id) await deleteAuthUser(existing.user_id);
    }

    await logActivity({
        action: "deleted",
        entityType: "partner",
        entityId: id,
        entityName: existing?.name,
        actorName,
    });
    return { id };
};

// Archive — hidden from the main list via archived_at (kept out of Trash).
export const archivePartner = async (id, actorName) => {
    if (!(await columnExists(TABLE, "archived_at"))) {
        throw new ApiError(400, "Archiving needs the latest DB migration (archived_at column).");
    }
    const existing = await getPartner(id).catch(() => null);
    const { error } = await supabaseAdmin
        .from(TABLE)
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
    if (error) throw fromSupabase(error);

    await logActivity({
        action: "archived",
        entityType: "partner",
        entityId: id,
        entityName: existing?.name,
        actorName,
    });
    return { id };
};
