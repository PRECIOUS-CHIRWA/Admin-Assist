const express = require("express");
const router = express.Router();

const { signup, login, getMe, logout, forgotPassword, resetPassword } = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

// ─── Public ───────────────────────────────────────────────────────────────────
router.post("/signup", signup);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// ─── Any authenticated user ───────────────────────────────────────────────────
router.get("/me", authenticate, getMe);
router.post("/logout", authenticate, logout);

module.exports = router;