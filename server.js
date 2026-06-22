import "./config/env.js";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import leadsRoutes from "./routes/leadManager.routes.js";
import usersRoutes from "./routes/users.routes.js";
import salesRoutes from "./routes/sales.routes.js";
import leadManagersRoutes from "./routes/leadManagers.routes.js";
import partnerRoutes from "./routes/partners.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import uploadRoutes from "./routes/uploads.routes.js";
import trashRoutes from "./routes/trash.routes.js";
import settingsRoutes from "./routes/settings.routes.js";

import { notFound, errorHandler } from "./middleware/error.middleware.js";

const app = express();

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://frontend-xpod.vercel.app",
];

app.use(
    cors({
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
    })
);
app.use(express.json({ limit: "8mb" })); // allow base64 photo uploads

// Health check
app.get("/", (req, res) => res.send("XPOD CRM Backend Running"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/sales-team", salesRoutes);
app.use("/api/lead-managers", leadManagersRoutes);
app.use("/api/partners", partnerRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/trash", trashRoutes);
app.use("/api/settings", settingsRoutes);

// 404 + error handling (must be last)
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 XPOD CRM backend running on http://localhost:${PORT}`);
});
