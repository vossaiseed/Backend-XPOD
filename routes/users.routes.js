import express from "express";
import { supabase } from "../config/supabase.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const { data } = await supabase.from("profiles").select("*");
  res.json(data);
});

export default router;