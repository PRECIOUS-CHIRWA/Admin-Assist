const express = require("express");
const router = express.Router();
const {
    listStudents, getStudentById, getNextAdmissionNumber,
    createStudent, updateStudent, deleteStudent, createStudentAccount,
} = require("../controllers/studentController");

const { authenticate, authorize } = require("../middleware/auth");

// ─── Enrollment / Student creation (Admin, headmaster, staff) ─────────────────
router.post("/enroll", authenticate, authorize("admin", "headmaster", "staff"), createStudent);
router.post("/",       authenticate, authorize("admin", "headmaster", "staff"), createStudent);

// ─── Auto-generate Admission Number ──────────────────────────────────────────
router.get("/next-admission-number", authenticate, getNextAdmissionNumber);

// ─── Any logged-in user ───────────────────────────────────────────────────────
router.get("/",    authenticate, listStudents);
router.get("/:id", authenticate, getStudentById);

// ─── Modifications ────────────────────────────────────────────────────────────
router.put("/:id",          authenticate, authorize("admin", "headmaster", "staff"), updateStudent);
router.post("/:id/account", authenticate, authorize("admin", "headmaster"), createStudentAccount);
router.delete("/:id",       authenticate, authorize("admin", "headmaster"), deleteStudent);

module.exports = router;