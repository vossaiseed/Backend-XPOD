import { supabaseAdmin, hasServiceRole } from "../config/supabase.js";
import { ApiError, fromSupabase } from "../utils/ApiError.js";

/**
 * Provision a Supabase auth user + matching profiles row.
 * Used when creating partners / sales staff / lead managers.
 *
 * Returns the new user id. Throws ApiError on failure.
 */
export const provisionUser = async ({
    email,
    phone,
    password,
    name,
    role,
}) => {
    if (!hasServiceRole) {
        throw new ApiError(
            500,
            "Server is not configured with SUPABASE_SERVICE_ROLE_KEY — cannot create accounts."
        );
    }
    if (!password) {
        throw ApiError.badRequest("Password is required");
    }

    const cleanPhone = phone ? String(phone).trim() : null;

    // If a profile already uses this phone, decide between a real duplicate and
    // a leftover orphan (auth user no longer exists -> safe to reclaim).
    if (cleanPhone) {
        const { data: existing } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("phone", cleanPhone)
            .maybeSingle();

        if (existing) {
            const { data: authUser } = await supabaseAdmin.auth.admin
                .getUserById(existing.id)
                .catch(() => ({ data: null }));

            if (authUser?.user) {
                throw ApiError.badRequest(
                    "A user with this phone number already exists."
                );
            }
            // Orphan profile — delete it so the phone can be reused.
            await supabaseAdmin.from("profiles").delete().eq("id", existing.id);
        }
    }

    // A login email is required by Supabase auth. Fall back to a phone-based
    // synthetic address when no real email is supplied (matches the frontend).
    const loginEmail = email || `${cleanPhone}@xpod.local`;

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: loginEmail,
        password,
        email_confirm: true,
        user_metadata: { name, phone, role },
    });

    if (error) throw fromSupabase(error);

    const userId = data.user.id;

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: userId,
        name,
        email: loginEmail,
        phone: cleanPhone,
        role,
        status: "active",
    });

    if (profileError) {
        // Roll back the orphaned auth user so retries don't collide.
        await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
        throw fromSupabase(profileError);
    }

    return { userId, loginEmail };
};

/** Permanently remove an auth user AND their profile row (frees up the phone). */
export const deleteAuthUser = async (userId) => {
    if (!userId) return;
    if (hasServiceRole) {
        try {
            await supabaseAdmin.auth.admin.deleteUser(userId);
        } catch {
            // ignore
        }
    }
    // Cascade may not be configured — delete the profile explicitly.
    // (Postgrest query builders have no .catch, so use try/catch.)
    try {
        await supabaseAdmin.from("profiles").delete().eq("id", userId);
    } catch {
        // ignore
    }
};

/** Reset a user's password (admin). */
export const setUserPassword = async (userId, password) => {
    if (!hasServiceRole) {
        throw new ApiError(500, "Service role key not configured");
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
    });
    if (error) throw fromSupabase(error);
};

/**
 * Find an existing auth user id for a record, even if the domain row's user_id
 * is missing — by checking the given id, then the profile that owns the phone.
 * Returns null if no real auth user exists.
 */
export const resolveAuthUserId = async ({ userId, phone }) => {
    if (userId) {
        const { data } = await supabaseAdmin.auth.admin
            .getUserById(userId)
            .catch(() => ({ data: null }));
        if (data?.user) return userId;
    }
    if (phone) {
        const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("phone", String(phone).trim())
            .maybeSingle();
        if (prof) {
            const { data } = await supabaseAdmin.auth.admin
                .getUserById(prof.id)
                .catch(() => ({ data: null }));
            if (data?.user) return prof.id;
        }
    }
    return null;
};

/**
 * Guarantee a profiles row exists for an auth user. Login looks the user up by
 * phone then signs in with profiles.email, so that email MUST equal the auth
 * user's email — we read it from the auth user rather than trusting a (possibly
 * blank) contact email. Safe to call repeatedly.
 */
export const ensureProfile = async ({ userId, name, phone, role }) => {
    const { data } = await supabaseAdmin.auth.admin
        .getUserById(userId)
        .catch(() => ({ data: null }));

    const cleanPhone = phone ? String(phone).trim() : null;
    const loginEmail =
        data?.user?.email || (cleanPhone ? `${cleanPhone}@xpod.local` : null);

    const { error } = await supabaseAdmin.from("profiles").upsert({
        id: userId,
        name,
        email: loginEmail,
        phone: cleanPhone,
        role,
        status: "active",
    });
    if (error) throw fromSupabase(error);
};

/* ── Profiles ─────────────────────────────────────────────────────────── */

export const listProfiles = async (role) => {
    let query = supabaseAdmin
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

    if (role) query = query.eq("role", role);

    const { data, error } = await query;
    if (error) throw fromSupabase(error);
    return data;
};

export const getProfile = async (id) => {
    const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();
    if (error) throw fromSupabase(error);
    return data;
};
