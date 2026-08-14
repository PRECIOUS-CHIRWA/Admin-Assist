// Backend/src/routes/dashboardRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { getDashboardStats, getRecentActivity, getEnrollmentStats } = require("../controllers/dashboardController");

router.get("/stats",            authenticate, getDashboardStats);
router.get("/recent-activity", authenticate, getRecentActivity);
router.get("/enrollment-stats",authenticate, getEnrollmentStats);

module.exports = router;
