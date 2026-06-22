import { supabase, supabaseAdmin } from "../config/supabase.js";
import { verifyImpersonation } from "../utils/impersonation.js";

/**
 * Verifies the Supabase access token from the Authorization header and
 * attaches the auth user (req.user) plus the profile row (req.profile,
 * req.role) for downstream handlers.
 */
export const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || "";

        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "No token provided" });
        }

        const token = authHeader.slice(7).trim();

        if (!token || token === "null" || token === "undefined") {
            return res.status(401).json({ message: "Invalid token format" });
        }

        // Admin impersonation token? Run AS the target user, but remember which
        // admin is driving (for the audit trail). Mirrors the Supabase path: the
        // identity is loaded from `profiles` by the target's auth user id (sub).
        const imp = verifyImpersonation(token);
        if (imp) {
            const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("*")
                .eq("id", imp.sub)
                .single();

            if (!profile) {
                return res.status(401).json({ message: "Impersonation target not found" });
            }

            req.user = { id: imp.sub, email: profile.email };
            req.accessToken = token;
            req.profile = profile;
            req.role = profile.role || imp.role || null;
            req.impersonatedBy = { id: imp.by, name: imp.byName };
            req.impersonation = imp; // full payload (sub/role/start) for refresh
            return next();
        }

        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data?.user) {
            return res.status(401).json({ message: "Invalid token" });
        }

        req.user = data.user;
        req.accessToken = token;

        // Attach profile (role/name/status) — bypasses RLS via service role.
        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("*")
            .eq("id", data.user.id)
            .single();

        req.profile = profile || null;
        req.role = profile?.role || data.user.user_metadata?.role || null;

        next();
    } catch (err) {
        next(err);
    }
};
