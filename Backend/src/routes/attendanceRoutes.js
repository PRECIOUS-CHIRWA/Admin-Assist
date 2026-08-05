const express = require("express");
const router = express.Router();

const {
    getAcademicYears, getClasses, getTerms, getRegister,
    createSession, getSessions, getSessionById, deleteSession,
    submitSessionAttendance,
    updateAttendanceRecord, deleteAttendanceRecord,
    getStudentAttendance, getAttendanceSummary, getAttendanceAnalytics,
} = require("../controllers/attendanceController");

const { authenticate, authorize } = require("../middleware/auth");

// ─── Meta lookups (any authenticated user) ──────────────────────────────────
router.get("/academic-years", authenticate, getAcademicYears);
router.get("/classes",        authenticate, getClasses);
router.get("/terms",          authenticate, getTerms);
router.get("/register",       authenticate, getRegister);

// ─── Sessions ────────────────────────────────────────────────────────────────
router.post("/sessions",     authenticate, authorize("admin", "headmaster", "staff"), createSession);
router.get("/sessions",      authenticate, getSessions);
router.get("/sessions/:id",  authenticate, getSessionById);
router.delete("/sessions/:id", authenticate, authorize("admin", "headmaster", "staff"), deleteSession);

// ─── Bulk submission ──────────────────────────────────────────────────────────
router.post("/sessions/:id/submit", authenticate, authorize("admin", "headmaster", "staff"), submitSessionAttendance);

// ─── Individual record edits ──────────────────────────────────────────────────
router.patch("/records/:id",  authenticate, authorize("admin", "headmaster", "staff"), updateAttendanceRecord);
router.delete("/records/:id", authenticate, authorize("admin", "headmaster", "staff"), deleteAttendanceRecord);

// ─── Aggregate queries ────────────────────────────────────────────────────────
router.get("/student/:studentId", authenticate, getStudentAttendance);
router.get("/summary",            authenticate, getAttendanceSummary);
router.get("/analytics",          authenticate, getAttendanceAnalytics);

module.exports = router;