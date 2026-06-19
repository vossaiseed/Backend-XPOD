import { supabase, supabaseAdmin } from "../config/supabase.js";

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
