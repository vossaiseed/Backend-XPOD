import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { uploadImage } from "../controller/uploads.controller.js";

const router = express.Router();

router.post("/", authMiddleware, uploadImage);

export default router;
