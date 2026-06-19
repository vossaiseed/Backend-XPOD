import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { salesService } from "../services/sales.service.js";

// GET /api/sales-team
export const listSalesTeam = asyncHandler(async (req, res) => {
    res.json(await salesService.list());
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
    await salesService.remove(req.params.id);
    res.json({ message: "Sales person deleted" });
});

// POST /api/sales-team/:id/reset-password
export const resetSalesPassword = asyncHandler(async (req, res) => {
    if (!req.body.password) throw ApiError.badRequest("Password is required");
    await salesService.resetPassword(req.params.id, req.body.password);
    res.json({ message: "Password reset" });
});
