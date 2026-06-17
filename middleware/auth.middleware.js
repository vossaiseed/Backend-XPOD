import { supabase } from "../config/supabase.js";

export const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data.user) {
            return res.status(401).json({ message: "Invalid token" });
        }

        req.user = data.user;
        next();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};