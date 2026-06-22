import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import * as settings from "../services/settings.service.js";

// GET /api/settings
export const getSettings = asyncHandler(async (req, res) => {
    res.json(await settings.getSettings());
});

// PUT /api/settings
export const updateSettings = asyncHandler(async (req, res) => {
    const data = await settings.updateSettings(req.body);
    res.json({ message: "Settings saved", data });
});

// GET /api/settings/sources
export const listSources = asyncHandler(async (req, res) => {
    res.json(await settings.listSources());
});

// POST /api/settings/sources
export const createSource = asyncHandler(async (req, res) => {
    const name = (req.body.name || "").trim();
    if (!name) throw ApiError.badRequest("Source name is required");
    const data = await settings.createSource(name);
    res.status(201).json({ data });
});

// PUT /api/settings/sources/:id
export const updateSource = asyncHandler(async (req, res) => {
    const data = await settings.updateSource(req.params.id, req.body);
    res.json({ data });
});

// DELETE /api/settings/sources/:id
export const deleteSource = asyncHandler(async (req, res) => {
    await settings.deleteSource(req.params.id);
    res.json({ message: "Source removed" });
});
