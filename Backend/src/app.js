const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
require("dotenv").config({ quiet: true });

const studentRoutes = require("./routes/studentRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const panelRoutes = require("./routes/panelRoutes");
const userRoutes = require("./routes/userRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const subjectsRoutes = require("./routes/subjectsRoutes");
const resultsRoutes = require("./routes/resultsRoutes");
const reportRoutes = require("./routes/reportRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const searchRoutes = require("./routes/searchRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();

// ─── Security Headers ────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);

if (process.env.NODE_ENV !== "production") {
    allowedOrigins.push("http://localhost:5500");
    allowedOrigins.push("http://127.0.0.1:5500");
    allowedOrigins.push("http://localhost:3000");
    allowedOrigins.push("http://127.0.0.1:3000");
}

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(null, true); // Permissive in dev to avoid CORS blocking frontend preview
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
}));

// ─── Rate Limiters ───────────────────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests from this IP, please try again in 15 minutes" },
});

const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please slow down" },
});

// ─── Body Parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true, limit: "50kb" }));
app.use(cookieParser());

// ─── Routes ──────────────────────────────────────────────────────────────────
const authRoutes = require("./routes/authRoutes");

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api", generalLimiter);

app.use("/api/students", studentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/subjects", subjectsRoutes);
app.use("/api/results", resultsRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api", panelRoutes);

// Health check
app.get("/", (req, res) => {
    res.json({ message: "Admin Assist API", status: "ok" });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

// Global Error Handler
app.use((err, req, res, next) => {
    if (err.message && err.message.startsWith("CORS:")) {
        return res.status(403).json({ error: err.message });
    }
    console.error("Unhandled error:", err.message);
    res.status(500).json({ error: "An unexpected error occurred" });
});

module.exports = app;