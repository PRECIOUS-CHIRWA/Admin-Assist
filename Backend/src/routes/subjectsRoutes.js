const express = require("express");
const router = express.Router();

const {
    getSubjects, getSubjectById, createSubject, updateSubject, deleteSubject,
    getTeacherAssignments, assignTeacher, removeAssignment,
} = require("../controllers/subjectsController");

const { authenticate, authorize } = require("../middleware/auth");

// ─── Teacher assignments (Must be registered before /:id) ───────────────────────
router.get("/assignments/list", authenticate, getTeacherAssignments);
router.get("/assignments",      authenticate, getTeacherAssignments);
router.post("/assign",          authenticate, authorize("admin"), assignTeacher);
router.delete("/assign/:id",    authenticate, authorize("admin"), removeAssignment);

// ─── Subject CRUD ───────────────────────────────────────────────────────────────
router.get("/",     authenticate, getSubjects);
router.get("/:id",  authenticate, getSubjectById);
router.post("/",    authenticate, authorize("admin"), createSubject);
router.put("/:id",  authenticate, authorize("admin"), updateSubject);
router.delete("/:id", authenticate, authorize("admin"), deleteSubject);

module.exports = router;