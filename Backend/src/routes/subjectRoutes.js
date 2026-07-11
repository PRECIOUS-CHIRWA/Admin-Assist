const express = require("express");
const router = express.Router();

const {
    getSubjects, getSubjectById, createSubject, updateSubject, deleteSubject,
    getTeacherAssignments, assignTeacher, removeAssignment,
} = require("../controllers/subjectsController");

const { authenticate, authorize } = require("../middleware/auth");

// ─── Subject CRUD ───────────────────────────────────────────────────────────────
router.get("/", authenticate, getSubjects);
router.get("/:id", authenticate, getSubjectById);
router.post("/", authenticate, authorize("admin", "headmaster"), createSubject);
router.put("/:id", authenticate, authorize("admin", "headmaster"), updateSubject);
router.delete("/:id", authenticate, authorize("admin", "headmaster"), deleteSubject);

// ─── Teacher assignments ────────────────────────────────────────────────────────
router.get("/assignments/list", authenticate, getTeacherAssignments);
router.post("/assign", authenticate, authorize("admin", "headmaster"), assignTeacher);
router.delete("/assign/:id", authenticate, authorize("admin", "headmaster"), removeAssignment);

module.exports = router;