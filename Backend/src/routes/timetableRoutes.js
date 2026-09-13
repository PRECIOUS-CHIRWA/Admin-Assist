/**
 * timetableRoutes.js — mounted at /api/timetable in app.js
 */
"use strict";

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
    getMyTodayTimetable,
    getMyWeekTimetable,
    listTimetables,
    createTimetableEntry,
    updateTimetableEntry,
    deleteTimetableEntry,
} = require("../controllers/timetableController");

// All timetable endpoints require authentication
router.use(authenticate);

// Scoped timetable endpoints: Staff/Teacher (personal teaching schedule) and Student/Parent (class schedule)
router.get("/my/today", authorize("staff", "admin", "headmaster", "user"), getMyTodayTimetable);
router.get("/my/week", authorize("staff", "admin", "headmaster", "user"), getMyWeekTimetable);

// Administrative management endpoints
router.get("/", authorize("admin", "headmaster"), listTimetables);
router.post("/", authorize("admin", "headmaster"), createTimetableEntry);
router.put("/:id", authorize("admin", "headmaster"), updateTimetableEntry);
router.delete("/:id", authorize("admin", "headmaster"), deleteTimetableEntry);

module.exports = router;
