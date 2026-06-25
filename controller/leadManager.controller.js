import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import * as leadsService from "../services/leadManager.service.js";
import * as trashService from "../services/trash.service.js";
import { ALL_STATUSES, LEAD_STATUS } from "../utils/leadStatus.js";
import { ROLES } from "../utils/roles.js";
import { resolvePartner } from "../services/partners.service.js";
import { resolveSalesMember } from "../services/sales.service.js";
import { logActivity } from "../services/activity.service.js";
import { actorName, actorWithRole } from "../utils/audit.js";
import { getSettings } from "../services/settings.service.js";

/**
 * Ownership guard. Staff (admin / lead manager / sales) may act on any lead.
 * A partner may only act on leads linked to their OWN partner record — otherwise
 * they could edit, convert, or comment on someone else's lead by guessing an id.
 * Throws 403 when a partner targets a lead that isn't theirs. No-op for staff.
 */
const assertCanActOnLead = async (req, leadId) => {
    if (req.role !== ROLES.PARTNER) return;
    const partner = await resolvePartner({
        userId: req.user?.id,
        phone: req.profile?.phone,
    });
    if (!partner) throw ApiError.forbidden("Partner record not found");
    const lead = await leadsService.getLead(leadId);
    if (!lead || lead.partner_id !== partner.id) {
        throw ApiError.forbidden("You can only act on your own leads");
    }
};

/** Parse common list filters from the query string. */
const parseFilters = (query) => {
    const filters = {};
    for (const key of [
        "status",
        "assigned_to",
        "partner_id",
        "lead_manager_id",
        "search",
    ]) {
        if (query[key] !== undefined) filters[key] = query[key];
    }
    for (const key of ["is_general", "is_vip", "assigned", "trashed", "pool", "managed"]) {
        if (query[key] !== undefined) filters[key] = query[key] === "true";
    }
    return filters;
};

// GET /api/leads
export const getLeads = asyncHandler(async (req, res) => {
    const data = await leadsService.listLeads(parseFilters(req.query));
    res.json({ data, count: data.length });
});

// GET /api/leads/counts — lightweight badge counts for the admin sidebar.
export const getBadgeCounts = asyncHandler(async (req, res) => {
    const [leadCounts, trash] = await Promise.all([
        leadsService.getLeadBadgeCounts(),
        trashService.countTrash(),
    ]);
    res.json({ ...leadCounts, trash });
});

// GET /api/leads/:id
export const getLeadById = asyncHandler(async (req, res) => {
    const data = await leadsService.getLead(req.params.id);
    res.json({ data });
});

// POST /api/leads
export const createLead = asyncHandler(async (req, res) => {
    const payload = { ...req.body };

    // Record who added the lead (shown as the "By" name on cards).
    payload.created_by = actorName(req);

    // A lead manager's own leads are tagged so they show under admin
    // "General Leads" (manager-added) and the LM's own dashboard.
    // TODO(#6): req.profile.id is the auth user id (profiles.id), NOT the
    // lead_managers.id domain row. Every current consumer only checks this
    // column for NULL/NOT NULL (the `managed` filter), so the app works; but a
    // join leads.lead_manager_id -> lead_managers.id (e.g. LeadBoard "By" label)
    // won't resolve and silently falls back to created_by. A correct fix must
    // store lead_managers.id here AND backfill existing rows
    // (UPDATE leads l SET lead_manager_id = lm.id FROM lead_managers lm
    //  WHERE lm.user_id = l.lead_manager_id). Deferred: needs a data backfill.
    if (req.role === ROLES.LEAD_MANAGER && req.profile?.id) {
        payload.lead_manager_id = req.profile.id;
    }

    // A partner can only create leads under their own partner record — derive
    // partner_id from their account so it links to them (and can't be spoofed).
    let partnerReviewOn = null; // null = not a partner submission
    if (req.role === ROLES.PARTNER) {
        const partner = await resolvePartner({
            userId: req.user?.id,
            phone: req.profile?.phone,
        });
        if (!partner) throw ApiError.badRequest("Partner record not found");
        payload.partner_id = partner.id;

        // "Require Lead Manager Review" ON  → start as pending (review first).
        //                               OFF → straight to the Lead Pool (new).
        const settings = await getSettings();
        partnerReviewOn = settings.require_lead_manager_review !== false;
        payload.status = partnerReviewOn ? LEAD_STATUS.PENDING : LEAD_STATUS.NEW;
    }

    const data = await leadsService.createLead(payload);

    // Notification feed entry.
    await logActivity({
        action: "created",
        entityType: "lead",
        entityId: data.id,
        entityName: data.name,
        actorName: actorWithRole(req),
    });

    // Timeline entry for partner submissions (best-effort; needs lead_reports).
    if (partnerReviewOn !== null) {
        await leadsService
            .addReport(
                data.id,
                {
                    status: payload.status,
                    note: partnerReviewOn
                        ? `Lead submitted by ${payload.created_by}. Awaiting Lead Manager review.`
                        : `Lead submitted by ${payload.created_by}. Added directly to the Lead Pool.`,
                },
                payload.created_by
            )
            .catch(() => {});
    }

    res.status(201).json({ data });
});

// PUT /api/leads/:id
export const updateLead = asyncHandler(async (req, res) => {
    await assertCanActOnLead(req, req.params.id);
    const data = await leadsService.updateLead(req.params.id, req.body);
    res.json({ data });
});

// DELETE /api/leads/:id  (soft delete → trash)
export const deleteLead = asyncHandler(async (req, res) => {
    const data = await leadsService.trashLead(req.params.id);
    await logActivity({
        action: "deleted",
        entityType: "lead",
        entityId: req.params.id,
        entityName: data?.name,
        actorName: actorName(req),
    });
    res.json({ message: "Lead moved to trash", data });
});

// POST /api/leads/:id/restore
export const restoreLead = asyncHandler(async (req, res) => {
    const data = await leadsService.restoreLead(req.params.id);
    res.json({ message: "Lead restored", data });
});

// DELETE /api/leads/:id/permanent
export const purgeLead = asyncHandler(async (req, res) => {
    await leadsService.purgeLead(req.params.id);
    res.json({ message: "Lead permanently deleted" });
});

// POST /api/leads/:id/claim — a salesman claims an unassigned pool lead.
export const claimLead = asyncHandler(async (req, res) => {
    const member = await resolveSalesMember({
        userId: req.user?.id,
        phone: req.profile?.phone,
    });
    if (!member) throw ApiError.badRequest("Sales record not found");

    const lead = await leadsService.getLead(req.params.id);
    if (lead.assigned_to) throw ApiError.badRequest("Lead already claimed");

    const data = await leadsService.assignLead(req.params.id, {
        assigned_to: member.id,
    });
    await logActivity({
        action: "claimed",
        entityType: "lead",
        entityId: req.params.id,
        entityName: data?.name || lead?.name,
        actorName: actorWithRole(req),
    });
    res.json({ message: "Lead claimed", data });
});

// POST /api/leads/:id/assign
export const assignLead = asyncHandler(async (req, res) => {
    const { assigned_to } = req.body;
    if (!assigned_to) throw ApiError.badRequest("assigned_to is required");
    const data = await leadsService.assignLead(req.params.id, {
        assigned_to,
        assigned_by: actorName(req),
    });
    res.json({ message: "Lead assigned", data });
});

// PATCH /api/leads/:id/status
export const updateStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!ALL_STATUSES.includes(status)) {
        throw ApiError.badRequest(
            `status must be one of: ${ALL_STATUSES.join(", ")}`
        );
    }
    await assertCanActOnLead(req, req.params.id);
    const data = await leadsService.updateLead(req.params.id, { status });
    res.json({ data });
});

// POST /api/leads/:id/request-conversion
export const requestConversion = asyncHandler(async (req, res) => {
    const data = await leadsService.requestConversion(req.params.id);
    await logActivity({
        action: "requested_conversion",
        entityType: "lead",
        entityId: req.params.id,
        entityName: data?.name,
        actorName: actorWithRole(req),
    });
    res.json({ message: "Conversion requested", data });
});

// POST /api/leads/:id/approve-conversion
export const approveConversion = asyncHandler(async (req, res) => {
    const data = await leadsService.approveConversion(req.params.id);
    res.json({ message: "Conversion approved", data });
});

// POST /api/leads/:id/reject-conversion
export const rejectConversion = asyncHandler(async (req, res) => {
    const data = await leadsService.rejectConversion(req.params.id);
    res.json({ message: "Conversion rejected", data });
});

// POST /api/leads/:id/approve-review
export const approveReview = asyncHandler(async (req, res) => {
    const data = await leadsService.approveReview(req.params.id);
    res.json({ message: "Lead approved", data });
});

// POST /api/leads/:id/reject-review
export const rejectReview = asyncHandler(async (req, res) => {
    const data = await leadsService.rejectReview(req.params.id);
    res.json({ message: "Lead rejected", data });
});

// GET /api/leads/:id/reports
export const getReports = asyncHandler(async (req, res) => {
    res.json(await leadsService.listReports(req.params.id));
});

// POST /api/leads/:id/reports
export const addReport = asyncHandler(async (req, res) => {
    const { note, status, next_followup } = req.body;
    if (!note && !status) {
        throw ApiError.badRequest("A note or status update is required");
    }
    await assertCanActOnLead(req, req.params.id);
    const data = await leadsService.addReport(
        req.params.id,
        { note, status, next_followup },
        actorName(req)
    );
    await logActivity({
        action: "report",
        entityType: "lead",
        entityId: req.params.id,
        entityName: next_followup ? `next follow-up: ${next_followup}` : null,
        actorName: actorWithRole(req),
    });
    res.status(201).json({ data });
});
