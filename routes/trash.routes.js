import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import { ROLES } from "../utils/roles.js";
import {
    getTrash,
    getActivity,
    getArchived,
    restore,
    unarchive,
    purge,
} from "../controller/trash.controller.js";

const router = express.Router();

router.use(authMiddleware, allowRoles([ROLES.ADMIN]));

router.get("/", getTrash);
router.get("/activity", getActivity);
router.get("/archived", getArchived);
router.post("/:type/:id/restore", restore);
router.post("/:type/:id/unarchive", unarchive);
router.delete("/:type/:id", purge);

export default router;
