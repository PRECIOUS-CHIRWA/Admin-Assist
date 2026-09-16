const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const { signup, login, getMe, logout, forgotPassword, resetPassword } = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

// ─── Strict limiter for credential / password endpoints ─────────────────────
// 5 attempts per IP per 15 minutes — a second layer of defence on top of the
// per-account lockout (5 failed logins → 15 min lock) in authController.js.
// Applied only where brute-force or enumeration is a meaningful threat.
const strictAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts from this IP, please try again in 15 minutes" },
    skipSuccessfulRequests: false,
});

// ─── Public ───────────────────────────────────────────────────────────────────
router.post("/signup", signup);
router.post("/login", strictAuthLimiter, login);
router.get("/login", (req, res) => {
    res.status(405).json({
        success: false,
        error: "Method Not Allowed",
        message: "GET /api/auth/login is not supported. Authentication requires POST /api/auth/login with JSON body containing email and password."
    });
});
router.post("/forgot-password", strictAuthLimiter, forgotPassword);
router.post("/reset-password", strictAuthLimiter, resetPassword);

// ─── Any authenticated user ───────────────────────────────────────────────────
router.get("/me", authenticate, getMe);
router.post("/logout", authenticate, logout);

module.exports = router;