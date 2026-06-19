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
        .select("id, name, phone, location, status, notes, value, created_at")
        .eq("partner_id", partner.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

    const rows = leads || [];
    const converted = rows.filter((l) => l.status === LEAD_STATUS.CONVERTED);
    const royaltyEarned = converted.reduce(
        (sum, l) =>
            sum + (Number(l.value || 0) * Number(partner.royalty_percent || 0)) / 100,
        0
    );

    return {
        partner,
        stats: {
            totalLeads: rows.length,
            converted: converted.length,
            activeLeads: rows.length - converted.length,
            royaltyEarned,
        },
        leads: rows,
    };
};

export const listPartners = async () => {
    const { data, error } = await supabaseAdmin
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: false });
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

export const deletePartner = async (id) => {
    const existing = await getPartner(id).catch(() => null);

    const { error } = await supabaseAdmin.from(TABLE).delete().eq("id", id);
    if (error) throw fromSupabase(error);

    if (existing?.user_id) await deleteAuthUser(existing.user_id);
    return { id };
};
