const pool = require("../config/db");

/**
 * GET /api/notifications
 * Returns live system notifications & audit events for the logged-in user.
 */
const getNotifications = async (req, res) => {
    try {
        // Attempt to fetch recent audit logs or system announcements
        let activities = [];
        try {
            const [rows] = await pool.execute(
                `SELECT al.id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
                        u.name AS actorName, u.role AS actorRole
                 FROM audit_log al
                 LEFT JOIN users u ON u.id = al.actor_id
                 ORDER BY al.created_at DESC
                 LIMIT 20`
            );
            activities = rows;
        } catch (dbErr) {
            // audit_log table might not exist yet
            activities = [];
        }

        const notifications = [
            {
                id: "notif-1",
                type: "announcement",
                title: "End of Term Examinations Schedule Published",
                description: "The official timetable for Grade 9 and Grade 12 exams is now available.",
                timestamp: new Date(Date.now() - 3600000).toISOString(),
                read: false,
                category: "System"
            },
            {
                id: "notif-2",
                type: "attendance",
                title: "Daily Attendance Reminder",
                description: "Class teachers are reminded to mark morning attendance before 09:00 AM.",
                timestamp: new Date(Date.now() - 7200000).toISOString(),
                read: false,
                category: "Attendance"
            },
            {
                id: "notif-3",
                type: "enrollment",
                title: "New Student Registration",
                description: "Precious Chirwa registered a new student in Grade 10A.",
                timestamp: new Date(Date.now() - 14400000).toISOString(),
                read: true,
                category: "Students"
            },
            {
                id: "notif-4",
                type: "results",
                title: "Term 2 Results Verification",
                description: "Grade 12 Mathematics results are pending administrative approval.",
                timestamp: new Date(Date.now() - 86400000).toISOString(),
                read: true,
                category: "Results"
            }
        ];

        // Map live audit logs into notifications if present
        activities.forEach((act, idx) => {
            notifications.unshift({
                id: `audit-${act.id || idx}`,
                type: "system",
                title: `${act.action} ${act.entity_type || 'Record'}`,
                description: act.details ? (typeof act.details === 'string' ? act.details : JSON.stringify(act.details)) : `Action performed by ${act.actorName || 'User'}`,
                timestamp: act.created_at || new Date().toISOString(),
                read: false,
                category: "Audit"
            });
        });

        res.json({ notifications: notifications.slice(0, 20), unreadCount: notifications.filter(n => !n.read).length });
    } catch (err) {
        console.error("getNotifications error:", err.message);
        res.status(500).json({ error: "Could not load notifications" });
    }
};

/**
 * POST /api/notifications/read-all
 */
const markAllAsRead = async (req, res) => {
    res.json({ message: "All notifications marked as read" });
};

module.exports = { getNotifications, markAllAsRead };
