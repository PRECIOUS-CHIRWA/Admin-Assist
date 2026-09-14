/**
 * classesRoutes.js — mounted at /api/classes in app.js
 */
"use strict";
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
    listClasses,
    getClassById,
    getClassStudents,
    createClass,
    updateClass,
    deleteClass,
} = require("../controllers/classesController");

// All routes require authentication
router.use(authenticate);

// Staff and headmaster need read access. Only admin can create/edit/delete classes.
router.get("/", authorize("admin", "headmaster", "staff"), listClasses);
router.get("/:id/students", authorize("admin", "headmaster", "staff", "user"), getClassStudents);
router.get("/:id", authorize("admin", "headmaster", "staff"), getClassById);
router.post("/", authorize("admin"), createClass);
router.put("/:id", authorize("admin"), updateClass);
router.delete("/:id", authorize("admin"), deleteClass);

module.exports = router;
