import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import { ROLES } from "../utils/roles.js";
import {
    getSettings,
    updateSettings,
    listSources,
    createSource,
    updateSource,
    deleteSource,
} from "../controller/settings.controller.js";

const router = express.Router();

router.use(authMiddleware);

// Reads are available to any authenticated user (e.g. lead forms need sources).
router.get("/", getSettings);
router.get("/sources", listSources);

// Writes are admin-only.
router.put("/", allowRoles([ROLES.ADMIN]), updateSettings);
router.post("/sources", allowRoles([ROLES.ADMIN]), createSource);
router.put("/sources/:id", allowRoles([ROLES.ADMIN]), updateSource);
router.delete("/sources/:id", allowRoles([ROLES.ADMIN]), deleteSource);

export default router;
