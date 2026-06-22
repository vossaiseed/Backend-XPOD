import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import * as usersService from "../services/users.service.js";
import { leadManagerService } from "../services/sales.service.js";
import { actorName } from "../utils/audit.js";

/* ── Profiles ─────────────────────────────────────────────────────────── */

// GET /api/users?role=salesman
export const listProfiles = asyncHandler(async (req, res) => {
    const data = await usersService.listProfiles(req.query.role);
    res.json(data);
});

// GET /api/users/:id
export const getProfile = asyncHandler(async (req, res) => {
    const data = await usersService.getProfile(req.params.id);
    res.json(data);
});

/* ── Lead managers (auth user + profile + lead_managers row) ──────────── */

// GET /api/lead-managers
export const listLeadManagers = asyncHandler(async (req, res) => {
    res.json(await leadManagerService.list());
});

// POST /api/lead-managers
export const createLeadManager = asyncHandler(async (req, res) => {
    const { name, phone, email } = req.body;
    if (!name) throw ApiError.badRequest("Name is required");
    if (!phone && !email) throw ApiError.badRequest("Phone or email is required");
    const data = await leadManagerService.create(req.body);
    const loginEnabled = Boolean(data.user_id);
    res.status(201).json({
        message: loginEnabled
            ? "Lead manager created"
            : "Lead manager created, but no login account was made. Set SUPABASE_SERVICE_ROLE_KEY to enable login.",
        loginEnabled,
        data,
    });
});

// PUT /api/lead-managers/:id
export const updateLeadManager = asyncHandler(async (req, res) => {
    const data = await leadManagerService.update(req.params.id, req.body);
    res.json({ message: "Lead manager updated", data });
});

// DELETE /api/lead-managers/:id
export const deleteLeadManager = asyncHandler(async (req, res) => {
    await leadManagerService.remove(req.params.id, actorName(req));
    res.json({ message: "Lead manager deleted" });
});

// POST /api/lead-managers/:id/archive
export const archiveLeadManager = asyncHandler(async (req, res) => {
    await leadManagerService.archive(req.params.id, actorName(req));
    res.json({ message: "Lead manager archived" });
});

// POST /api/lead-managers/:id/reset-password
export const resetLeadManagerPassword = asyncHandler(async (req, res) => {
    if (!req.body.password) throw ApiError.badRequest("Password is required");
    await leadManagerService.resetPassword(req.params.id, req.body.password);
    res.json({ message: "Password reset" });
});
