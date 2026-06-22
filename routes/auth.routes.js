import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
    login,
    verify,
    me,
    logout,
    changePassword,
    changePhone,
    impersonate,
    refreshImpersonation,
    refresh,
} from "../controller/auth.controller.js";

const router = express.Router();

router.post("/login", login);
router.post("/refresh", refresh);
router.post("/impersonate", authMiddleware, impersonate);
router.post("/impersonate/refresh", authMiddleware, refreshImpersonation);
router.get("/verify", authMiddleware, verify);
router.get("/me", authMiddleware, me);
router.post("/change-password", authMiddleware, changePassword);
router.post("/change-phone", authMiddleware, changePhone);
router.post("/logout", authMiddleware, logout);

export default router;
