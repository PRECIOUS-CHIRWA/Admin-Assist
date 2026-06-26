const express = require("express");
const router = express.Router();
const {
    listStudents, getStudentById,
    createStudent, updateStudent, deleteStudent,
} = require("../controllers/studentController");

const { authenticate, authorize } = require("../middleware/auth");

// ─── Any logged-in user ───────────────────────────────────────────────────────
router.get("/", authenticate, listStudents);
router.get("/:id", authenticate, getStudentById);

// ─── Admin, headmaster, staff ─────────────────────────────────────────────────
router.post("/", authenticate, authorize("admin", "headmaster", "staff"), createStudent);
router.put("/:id", authenticate, authorize("admin", "headmaster", "staff"), updateStudent);

// ─── Admin and headmaster only ────────────────────────────────────────────────
router.delete("/:id", authenticate, authorize("admin", "headmaster"), deleteStudent);

module.exports = router;