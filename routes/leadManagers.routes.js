import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import { ROLES } from "../utils/roles.js";
import {
    listLeadManagers,
    createLeadManager,
    updateLeadManager,
    deleteLeadManager,
    archiveLeadManager,
    resetLeadManagerPassword,
} from "../controller/users.controller.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", listLeadManagers);
router.post("/", allowRoles([ROLES.ADMIN]), createLeadManager);
router.put("/:id", allowRoles([ROLES.ADMIN]), updateLeadManager);
router.delete("/:id", allowRoles([ROLES.ADMIN]), deleteLeadManager);
router.post("/:id/archive", allowRoles([ROLES.ADMIN]), archiveLeadManager);
router.post(
    "/:id/reset-password",
    allowRoles([ROLES.ADMIN]),
    resetLeadManagerPassword
);

export default router;
