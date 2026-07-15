const express = require("express");
const router = express.Router();

const {
    getOverview, getEnrollmentTrends, getClassDistribution, getGenderDistribution,
    getAttendanceTrend, getPerformanceBySubject, getTopPerformers,
} = require("../controllers/analyticsController");

const { authenticate, authorize } = require("../middleware/auth");

router.get("/overview", authenticate, authorize("admin", "headmaster", "teacher"), getOverview);
router.get("/enrollment-trends", authenticate, authorize("admin", "headmaster", "teacher"), getEnrollmentTrends);
router.get("/class-distribution", authenticate, authorize("admin", "headmaster", "teacher"), getClassDistribution);
router.get("/gender-distribution", authenticate, authorize("admin", "headmaster", "teacher"), getGenderDistribution);
router.get("/attendance-trend", authenticate, authorize("admin", "headmaster", "teacher"), getAttendanceTrend);
router.get("/performance-by-subject", authenticate, authorize("admin", "headmaster", "teacher"), getPerformanceBySubject);
router.get("/top-performers", authenticate, authorize("admin", "headmaster", "teacher"), getTopPerformers);

module.exports = router;