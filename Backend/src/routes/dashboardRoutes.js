// Backend/src/routes/dashboardRoutes.js
const express    = require("express");
const router     = express.Router();
const { authenticate } = require("../middleware/auth");
const { getDashboardStats, getRecentActivity } = require("../controllers/dashboardController");

// Both endpoints require a valid login — no public access
router.get("/stats",           authenticate, getDashboardStats);
router.get("/recent-activity", authenticate, getRecentActivity);

module.exports = router;
