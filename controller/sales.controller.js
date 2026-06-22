import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { salesService, getSalesSelf, getSalesTeamStats } from "../services/sales.service.js";
import { actorName } from "../utils/audit.js";

// GET /api/sales-team
export const listSalesTeam = asyncHandler(async (req, res) => {
    res.json(await salesService.list());
});

// GET /api/sales-team/stats — sales members + per-member lead stats
export const listSalesStats = asyncHandler(async (req, res) => {
    res.json(await getSalesTeamStats());
});

// GET /api/sales-team/me — the logged-in salesman's own profile + stats + leads
export const getMe = asyncHandler(async (req, res) => {
    const data = await getSalesSelf({
        userId: req.user?.id,
        phone: req.profile?.phone,
    });
    res.json(data);
});

// GET /api/sales-team/:id
export const getSalesPerson = asyncHandler(async (req, res) => {
    res.json(await salesService.get(req.params.id));
});

// POST /api/sales-team
export const createSalesPerson = asyncHandler(async (req, res) => {
    const { name, phone, email } = req.body;
    if (!name) throw ApiError.badRequest("Name is required");
    if (!phone && !email) throw ApiError.badRequest("Phone or email is required");
    const data = await salesService.create(req.body);
    const loginEnabled = Boolean(data.user_id);
    res.status(201).json({
        message: loginEnabled
            ? "Sales person created"
            : "Sales person created, but no login account was made. Set SUPABASE_SERVICE_ROLE_KEY to enable login.",
        loginEnabled,
        data,
    });
});

// PUT /api/sales-team/:id
export const updateSalesPerson = asyncHandler(async (req, res) => {
    const data = await salesService.update(req.params.id, req.body);
    res.json({ message: "Sales person updated", data });
});

// DELETE /api/sales-team/:id
export const deleteSalesPerson = asyncHandler(async (req, res) => {
    await salesService.remove(req.params.id, actorName(req));
    res.json({ message: "Sales person deleted" });
});

// POST /api/sales-team/:id/archive
export const archiveSalesPerson = asyncHandler(async (req, res) => {
    await salesService.archive(req.params.id, actorName(req));
    res.json({ message: "Sales person archived" });
});

// POST /api/sales-team/:id/reset-password
export const resetSalesPassword = asyncHandler(async (req, res) => {
    if (!req.body.password) throw ApiError.badRequest("Password is required");
    await salesService.resetPassword(req.params.id, req.body.password);
    res.json({ message: "Password reset" });
});
