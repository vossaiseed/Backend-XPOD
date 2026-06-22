import express from "express";
import {
    createPartner,
    getPartners,
    getPartner,
    getMe,
    updatePartner,
    deletePartner,
    archivePartner,
    resetPartnerPassword,
} from "../controller/partners.controller.js";

import { authMiddleware } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import { ROLES } from "../utils/roles.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", getPartners);
router.get("/me", getMe); // must be before "/:id"
router.get("/:id", getPartner);
router.post("/", allowRoles([ROLES.ADMIN]), createPartner);
router.put("/:id", allowRoles([ROLES.ADMIN]), updatePartner);
router.delete("/:id", allowRoles([ROLES.ADMIN]), deletePartner);
router.post("/:id/archive", allowRoles([ROLES.ADMIN]), archivePartner);
router.post("/:id/reset-password", allowRoles([ROLES.ADMIN]), resetPartnerPassword);

export default router;
