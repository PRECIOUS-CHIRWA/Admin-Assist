const express = require("express");
const router = express.Router();
const {
    getProfile,
    updateProfile,
    changePassword,
    requestRoleChange,
    getMyRoleRequest,
    getRoleRequests,
    reviewRoleRequest,
} = require("../controllers/userController");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

// Profile routes
router.get("/profile", authenticate, getProfile);
router.put("/profile", authenticate, updateProfile);
router.put("/profile/password", authenticate, changePassword);

// Role change requests
router.post("/profile/role-request", authenticate, requestRoleChange);
router.get("/profile/role-request", authenticate, getMyRoleRequest);
router.get("/role-requests", authenticate, authorize("admin", "headmaster"), getRoleRequests);
router.put("/role-requests/:id", authenticate, authorize("admin", "headmaster"), reviewRoleRequest);

// Teachers / Staff listing
router.get("/teachers", authenticate, authorize("admin", "headmaster"), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, name, email, role, is_active, created_at
             FROM users
             WHERE role IN ('staff', 'admin', 'headmaster')
             ORDER BY name ASC`
        );
        res.json(rows);
    } catch (err) {
        console.error("getTeachers error:", err.message);
        res.status(500).json({ error: "Could not load teachers" });
    }
});

module.exports = router;
