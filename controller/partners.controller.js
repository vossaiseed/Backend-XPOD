import { supabase } from "../config/supabase.js";
import bcrypt from "bcrypt";

/* ─────────────────────────────
   CREATE PARTNER (ADMIN ONLY)
────────────────────────────── */
export const createPartner = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      location,
      state,
      company,
      partner_type,
      photo_url,
      royalty_percent,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    /* 1. Create Auth User (Supabase Admin API) */
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          phone,
          role: "partner",
        },
      });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    const userId = authData.user.id;

    /* 2. Insert into profiles */
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: userId,
        name,
        email,
        phone,
        role: "partner",
        status: "active",
      });

    if (profileError) {
      return res.status(400).json({ error: profileError.message });
    }

    /* 3. Insert into partners */
    const { data, error } = await supabase
      .from("partners")
      .insert({
        user_id: userId,
        name,
        email,
        phone,
        location,
        state,
        company,
        partner_type,
        photo_url,
        royalty_percent: royalty_percent || 0,
        status: "active",
        temp_password: password, // (optional, remove in production)
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(201).json({
      message: "Partner created successfully",
      data,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ─────────────────────────────
   GET ALL PARTNERS
────────────────────────────── */
export const getPartners = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("partners")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ─────────────────────────────
   UPDATE PARTNER
────────────────────────────── */
export const updatePartner = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("partners")
      .update(req.body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      message: "Partner updated",
      data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ─────────────────────────────
   DELETE PARTNER
────────────────────────────── */
export const deletePartner = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("partners")
      .delete()
      .eq("id", id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: "Partner deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};