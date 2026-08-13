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
        let [rows] = await pool.execute(
            `SELECT id, type, title, description, entity_type AS category, is_read, created_at AS timestamp
             FROM notifications
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 30`,
            [userId]
        );

        // If user has no explicit notifications yet, fetch recent audit log entries as notifications
        if (rows.length === 0) {
            try {
                const [auditRows] = await pool.execute(
                    `SELECT al.id, al.action AS title, al.entity_type AS category,
                            CONCAT('Action: ', al.action, IF(u.name IS NOT NULL, CONCAT(' by ', u.name), '')) AS description,
                            al.created_at AS timestamp
                     FROM audit_log al
                     LEFT JOIN users u ON u.id = al.actor_id
                     ORDER BY al.created_at DESC
                     LIMIT 10`
                );
                rows = auditRows.map(a => ({
                    id: `audit-${a.id}`,
                    type: "system",
                    title: a.title,
                    description: a.description,
                    category: a.category || "System",
                    is_read: 0,
                    timestamp: a.timestamp,
                }));
            } catch (auditErr) {
                rows = [];
            }
        }

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
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
const markOneAsRead = async (req, res) => {
    const userId = req.user.sub;
    const notifId = req.params.id;

    if (String(notifId).startsWith("audit-")) {
        return res.json({ message: "Notification marked as read" });
    }

    try {
        await pool.execute(
            "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
            [notifId, userId]
        );
        res.json({ message: "Notification marked as read" });
    } catch (err) {
        console.error("markOneAsRead error:", err.message);
        res.status(500).json({ error: "Could not update notification" });
    }
};

/**
 * POST /api/notifications/read-all
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

module.exports = { sendNotification, getNotifications, markOneAsRead, markAllAsRead };
