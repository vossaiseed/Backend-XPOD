
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import leadsRoutes from "./routes/leadManager.routes.js";
import usersRoutes from "./routes/users.routes.js";
import partnersRoutes from "./routes/partners.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";

const app = express();

app.use(cors({
    origin: "http://localhost:5174",
    credentials: true,
}));

app.use(express.json());

// routes
app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use('/api/partner',partnersRoutes)

console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("SUPABASE_KEY:", process.env.SUPABASE_ANON_KEY);

app.get("/", (req, res) => {
    res.send("XPOD CRM Backend Running");
});

app.listen(5000, () => {
    console.log("Server running on port 5000");
});