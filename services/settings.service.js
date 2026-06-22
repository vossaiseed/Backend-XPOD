import { supabaseAdmin } from "../config/supabase.js";
import { fromSupabase } from "../utils/ApiError.js";
import { columnExists } from "../utils/db.js";

const DEFAULTS = {
    lead_assignment_mode: "pool",
    call_number: "",
    whatsapp_number: "",
    whatsapp_message: "",
    // Advanced settings
    auto_whatsapp_welcome: false,
    require_lead_manager_review: true,
    inactivity_alert_enabled: true,
    inactivity_alert_hours: 48,
    max_active_leads_per_staff: 100,
    lead_reassignment_permission: "lead_manager",
    lead_delete_protection: true,
};

// Columns a client is allowed to write.
const SETTABLE = Object.keys(DEFAULTS);

/** Read the single app_settings row; returns defaults if table/row missing. */
export const getSettings = async () => {
    const { data, error } = await supabaseAdmin
        .from("app_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
    if (error || !data) return { ...DEFAULTS };
    // Merge over defaults so advanced fields are present even pre-migration.
    return { ...DEFAULTS, ...data };
};

export const updateSettings = async (patch) => {
    const allowed = {};
    for (const k of SETTABLE) if (patch[k] !== undefined) allowed[k] = patch[k];

    // Drop columns that don't exist yet (pre-migration safety) so the whole
    // update isn't rejected.
    for (const k of Object.keys(allowed)) {
        if (!(await columnExists("app_settings", k))) delete allowed[k];
    }

    const { data, error } = await supabaseAdmin
        .from("app_settings")
        .update({ ...allowed, updated_at: new Date().toISOString() })
        .eq("id", 1)
        .select()
        .single();
    if (error) throw fromSupabase(error);
    return data;
};

/* ── Lead sources ─────────────────────────────────────────────────────── */

export const listSources = async () => {
    const { data, error } = await supabaseAdmin
        .from("lead_sources")
        .select("*")
        .order("created_at", { ascending: true });
    if (error) return [];
    return data || [];
};

export const createSource = async (name) => {
    const { data, error } = await supabaseAdmin
        .from("lead_sources")
        .insert({ name })
        .select()
        .single();
    if (error) throw fromSupabase(error);
    return data;
};

export const updateSource = async (id, patch) => {
    const { data, error } = await supabaseAdmin
        .from("lead_sources")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
    if (error) throw fromSupabase(error);
    return data;
};

export const deleteSource = async (id) => {
    const { error } = await supabaseAdmin.from("lead_sources").delete().eq("id", id);
    if (error) throw fromSupabase(error);
    return { id };
};
