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

module.exports = router;

