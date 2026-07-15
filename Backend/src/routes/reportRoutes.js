const express = require("express");
const router = express.Router();

const {
    getEnrollmentReport, getAttendanceReport, getAcademicReport, getSummaryReport,
} = require("../controllers/reportsController");

const { authenticate, authorize } = require("../middleware/auth");

// All report endpoints are restricted to admin/headmaster/teacher (not students)
router.get("/summary", authenticate, getSummaryReport);
router.get("/enrollment", authenticate, authorize("admin", "headmaster", "teacher"), getEnrollmentReport);
router.get("/attendance", authenticate, authorize("admin", "headmaster", "teacher"), getAttendanceReport);
router.get("/academic", authenticate, authorize("admin", "headmaster", "teacher"), getAcademicReport);

module.exports = router;