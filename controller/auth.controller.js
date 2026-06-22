import { supabase, supabaseAdmin } from "../config/supabase.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { setUserPassword, resolveAuthUserId } from "../services/users.service.js";
import { signImpersonation, MAX_SESSION_SECONDS } from "../utils/impersonation.js";
import { logActivity } from "../services/activity.service.js";

/**
 * POST /api/auth/login
 * Login by phone + password. The phone resolves to a profile, then we sign in
 * with that profile's email (Supabase auth is email-based).
 */
export const login = asyncHandler(async (req, res) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        throw ApiError.badRequest("Phone and password are required");
    }

    const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("phone", String(phone).trim())
        .single();

    if (profileError || !profile) {
        throw ApiError.badRequest("Invalid phone or password");
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password,
    });

    if (error) {
        throw ApiError.badRequest("Invalid phone or password");
    }

    res.json({
        session: data.session,
        token: data.session?.access_token,
        user: data.user,
        role: profile.role,
        profile,
    });
});

/**
 * POST /api/auth/impersonate — secure admin "View as".
 *
 * The authenticated admin requests to view an entity (partner / sales / lead
 * manager). We resolve that entity's existing auth user, then mint a SHORT-LIVED,
 * server-signed impersonation token bound to it — no password and no stored
 * secret of the target is used. The token records which admin is driving it so
 * downstream actions are auditable. "Back to Admin CRM" simply drops this token
 * and restores the admin's own session on the client.
 */
const IMPERSONATE_MAP = {
    partner: { table: "partners", role: "partner" },
    sales: { table: "sales_team", role: "salesman" },
    lead_manager: { table: "lead_managers", role: "leadmanager" },
};

export const impersonate = asyncHandler(async (req, res) => {
    if (req.role !== "admin") throw new ApiError(403, "Admins only");
    if (req.impersonatedBy) throw new ApiError(403, "Cannot impersonate while impersonating");

    const { type, id } = req.body;
    const cfg = IMPERSONATE_MAP[type];
    if (!cfg || !id) throw ApiError.badRequest("type and id are required");

    const { data: entity } = await supabaseAdmin
        .from(cfg.table)
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (!entity) throw ApiError.notFound(`${type} not found`);

    // Find the target's existing auth user (never creates one).
    const authId = await resolveAuthUserId({ userId: entity.user_id, phone: entity.phone });
    if (!authId) {
        throw ApiError.badRequest(
            'This account has no login yet. Use "Reset Pwd" once to create it, then try View.'
        );
    }
    const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", authId)
        .maybeSingle();
    if (!profile) {
        throw ApiError.badRequest(
            'No login profile for this account. Use "Reset Pwd" once, then try View.'
        );
    }

    const adminName = req.profile?.name || "Admin";
    const token = signImpersonation({
        sub: authId,
        role: profile.role || cfg.role,
        by: req.user.id,
        byName: adminName,
    });

    // Audit: record that this admin started viewing this entity's dashboard.
    await logActivity({
        action: "impersonate_start",
        entityType: type,
        entityId: id,
        entityName: entity.name,
        actorName: `${adminName} (admin)`,
    });

    res.json({
        token,
        user: { id: authId, email: profile.email },
        role: profile.role || cfg.role,
        profile,
        name: entity.name,
        impersonation: true,
    });
});

/**
 * POST /api/auth/impersonate/refresh — slide the impersonation window forward.
 * The frontend calls this while the admin is actively using the dashboard. Only
 * works with a still-valid impersonation token, and never past the absolute cap
 * measured from the original View (`start`).
 */
export const refreshImpersonation = asyncHandler(async (req, res) => {
    const imp = req.impersonation;
    if (!imp || !req.impersonatedBy) {
        throw ApiError.badRequest("Not an impersonation session");
    }
    const now = Math.floor(Date.now() / 1000);
    if (imp.start && now - imp.start > MAX_SESSION_SECONDS) {
        throw new ApiError(401, "Impersonation session limit reached");
    }
    const token = signImpersonation({
        sub: imp.sub,
        role: imp.role,
        by: imp.by,
        byName: imp.byName,
        start: imp.start,
    });
    res.json({ token });
});

/**
 * POST /api/auth/refresh — exchange a refresh token for a fresh session.
 * Used when returning from "View as" so the admin's own (possibly expired)
 * access token is renewed instead of dropping them to the login screen.
 */
export const refresh = asyncHandler(async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) throw ApiError.badRequest("refresh_token is required");

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error || !data?.session) {
        throw ApiError.badRequest("Could not refresh session");
    }

    const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .maybeSingle();

    res.json({
        session: data.session,
        token: data.session.access_token,
        user: data.user,
        role: profile?.role || data.user.user_metadata?.role || null,
        profile: profile || null,
    });
});

/** GET /api/auth/verify — confirm a token is still valid. */
export const verify = asyncHandler(async (req, res) => {
    res.json({ valid: true, user: req.user, role: req.role, profile: req.profile });
});

/** GET /api/auth/me — current user's profile. */
export const me = asyncHandler(async (req, res) => {
    res.json({ user: req.user, role: req.role, profile: req.profile });
});

/**
 * POST /api/auth/change-password — the logged-in user changes their own
 * password. Verifies the current password by re-signing in, then updates it.
 */
export const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        throw ApiError.badRequest("Current and new password are required");
    }
    if (String(newPassword).length < 6) {
        throw ApiError.badRequest("New password must be at least 6 characters");
    }

    const email = req.profile?.email || req.user?.email;
    if (!email) throw ApiError.badRequest("No email on this account");

    // Verify the current password.
    const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
    });
    if (signInError) {
        throw ApiError.badRequest("Current password is incorrect");
    }

    // Set the new one (admin API — needs the service-role key).
    await setUserPassword(req.user.id, newPassword);

    res.json({ message: "Password changed successfully" });
});

/**
 * POST /api/auth/change-phone — change the phone used to log in.
 * Verifies the current password, then updates profiles.phone.
 */
export const changePhone = asyncHandler(async (req, res) => {
    const { newPhone, currentPassword } = req.body;

    if (!newPhone || !currentPassword) {
        throw ApiError.badRequest("New phone and current password are required");
    }
    const phone = String(newPhone).trim();

    const email = req.profile?.email || req.user?.email;
    if (!email) throw ApiError.badRequest("No email on this account");

    const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
    });
    if (signInError) throw ApiError.badRequest("Current password is incorrect");

    // Phone must be unique (it's the login key).
    const { data: taken } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("phone", phone)
        .neq("id", req.user.id)
        .maybeSingle();
    if (taken) throw ApiError.badRequest("That phone number is already in use");

    const { error } = await supabaseAdmin
        .from("profiles")
        .update({ phone })
        .eq("id", req.user.id);
    if (error) throw ApiError.badRequest(error.message);

    res.json({ message: "Phone number updated", phone });
});

/** POST /api/auth/logout — revoke the current session. */
export const logout = asyncHandler(async (req, res) => {
    if (req.accessToken) {
        await supabaseAdmin.auth.admin
            .signOut(req.accessToken)
            .catch(() => {});
    }
    res.json({ message: "Logged out" });
});
