import { supabaseAdmin } from "../config/supabase.js";
import { fromSupabase } from "../utils/ApiError.js";
import { LEAD_STATUS } from "../utils/leadStatus.js";

const TABLE = "leads";

// Cache whether the optional `whatsapp` column exists, so writes don't fail on
// DBs where the migration (db/add-lead-whatsapp.sql) hasn't been run yet.
let whatsappColumn = null;
const hasWhatsappColumn = async () => {
    if (whatsappColumn !== null) return whatsappColumn;
    const { error } = await supabaseAdmin.from(TABLE).select("whatsapp").limit(1);
    whatsappColumn = !error;
    return whatsappColumn;
};

// Drop columns the DB doesn't have yet so the whole insert/update isn't rejected.
const stripUnknown = async (payload) => {
    if (payload.whatsapp !== undefined && !(await hasWhatsappColumn())) {
        const { whatsapp, ...rest } = payload;
        return rest;
    }
    return payload;
};

/**
 * List leads with flexible filtering.
 * Trashed leads (deleted_at NOT NULL) are excluded unless trashed=true.
 */
export const listLeads = async (filters = {}) => {
    const {
        status,
        assigned_to,
        partner_id,
        lead_manager_id,
        is_vip,
        is_general,
        assigned, // "true" | "false" — has an owner or not
        trashed,
        search,
    } = filters;

    let query = supabaseAdmin.from(TABLE).select("*");

    if (status) query = query.eq("status", status);
    if (assigned_to) query = query.eq("assigned_to", assigned_to);
    if (partner_id) query = query.eq("partner_id", partner_id);
    if (lead_manager_id) query = query.eq("lead_manager_id", lead_manager_id);
    if (is_vip !== undefined) query = query.eq("is_vip", is_vip);

    // "general" lead = not linked to a partner
    if (is_general === true) query = query.is("partner_id", null);
    if (is_general === false) query = query.not("partner_id", "is", null);

    if (assigned === true) query = query.not("assigned_to", "is", null);
    if (assigned === false) query = query.is("assigned_to", null);

    // Trash handling via deleted_at
    if (trashed === true) {
        query = query.not("deleted_at", "is", null);
    } else {
        query = query.is("deleted_at", null);
    }

    if (search) {
        query = query.or(
            `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
        );
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw fromSupabase(error);
    return data;
};

export const getLead = async (id) => {
    const { data, error } = await supabaseAdmin
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .single();
    if (error) throw fromSupabase(error);
    return data;
};

export const createLead = async (payload) => {
    const clean = await stripUnknown(payload);
    const { data, error } = await supabaseAdmin
        .from(TABLE)
        .insert(clean)
        .select()
        .single();
    if (error) throw fromSupabase(error);
    return data;
};

export const updateLead = async (id, payload) => {
    const clean = await stripUnknown(payload);
    const { data, error } = await supabaseAdmin
        .from(TABLE)
        .update({ ...clean, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
    if (error) throw fromSupabase(error);
    return data;
};

/** Soft delete → set deleted_at. */
export const trashLead = (id) =>
    updateLead(id, { deleted_at: new Date().toISOString() });

/** Restore from trash. */
export const restoreLead = (id) => updateLead(id, { deleted_at: null });

/** Permanently delete a row. */
export const purgeLead = async (id) => {
    const { error } = await supabaseAdmin.from(TABLE).delete().eq("id", id);
    if (error) throw fromSupabase(error);
    return { id };
};

/** Assign a lead to a sales person. */
export const assignLead = (id, { assigned_to }) =>
    updateLead(id, { assigned_to, status: LEAD_STATUS.NEW });

/** Sales person requests conversion approval. */
export const requestConversion = (id) =>
    updateLead(id, { status: LEAD_STATUS.CONVERSION_REQUESTED });

export const approveConversion = (id) =>
    updateLead(id, { status: LEAD_STATUS.CONVERTED });

export const rejectConversion = (id) =>
    updateLead(id, { status: LEAD_STATUS.IN_PROGRESS });

/** Approve a partner-submitted (pending) lead → mark it ready/new. */
export const approveReview = (id) => updateLead(id, { status: LEAD_STATUS.NEW });

/** Reject a pending lead → trash it. */
export const rejectReview = (id) =>
    updateLead(id, { deleted_at: new Date().toISOString() });
