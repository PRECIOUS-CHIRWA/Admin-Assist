"use strict";
const express = require("express");
const router  = express.Router();

const { getNotifications, markOneAsRead, markAllAsRead } = require("../controllers/notificationController");
const { authenticate } = require("../middleware/auth");

router.get("/",           authenticate, getNotifications);
router.patch("/:id/read", authenticate, markOneAsRead);
router.post("/read-all",  authenticate, markAllAsRead);

module.exports = router;
