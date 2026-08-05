const express = require("express");
const router = express.Router();

const {
    getEnrollmentReport, getAttendanceReport, getAcademicReport, getSummaryReport,
    getSubjectPerformanceReport, getTopPerformersReport, getInterventionReport,
} = require("../controllers/reportsController");

const { authenticate, authorize } = require("../middleware/auth");

// Summary — any authenticated user (used by dashboard KPIs)
router.get("/summary", authenticate, getSummaryReport);

// Standard reports — admin, headmaster, teacher
router.get("/enrollment",          authenticate, authorize("admin", "headmaster", "staff"), getEnrollmentReport);
router.get("/attendance",          authenticate, authorize("admin", "headmaster", "staff"), getAttendanceReport);
router.get("/academic",            authenticate, authorize("admin", "headmaster", "staff"), getAcademicReport);
router.get("/subject-performance", authenticate, authorize("admin", "headmaster", "staff"), getSubjectPerformanceReport);
router.get("/top-performers",      authenticate, authorize("admin", "headmaster", "staff"), getTopPerformersReport);
router.get("/intervention",        authenticate, authorize("admin", "headmaster", "staff"), getInterventionReport);

module.exports = router;