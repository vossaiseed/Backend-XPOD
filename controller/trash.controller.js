import { asyncHandler } from "../utils/asyncHandler.js";
import * as trashService from "../services/trash.service.js";
import { listActivity } from "../services/activity.service.js";
import { actorName } from "../utils/audit.js";

const actor = (req) => actorName(req);

// GET /api/trash
export const getTrash = asyncHandler(async (req, res) => {
    res.json(await trashService.listTrash());
});

// GET /api/trash/activity
export const getActivity = asyncHandler(async (req, res) => {
    res.json(await listActivity());
});

// GET /api/trash/archived
export const getArchived = asyncHandler(async (req, res) => {
    res.json(await trashService.listArchived());
});

// POST /api/trash/:type/:id/unarchive
export const unarchive = asyncHandler(async (req, res) => {
    const data = await trashService.unarchiveItem(
        req.params.type,
        req.params.id,
        actor(req)
    );
    res.json({ message: "Unarchived", data });
});

// POST /api/trash/:type/:id/restore
export const restore = asyncHandler(async (req, res) => {
    const data = await trashService.restoreItem(
        req.params.type,
        req.params.id,
        actor(req)
    );
    res.json({ message: "Restored", data });
});

// DELETE /api/trash/:type/:id
export const purge = asyncHandler(async (req, res) => {
    await trashService.purgeItem(req.params.type, req.params.id, actor(req));
    res.json({ message: "Permanently deleted" });
});
