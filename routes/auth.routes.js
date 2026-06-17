import express from "express";
import { supabase } from "../config/supabase.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

// LOGIN (real login endpoint)
router.post("/login", async (req, res) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        return res.status(400).json({ message: "Phone and password required" });
    }

    // 1. get profile by phone
    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("phone", phone)
        .single();

    if (profileError || !profile) {
        return res.status(400).json({ message: "User not found" });
    }

    // 2. now login using EMAIL stored in profile
    const { data, error } = await supabase.auth.signInWithPassword({
        email: profile.email,   // 🔥 IMPORTANT FIX
        password,
    });

    if (error) {
        return res.status(400).json({ message: error.message });
    }

    // 3. get role
    const { data: fullProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

    res.json({
        session: data.session,
        user: data.user,
        role: fullProfile.role,
    });
});

// VERIFY TOKEN (THIS IS WHAT YOU NEED)
router.get("/verify", authMiddleware, async (req, res) => {
    res.json({
        valid: true,
        user: req.user,
    });
});

export default router;