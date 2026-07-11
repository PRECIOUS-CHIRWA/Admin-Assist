const express = require("express");
const router = express.Router();

const {
    getResults, getResultById, createResult, updateResult, deleteResult,
    getStudentResults, getClassResults, generateTranscript, getResultsAnalytics,
} = require("../controllers/resultsController");

const { authenticate, authorize } = require("../middleware/auth");

// ─── Results CRUD (teacher, admin, headmaster can write) ───────────────────────
router.get("/", authenticate, getResults);
router.get("/:id", authenticate, getResultById);
router.post("/", authenticate, authorize("admin", "headmaster", "teacher"), createResult);
router.put("/:id", authenticate, authorize("admin", "headmaster", "teacher"), updateResult);
router.delete("/:id", authenticate, authorize("admin", "headmaster", "teacher"), deleteResult);

// ─── Aggregated views ────────────────────────────────────────────────────────────
router.get("/student/:studentId", authenticate, getStudentResults);
router.get("/class/:classId", authenticate, getClassResults);
router.get("/transcript/:studentId", authenticate, generateTranscript);
router.get("/analytics/summary", authenticate, getResultsAnalytics);

module.exports = router;