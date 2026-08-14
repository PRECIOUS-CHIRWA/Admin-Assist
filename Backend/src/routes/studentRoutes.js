const express = require("express");
const router = express.Router();
const {
    listStudents, getStudentById,
    createStudent, updateStudent, deleteStudent,
} = require("../controllers/studentController");

const { authenticate, authorize } = require("../middleware/auth");

// ─── Enrollment / Student creation (Admin, headmaster, staff) ─────────────────
router.post("/enroll", authenticate, authorize("admin", "headmaster", "staff"), createStudent);
router.post("/",       authenticate, authorize("admin", "headmaster", "staff"), createStudent);

// ─── Any logged-in user ───────────────────────────────────────────────────────
router.get("/",    authenticate, listStudents);
router.get("/:id", authenticate, getStudentById);

// ─── Modifications ────────────────────────────────────────────────────────────
router.put("/:id",    authenticate, authorize("admin", "headmaster", "staff"), updateStudent);
router.delete("/:id", authenticate, authorize("admin", "headmaster"), deleteStudent);

module.exports = router;