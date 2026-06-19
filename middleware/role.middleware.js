import { supabaseAdmin } from "../config/supabase.js";

/**
 * Gate a route to specific roles. Relies on authMiddleware having attached
 * req.role; falls back to a profiles lookup if it's missing.
 */
export const allowRoles = (allowedRoles = []) => {
    return async (req, res, next) => {
        try {
            let role = req.role;

            if (!role) {
                if (!req.user?.id) {
                    return res.status(401).json({ message: "Not authenticated" });
                }
                const { data, error } = await supabaseAdmin
                    .from("profiles")
                    .select("role")
                    .eq("id", req.user.id)
                    .single();

                if (error || !data) {
                    return res.status(403).json({ message: "Role not found" });
                }
                role = data.role;
                req.role = role;
            }

            if (!allowedRoles.includes(role)) {
                return res.status(403).json({ message: "Access denied", role });
            }

            next();
        } catch (err) {
            next(err);
        }
    };
};
