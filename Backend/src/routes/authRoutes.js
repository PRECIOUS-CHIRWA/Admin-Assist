const express = require("express");
const router  = express.Router();

const { signup, login, getMe, logout } = require("../controllers/authController");
const { authenticate, authorize }      = require("../middleware/auth");

// ─── Public ───────────────────────────────────────────────────────────────────
router.post("/signup", signup);
router.post("/login",  login);

// ─── Any authenticated user ───────────────────────────────────────────────────
router.get ("/me",     authenticate, getMe);
router.post("/logout", authenticate, logout);

// ─── Admin + Headmaster only ──────────────────────────────────────────────────
// These routes will return 403 for staff and user roles.
// Wire your enrollment, reports, and user-management controllers here.

router.get("/admin/users",
    authenticate,
    authorize("admin", "headmaster"),
    (req, res) => {
        // TODO: replace with a real listUsers controller in the next sprint
        res.json({ message: "User list — admin/headmaster only", requestedBy: req.user });
    }
);

// ─── Admin only ───────────────────────────────────────────────────────────────
router.delete("/admin/users/:id",
    authenticate,
    authorize("admin"),
    (req, res) => {
        // TODO: replace with a real deleteUser controller
        res.json({ message: `Delete user ${req.params.id} — admin only` });
    }
);

module.exports = router;