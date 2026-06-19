import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import * as leadsService from "../services/leadManager.service.js";
import { ALL_STATUSES } from "../utils/leadStatus.js";
import { ROLES } from "../utils/roles.js";
import { resolvePartner } from "../services/partners.service.js";

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
    for (const key of ["is_general", "is_vip", "assigned", "trashed"]) {
        if (query[key] !== undefined) filters[key] = query[key] === "true";
    }
    return filters;
};

// GET /api/leads
export const getLeads = asyncHandler(async (req, res) => {
    const data = await leadsService.listLeads(parseFilters(req.query));
    res.json({ data, count: data.length });
});

// GET /api/leads/:id
export const getLeadById = asyncHandler(async (req, res) => {
    const data = await leadsService.getLead(req.params.id);
    res.json({ data });
});

// POST /api/leads
export const createLead = asyncHandler(async (req, res) => {
    const payload = { ...req.body };

    // A partner can only create leads under their own partner record — derive
    // partner_id from their account so it links to them (and can't be spoofed).
    if (req.role === ROLES.PARTNER) {
        const partner = await resolvePartner({
            userId: req.user?.id,
            phone: req.profile?.phone,
        });
        if (!partner) throw ApiError.badRequest("Partner record not found");
        payload.partner_id = partner.id;
    }

    const data = await leadsService.createLead(payload);
    res.status(201).json({ data });
});

// PUT /api/leads/:id
export const updateLead = asyncHandler(async (req, res) => {
    const data = await leadsService.updateLead(req.params.id, req.body);
    res.json({ data });
});

// DELETE /api/leads/:id  (soft delete → trash)
export const deleteLead = asyncHandler(async (req, res) => {
    const data = await leadsService.trashLead(req.params.id);
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

// POST /api/leads/:id/assign
export const assignLead = asyncHandler(async (req, res) => {
    const { assigned_to } = req.body;
    if (!assigned_to) throw ApiError.badRequest("assigned_to is required");
    const data = await leadsService.assignLead(req.params.id, {
        assigned_to,
        assigned_by: req.profile?.name || req.role || "admin",
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
    const data = await leadsService.updateLead(req.params.id, { status });
    res.json({ data });
});

// POST /api/leads/:id/request-conversion
export const requestConversion = asyncHandler(async (req, res) => {
    const data = await leadsService.requestConversion(req.params.id);
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
