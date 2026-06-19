import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
    login,
    verify,
    me,
    logout,
    changePassword,
} from "../controller/auth.controller.js";

const router = express.Router();

router.post("/login", login);
router.get("/verify", authMiddleware, verify);
router.get("/me", authMiddleware, me);
router.post("/change-password", authMiddleware, changePassword);
router.post("/logout", authMiddleware, logout);

export default router;
