import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import { ROLES } from "../utils/roles.js";

const router = express.Router();

// CREATE LEAD
router.post(
    "/create",
    authMiddleware,
    allowRoles([ROLES.ADMIN, ROLES.LEAD_MANAGER]),
    (req, res) => {
        res.json({ message: "Lead created" });
    }
);

// EDIT LEAD
router.put(
    "/:id",
    authMiddleware,
    allowRoles([ROLES.ADMIN, ROLES.LEAD_MANAGER, ROLES.STAFF]),
    (req, res) => {
        res.json({ message: "Lead updated" });
    }
);

// DELETE LEAD
router.delete(
    "/:id",
    authMiddleware,
    allowRoles([ROLES.ADMIN]),
    (req, res) => {
        res.json({ message: "Lead deleted" });
    }
);

export default router;