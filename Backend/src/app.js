const express = require("express");
const cors = require("cors");
const helmet = require("helmet");               // NEW
const rateLimit = require("express-rate-limit");   // NEW
const cookieParser = require("cookie-parser");      // NEW
require("dotenv").config({ quiet: true });

const studentRoutes = require("./routes/studentRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const panelRoutes = require("./routes/panelRoutes");
//const userRoutes = require("./routes/userRoutes");


const attendanceRoutes = require("./routes/attendanceRoutes");
/*const subjectsRoutes = require("./routes/subjectsRoutes");
const resultsRoutes = require("./routes/resultsRoutes");
const reportsRoutes = require("./routes/reportsRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const searchRoutes = require("./routes/searchRoutes");*/

const app = express();

// ─── Security Headers ────────────────────────────────────────────────────────
// Helmet sets ~14 HTTP headers that block common attacks:
// clickjacking (X-Frame-Options), MIME sniffing, XSS, and more.
// Must be the FIRST middleware so headers are applied to every response.
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────────────────────
// Only allow requests from your actual frontend origin.
// Add your GitHub Pages URL to ALLOWED_ORIGIN in .env when you deploy.
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);

// During local development, also allow localhost
if (process.env.NODE_ENV !== "production") {
    allowedOrigins.push("http://localhost:5500");   // Live Server default
    allowedOrigins.push("http://127.0.0.1:5500");
}

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. curl, Postman during development)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: Origin '${origin}' is not allowed`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,   // Required to send/receive httpOnly cookies
}));

// ─── Rate Limiters ───────────────────────────────────────────────────────────
// Auth limiter: tight window on login/signup to block brute force
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 20,               // max 20 attempts per IP per window
    standardHeaders: true,            // Return limit info in RateLimit-* headers
    legacyHeaders: false,
    message: { error: "Too many requests from this IP, please try again in 15 minutes" },
});

// General limiter: looser cap for all other API routes
const generalLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 minute
    max: 100,              // max 100 requests per IP per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please slow down" },
});

// ─── Body Parsing ────────────────────────────────────────────────────────────
// Limit payload size to 10kb — prevents oversized body attacks
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

// ─── Routes ──────────────────────────────────────────────────────────────────
const authRoutes = require("./routes/authRoutes");

// Auth routes get the tight rate limiter
app.use("/api/auth", authLimiter, authRoutes);

// All other future API routes get the general limiter
app.use("/api", generalLimiter);

app.use("/api/students", studentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api", panelRoutes);


app.use("/api/attendance", attendanceRoutes);
// app.use("/api/subjects", subjectsRoutes);
// app.use("/api/results", resultsRoutes)
// app.use("/api/reports", reportsRoutes);
// app.use("/api/analytics", analyticsRoutes);
// app.use("/api/search", searchRoutes);

// Health check — useful for deployment platforms to confirm the server is up
app.get("/", (req, res) => {
    res.json({ message: "Admin Assist API", status: "ok" });
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
// Catches any error passed to next(err) from route handlers
app.use((err, req, res, next) => {
    // CORS errors from our origin check above
    if (err.message && err.message.startsWith("CORS:")) {
        return res.status(403).json({ error: err.message });
    }
    console.error("Unhandled error:", err.message);
    res.status(500).json({ error: "An unexpected error occurred" });
});

module.exports = app;