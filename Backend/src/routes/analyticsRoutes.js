const express = require("express");
const router = express.Router();

const {
    getOverview, getEnrollmentTrends, getClassDistribution, getGenderDistribution,
    getAttendanceTrend, getPerformanceBySubject, getTopPerformers,
} = require("../controllers/analyticsController");

const { authenticate, authorize } = require("../middleware/auth");

router.get("/overview", authenticate, authorize("admin", "headmaster", "staff"), getOverview);
router.get("/enrollment-trends", authenticate, authorize("admin", "headmaster", "staff"), getEnrollmentTrends);
router.get("/class-distribution", authenticate, authorize("admin", "headmaster", "staff"), getClassDistribution);
router.get("/gender-distribution", authenticate, authorize("admin", "headmaster", "staff"), getGenderDistribution);
router.get("/attendance-trend", authenticate, authorize("admin", "headmaster", "staff"), getAttendanceTrend);
router.get("/performance-by-subject", authenticate, authorize("admin", "headmaster", "staff"), getPerformanceBySubject);
router.get("/top-performers", authenticate, authorize("admin", "headmaster", "staff"), getTopPerformers);

module.exports = router;