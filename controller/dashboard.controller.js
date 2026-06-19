import { asyncHandler } from "../utils/asyncHandler.js";
import * as dashboardService from "../services/dashboard.service.js";
import { ROLES } from "../utils/roles.js";

/**
 * GET /api/dashboard
 * Returns a role-appropriate dashboard payload for the authenticated user.
 */
export const getDashboard = asyncHandler(async (req, res) => {
    const role = req.role;

    if (role === ROLES.LEAD_MANAGER) {
        const data = await dashboardService.getLeadManagerDashboard(
            req.profile?.id
        );
        return res.json(data);
    }

    if (role === ROLES.PARTNER) {
        const data = await dashboardService.getPartnerDashboard(req.profile?.id);
        return res.json(data);
    }

    // admin (and any other staff) get the full overview
    const data = await dashboardService.getAdminDashboard();
    res.json(data);
});
