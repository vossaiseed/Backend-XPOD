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
        const { data, error } = await supabaseAdmin
            .from(table)
            .select("*")
            .order("created_at", { ascending: false });
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

    async remove(id) {
        const existing = await this.get(id);

        const { error } = await supabaseAdmin.from(table).delete().eq("id", id);
        if (error) throw fromSupabase(error);

        if (existing?.user_id) await deleteAuthUser(existing.user_id);
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
