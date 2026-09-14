"use strict";
const express = require("express");
const router  = express.Router();

const { getNotifications, getUnreadCount, markOneAsRead, markAllAsRead } = require("../controllers/notificationController");
const { authenticate } = require("../middleware/auth");

router.get("/",              authenticate, getNotifications);
router.get("/unread-count",  authenticate, getUnreadCount);
router.patch("/:id/read",    authenticate, markOneAsRead);
router.put("/:id/read",      authenticate, markOneAsRead);
router.post("/read-all",     authenticate, markAllAsRead);
router.put("/read-all",      authenticate, markAllAsRead);

module.exports = router;

