const express = require("express");
const router = express.Router();
const {
    listStudents, getStudentById, getNextAdmissionNumber,
    createStudent, updateStudent, deleteStudent, createStudentAccount,
    toggleAccountStatus, archiveStudent, restoreStudent,
    getSupportedCities,
} = require("../controllers/studentController");

const { authenticate, authorize } = require("../middleware/auth");

// ─── Enrollment / Student creation (Admin, headmaster, staff) ─────────────────
router.post("/enroll", authenticate, authorize("admin", "headmaster", "staff"), createStudent);
router.post("/",       authenticate, authorize("admin", "headmaster", "staff"), createStudent);

// ─── Auto-generate Admission Number ──────────────────────────────────────────
router.get("/next-admission-number", authenticate, getNextAdmissionNumber);

// ─── Supported Cities Dataset (Public / Authenticated) ───────────────────────
router.get("/cities", getSupportedCities);

// ─── Any logged-in user ───────────────────────────────────────────────────────
router.get("/",    authenticate, listStudents);
router.get("/:id", authenticate, getStudentById);

// ─── Modifications & Account Lifecycle ─────────────────────────────────────────
router.put("/:id/account/status", authenticate, authorize("admin", "headmaster"), toggleAccountStatus);
router.post("/:id/account",        authenticate, authorize("admin", "headmaster"), createStudentAccount);
router.put("/:id/archive",         authenticate, authorize("admin", "headmaster"), archiveStudent);
router.put("/:id/restore",         authenticate, authorize("admin", "headmaster"), restoreStudent);
router.put("/:id",                 authenticate, authorize("admin", "headmaster", "staff"), updateStudent);
router.delete("/:id",              authenticate, authorize("admin", "headmaster"), deleteStudent);

module.exports = router;