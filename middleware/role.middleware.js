import { supabase } from "../config/supabase.js";

export const allowRoles = (allowedRoles = []) => {
    return async (req, res, next) => {
        try {
            const userId = req.user.id;

            const { data, error } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", userId)
                .single();

            if (error || !data) {
                return res.status(403).json({ message: "Role not found" });
            }

            const role = data.role;

            if (!allowedRoles.includes(role)) {
                return res.status(403).json({
                    message: "Access denied",
                    role,
                });
            }

            req.role = role;
            next();
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    };
};