import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import * as partnersService from "../services/partners.service.js";
import { actorName } from "../utils/audit.js";

// GET /api/partners
export const getPartners = asyncHandler(async (req, res) => {
    res.json(await partnersService.listPartners());
});

// GET /api/partners/me — the logged-in partner's own profile + stats + leads
export const getMe = asyncHandler(async (req, res) => {
    const data = await partnersService.getPartnerSelf({
        userId: req.user?.id,
        phone: req.profile?.phone,
    });
    res.json(data);
});

// GET /api/partners/:id
export const getPartner = asyncHandler(async (req, res) => {
    res.json(await partnersService.getPartner(req.params.id));
});

// POST /api/partners
export const createPartner = asyncHandler(async (req, res) => {
    const { email, phone, password } = req.body;
    if (!password) throw ApiError.badRequest("Password is required");
    if (!email && !phone) {
        throw ApiError.badRequest("Email or phone is required");
    }
    const data = await partnersService.createPartner(req.body);
    const loginEnabled = Boolean(data.user_id);
    res.status(201).json({
        message: loginEnabled
            ? "Partner created successfully"
            : "Partner created, but no login account was made. Set SUPABASE_SERVICE_ROLE_KEY to enable login.",
        loginEnabled,
        data,
    });
});

// PUT /api/partners/:id
export const updatePartner = asyncHandler(async (req, res) => {
    const data = await partnersService.updatePartner(req.params.id, req.body);
    res.json({ message: "Partner updated", data });
});

// DELETE /api/partners/:id
export const deletePartner = asyncHandler(async (req, res) => {
    await partnersService.deletePartner(req.params.id, actorName(req));
    res.json({ message: "Partner deleted" });
});

// POST /api/partners/:id/archive
export const archivePartner = asyncHandler(async (req, res) => {
    await partnersService.archivePartner(req.params.id, actorName(req));
    res.json({ message: "Partner archived" });
});

// POST /api/partners/:id/reset-password  (also enables login if none exists)
export const resetPartnerPassword = asyncHandler(async (req, res) => {
    if (!req.body.password) throw ApiError.badRequest("Password is required");
    await partnersService.resetPartnerPassword(req.params.id, req.body.password);
    res.json({ message: "Login enabled / password reset" });
});
