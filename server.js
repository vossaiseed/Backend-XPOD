
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import leadsRoutes from "./routes/leadManager.routes.js";
import usersRoutes from "./routes/users.routes.js";
import partnersRoutes from "./routes/partners.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";

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
app.use(express.json());

// routes
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use('/api/partner', partnersRoutes)

console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("SUPABASE_KEY:", process.env.SUPABASE_ANON_KEY);

app.get("/", (req, res) => {
    res.send("XPOD CRM Backend Running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});