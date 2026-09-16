/**
 * settingsRoutes.js — mounted at /api/settings in app.js
 */
"use strict";
const express = require("express");
const router  = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const { getSettings, updateSettings, getRecentLogs } = require("../controllers/settingsController");

router.get("/",     authenticate,                                getSettings);
router.get("/logs", authenticate,                                getRecentLogs);
router.put("/",     authenticate, authorize("admin", "headmaster"), updateSettings);

module.exports = router;
