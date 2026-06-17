import express from "express";
import { supabase } from "../config/supabase.js";

const router = express.Router();

// GET ALL LEADS
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  res.json(data);
});

// CREATE LEAD
router.post("/", async (req, res) => {
  const { data, error } = await supabase
    .from("leads")
    .insert(req.body)
    .select()
    .single();

  if (error) return res.status(400).json(error);

  res.json(data);
});

// UPDATE LEAD
router.put("/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("leads")
    .update(req.body)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json(error);

  res.json(data);
});

// DELETE LEAD
router.delete("/:id", async (req, res) => {
  const { error } = await supabase
    .from("leads")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(400).json(error);

  res.json({ message: "Deleted" });
});

export default router;