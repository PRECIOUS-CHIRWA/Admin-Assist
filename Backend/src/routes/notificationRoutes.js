const express = require("express");
const router = express.Router();
const { getNotifications, markAllAsRead } = require("../controllers/notificationController");
const { authenticate } = require("../middleware/auth");

router.get("/", authenticate, getNotifications);
router.post("/read-all", authenticate, markAllAsRead);

module.exports = router;
