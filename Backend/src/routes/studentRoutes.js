// Backend/src/routes/studentRoutes.js
const express = require("express");
const router = express.Router();

const {
    listStudents,
    getStudentById,
    createStudent,
    updateStudent,
    deleteStudent,
} = require("../controllers/studentController");

const { authenticate, authorize } = require("../middleware/auth");

// Any logged-in user can browse the directory and view a profile
router.get("/", authenticate, listStudents);
router.get("/:id", authenticate, getStudentById);

// Admin, headmaster, and teaching staff can register and edit students
router.post("/", authenticate, authorize("admin", "headmaster", "staff"), createStudent);
router.put("/:id", authenticate, authorize("admin", "headmaster", "staff"), updateStudent);

// Only admin and headmaster can deactivate a student record
router.delete("/:id", authenticate, authorize("admin", "headmaster"), deleteStudent);

module.exports = router;