/**
 * notificationController.js
 * Manages persistent user notifications from the `notifications` database table.
 */
"use strict";

const pool = require("../config/db");

/**
 * Helper to push a notification into the DB for a specific user.
 * Can be called by other controllers (e.g. results, attendance, enrollment).
 */
const sendNotification = async ({ userId, type = "system", title, description = null, entityType = null, entityId = null }) => {
    try {
        await pool.execute(
            `INSERT INTO notifications (user_id, type, title, description, entity_type, entity_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, type, title, description, entityType, entityId]
        );
    } catch (err) {
        console.warn("sendNotification warning:", err.message);
    }
};

/**
 * GET /api/notifications
 * Returns notifications for the logged-in user (req.user.sub).
 */
const getNotifications = async (req, res) => {
    const userId = req.user.sub;
    try {
        const [rows] = await pool.execute(
            `SELECT id, type, title, description, entity_type AS category, is_read, created_at AS timestamp
             FROM notifications
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 50`,
            [userId]
        );

        const formatted = rows.map(n => ({
            id: n.id,
            type: n.type || "system",
            title: n.title,
            description: n.description || "",
            timestamp: n.timestamp,
            read: Boolean(n.is_read),
            category: n.category || "General",
        }));

        const unreadCount = formatted.filter(n => !n.read).length;
        res.json({ notifications: formatted, unreadCount });
    } catch (err) {
        console.error("getNotifications error:", err.message);
        res.status(500).json({ error: "Could not load notifications" });
    }
};

/**
 * GET /api/notifications/unread-count
 * Returns total unread notification count for the logged-in user.
 */
const getUnreadCount = async (req, res) => {
    const userId = req.user.sub;
    try {
        const [rows] = await pool.execute(
            "SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND is_read = 0",
            [userId]
        );
        const unreadCount = rows[0]?.unreadCount || 0;
        res.json({ unreadCount: Number(unreadCount) });
    } catch (err) {
        console.error("getUnreadCount error:", err.message);
        res.status(500).json({ error: "Could not load unread count" });
    }
};

/**
 * PATCH or PUT /api/notifications/:id/read
 * Mark a single notification as read.
 */
const markOneAsRead = async (req, res) => {
    const userId = req.user.sub;
    const notifId = req.params.id;

    try {
        await pool.execute(
            "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
            [notifId, userId]
        );
        res.json({ message: "Notification marked as read", id: notifId });
    } catch (err) {
        console.error("markOneAsRead error:", err.message);
        res.status(500).json({ error: "Could not update notification" });
    }
};

/**
 * POST or PUT /api/notifications/read-all
 * Mark all notifications for logged-in user as read.
 */
const markAllAsRead = async (req, res) => {
    const userId = req.user.sub;
    try {
        await pool.execute(
            "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
            [userId]
        );
        res.json({ message: "All notifications marked as read" });
    } catch (err) {
        console.error("markAllAsRead error:", err.message);
        res.status(500).json({ error: "Could not update notifications" });
    }
};

module.exports = { sendNotification, getNotifications, getUnreadCount, markOneAsRead, markAllAsRead };

