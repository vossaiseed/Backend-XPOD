import { supabase, supabaseAdmin } from "../config/supabase.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { setUserPassword } from "../services/users.service.js";

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

/** POST /api/auth/logout — revoke the current session. */
export const logout = asyncHandler(async (req, res) => {
    if (req.accessToken) {
        await supabaseAdmin.auth.admin
            .signOut(req.accessToken)
            .catch(() => {});
    }
    res.json({ message: "Logged out" });
});
