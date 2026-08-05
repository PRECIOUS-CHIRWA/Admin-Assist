const express = require("express");
const router = express.Router();

const {
    getResults, getResultById, createResult, updateResult, deleteResult,
    getStudentResults, getClassResults, generateTranscript, getResultsAnalytics,
} = require("../controllers/resultsController");

const { authenticate, authorize } = require("../middleware/auth");

// ─── Named sub-routes MUST come before /:id to prevent Express matching
// "student", "class", "transcript", "analytics" as the :id param ────────────
router.get("/student/:studentId", authenticate, getStudentResults);
router.get("/class/:classId", authenticate, getClassResults);
router.get("/transcript/:studentId", authenticate, generateTranscript);
router.get("/analytics/summary", authenticate, getResultsAnalytics);

// ─── Results CRUD ────────────────────────────────────────────────────────────
router.get("/", authenticate, getResults);
router.post("/", authenticate, authorize("admin", "headmaster", "staff"), createResult);
router.put("/:id", authenticate, authorize("admin", "headmaster", "staff"), updateResult);
router.delete("/:id", authenticate, authorize("admin", "headmaster", "staff"), deleteResult);
// Generic /:id LAST so it never shadows named routes above
router.get("/:id", authenticate, getResultById);

module.exports = router;