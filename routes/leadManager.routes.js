import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import { ROLES } from "../utils/roles.js";
import {
    getLeads,
    getBadgeCounts,
    getLeadById,
    createLead,
    updateLead,
    deleteLead,
    restoreLead,
    purgeLead,
    assignLead,
    claimLead,
    updateStatus,
    requestConversion,
    approveConversion,
    rejectConversion,
    approveReview,
    rejectReview,
    getReports,
    addReport,
} from "../controller/leadManager.controller.js";

const router = express.Router();

// Everything below requires a valid session.
router.use(authMiddleware);

const STAFF = [ROLES.ADMIN, ROLES.LEAD_MANAGER, ROLES.SALESMAN];
const MANAGERS = [ROLES.ADMIN, ROLES.LEAD_MANAGER];
// Partners can act on their own leads from the lead-detail page (add reports,
// update/convert). Ownership is enforced in the controller (assertCanActOnLead):
// a partner may only target leads linked to their own partner_id.
const STAFF_AND_PARTNER = [...STAFF, ROLES.PARTNER];

// Collection
router.get("/", getLeads);
// Sidebar badge counts — static path, declared BEFORE "/:id" so it isn't swallowed.
router.get("/counts", allowRoles(MANAGERS), getBadgeCounts);
router.post("/", allowRoles([...MANAGERS, ROLES.PARTNER]), createLead);

// Lifecycle actions (declare BEFORE "/:id" so they aren't swallowed)
router.post("/:id/claim", allowRoles(STAFF), claimLead);
router.post("/:id/assign", allowRoles(MANAGERS), assignLead);
router.patch("/:id/status", allowRoles(STAFF_AND_PARTNER), updateStatus);
router.post("/:id/request-conversion", allowRoles(STAFF), requestConversion);
router.post("/:id/approve-conversion", allowRoles(MANAGERS), approveConversion);
router.post("/:id/reject-conversion", allowRoles(MANAGERS), rejectConversion);
router.post("/:id/approve-review", allowRoles(MANAGERS), approveReview);
router.post("/:id/reject-review", allowRoles(MANAGERS), rejectReview);
router.post("/:id/restore", allowRoles(MANAGERS), restoreLead);
router.delete("/:id/permanent", allowRoles([ROLES.ADMIN]), purgeLead);

// Reports / activity timeline
router.get("/:id/reports", getReports);
router.post("/:id/reports", allowRoles(STAFF_AND_PARTNER), addReport);

// Item
router.get("/:id", getLeadById);
router.put("/:id", allowRoles(STAFF_AND_PARTNER), updateLead);
router.delete("/:id", allowRoles(MANAGERS), deleteLead);

export default router;
