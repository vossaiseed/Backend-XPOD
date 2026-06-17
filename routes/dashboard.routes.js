import express from "express";
import { supabase } from "../config/supabase.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const { data: leads } = await supabase.from("leads").select("*");
  const { data: users } = await supabase.from("profiles").select("*");

  res.json({
    totalLeads: leads.length,
    totalUsers: users.length,
  });
});

export default router;