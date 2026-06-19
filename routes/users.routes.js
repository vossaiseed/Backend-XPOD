import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { listProfiles, getProfile } from "../controller/users.controller.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", listProfiles);
router.get("/:id", getProfile);

export default router;
