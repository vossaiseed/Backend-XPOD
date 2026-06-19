import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import { ROLES } from "../utils/roles.js";
import {
    listSalesTeam,
    getSalesPerson,
    createSalesPerson,
    updateSalesPerson,
    deleteSalesPerson,
    resetSalesPassword,
} from "../controller/sales.controller.js";

const router = express.Router();

router.use(authMiddleware);

const MANAGERS = [ROLES.ADMIN, ROLES.LEAD_MANAGER];

router.get("/", listSalesTeam);
router.get("/:id", getSalesPerson);
router.post("/", allowRoles(MANAGERS), createSalesPerson);
router.put("/:id", allowRoles(MANAGERS), updateSalesPerson);
router.delete("/:id", allowRoles(MANAGERS), deleteSalesPerson);
router.post("/:id/reset-password", allowRoles(MANAGERS), resetSalesPassword);

export default router;
