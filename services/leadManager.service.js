import { supabaseAdmin } from "../config/supabase.js";
import { fromSupabase } from "../utils/ApiError.js";
import { LEAD_STATUS } from "../utils/leadStatus.js";
import { columnExists } from "../utils/db.js";

const TABLE = "leads";

// Optional columns added by later migrations — dropped from writes if the DB
// doesn't have them yet, so the whole insert/update isn't rejected.
const OPTIONAL_COLS = ["whatsapp", "created_by", "royalty_percent", "requirement"];

const stripUnknown = async (payload) => {
    const out = { ...payload };
    for (const col of OPTIONAL_COLS) {
        if (out[col] !== undefined && !(await columnExists(TABLE, col))) {
            delete out[col];
        }
    }
    return out;
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
        managed, // "true" — added by a lead manager (lead_manager_id set)
        assigned, // "true" | "false" — has an owner or not
        pool, // "true" — claimable pool: unassigned, reviewed, still active
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

    // "managed" = added by a lead manager
    if (managed === true) query = query.not("lead_manager_id", "is", null);

    if (assigned === true) query = query.not("assigned_to", "is", null);
    if (assigned === false) query = query.is("assigned_to", null);

    // Claimable Lead Pool: unassigned AND reviewed (not the partner-submitted
    // "pending" state) AND not in a terminal state.
    if (pool === true) {
        query = query
            .is("assigned_to", null)
            .not("status", "in",
                `(${[
                    LEAD_STATUS.PENDING,
                    LEAD_STATUS.CONVERTED,
                    LEAD_STATUS.FAILED,
                    LEAD_STATUS.NOT_INTERESTED,
                ].join(",")})`
            );
    }

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

/**
 * Lightweight badge counts for the admin sidebar. Uses head/count queries so no
 * lead rows are transferred (replaces a full getLeads("") fetch on every nav).
 * Predicates mirror the sidebar's previous client-side filters exactly.
 */
export const getLeadBadgeCounts = async () => {
    const countWhere = async (apply) => {
        const q = apply(
            supabaseAdmin
                .from(TABLE)
                .select("id", { count: "exact", head: true })
                .is("deleted_at", null)
        );
        const { count, error } = await q;
        if (error) throw fromSupabase(error);
        return count || 0;
    };

    const [pending, conversionRequested, assigned, general] = await Promise.all([
        countWhere((q) => q.eq("status", LEAD_STATUS.PENDING)),
        countWhere((q) => q.eq("status", LEAD_STATUS.CONVERSION_REQUESTED)),
        countWhere((q) => q.not("assigned_to", "is", null)),
        countWhere((q) => q.not("lead_manager_id", "is", null)),
    ]);

    return { pending, conversionRequested, assigned, general };
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

/* ── Reports / activity timeline ──────────────────────────────────────── */

export const listReports = async (leadId) => {
    const { data, error } = await supabaseAdmin
        .from("lead_reports")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
    if (error) return []; // table may not exist yet
    return data || [];
};

/** Add a report and (optionally) move the lead to the given status. */
export const addReport = async (leadId, { note, status, next_followup }, authorName) => {
    const { data, error } = await supabaseAdmin
        .from("lead_reports")
        .insert({
            lead_id: leadId,
            note: note || null,
            status: status || null,
            next_followup: next_followup || null,
            author_name: authorName || null,
        })
        .select()
        .single();
    if (error) throw fromSupabase(error);

    if (status) await updateLead(leadId, { status });
    return data;
};
