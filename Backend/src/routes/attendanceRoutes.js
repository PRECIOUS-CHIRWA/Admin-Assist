const express = require("express");
const router = express.Router();

const {
    getAcademicYears, getClasses, getTerms, getSubjects, getRegister,
    createSession, getSessions, getSessionById, updateSession, deleteSession,
    submitSessionAttendance,
    updateAttendanceRecord, deleteAttendanceRecord,
    getStudentAttendance, getAttendanceSummary, getAttendanceAnalytics,
} = require("../controllers/attendanceController");

const { authenticate, authorize } = require("../middleware/auth");

// ─── Meta lookups (Authenticated staff/teachers/admins) ────────────────────────
router.get("/academic-years", authenticate, authorize("admin", "headmaster", "staff"), getAcademicYears);
router.get("/years",          authenticate, authorize("admin", "headmaster", "staff"), getAcademicYears);
router.get("/classes",        authenticate, authorize("admin", "headmaster", "staff"), getClasses);
router.get("/terms",          authenticate, authorize("admin", "headmaster", "staff"), getTerms);
router.get("/subjects",       authenticate, authorize("admin", "headmaster", "staff"), getSubjects);
router.get("/register",       authenticate, authorize("admin", "headmaster", "staff"), getRegister);
router.get("/roster",         authenticate, authorize("admin", "headmaster", "staff"), getRegister);

// ─── Sessions ────────────────────────────────────────────────────────────────
router.post("/sessions",            authenticate, authorize("admin", "headmaster", "staff"), createSession);
router.get("/sessions",             authenticate, authorize("admin", "headmaster", "staff"), getSessions);
router.get("/sessions/:id",         authenticate, authorize("admin", "headmaster", "staff"), getSessionById);
router.put("/sessions/:id",         authenticate, authorize("admin", "headmaster", "staff"), updateSession);
router.delete("/sessions/:id",      authenticate, authorize("admin", "headmaster", "staff"), deleteSession);

// ─── Bulk submission ──────────────────────────────────────────────────────────
router.post("/sessions/:id/submit", authenticate, authorize("admin", "headmaster", "staff"), submitSessionAttendance);

// ─── Individual record edits ──────────────────────────────────────────────────
router.patch("/records/:id",        authenticate, authorize("admin", "headmaster", "staff"), updateAttendanceRecord);
router.delete("/records/:id",       authenticate, authorize("admin", "headmaster", "staff"), deleteAttendanceRecord);

// ─── Aggregate queries ────────────────────────────────────────────────────────
router.get("/student/:studentId",   authenticate, authorize("admin", "headmaster", "staff"), getStudentAttendance);
router.get("/summary",              authenticate, authorize("admin", "headmaster", "staff"), getAttendanceSummary);
router.get("/analytics",            authenticate, authorize("admin", "headmaster", "staff"), getAttendanceAnalytics);

module.exports = router;