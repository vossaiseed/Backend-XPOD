import express from "express";
import {
    createPartner,
    getPartners,
    updatePartner,
    deletePartner,
} from "../controller/partners.controller.js";

import { authMiddleware } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import { ROLES } from "../utils/roles.js";

const router = express.Router();

router.post("/", authMiddleware, allowRoles([ROLES.ADMIN]), createPartner);
router.get("/", authMiddleware, getPartners);
router.put("/:id", authMiddleware, updatePartner);
router.delete("/:id", authMiddleware, deletePartner);

export default router;