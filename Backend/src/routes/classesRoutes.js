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
    createClass,
    updateClass,
    deleteClass,
} = require("../controllers/classesController");

// All routes require authentication
router.use(authenticate);

// Staff need read access — attendance/enrollment dropdowns are populated from
// this. Only admin/headmaster can create/edit the class list itself.
router.get("/", authorize("admin", "headmaster", "staff"), listClasses);
router.get("/:id", authorize("admin", "headmaster", "staff"), getClassById);
router.post("/", authorize("admin", "headmaster"), createClass);
router.put("/:id", authorize("admin", "headmaster"), updateClass);
router.delete("/:id", authorize("admin"), deleteClass);

module.exports = router;
