/**
 * teacherRoutes.js — mounted at /api/teachers in app.js
 */
"use strict";
const express = require("express");
const router  = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
    listTeachers,
    getTeacherById,
    createTeacher,
    updateTeacher,
    toggleTeacherStatus,
    deleteTeacher,
} = require("../controllers/teacherController");

// All routes require authentication
router.use(authenticate);

// Staff can read; only admin/headmaster can write
router.get("/",    authorize("admin", "headmaster", "staff"), listTeachers);
router.get("/:id", authorize("admin", "headmaster"),          getTeacherById);
router.post("/",   authorize("admin", "headmaster"),          createTeacher);
router.put("/:id", authorize("admin", "headmaster"),          updateTeacher);
router.patch("/:id/status", authorize("admin", "headmaster"), toggleTeacherStatus);
router.delete("/:id", authorize("admin"),                     deleteTeacher);

module.exports = router;
