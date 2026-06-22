// Backend/src/controllers/dashboardController.js
const pool = require("../config/db");

/**
 * GET /api/dashboard/stats
 * Returns live counts for the dashboard stat cards.
 */
const getDashboardStats = async (req, res) => {
    try {
        const [[{ totalStudents }]] = await pool.execute(
            "SELECT COUNT(*) AS totalStudents FROM students WHERE status != 'Inactive'"
        );
        const [[{ totalTeachers }]] = await pool.execute(
            "SELECT COUNT(*) AS totalTeachers FROM users WHERE role = 'staff' AND is_active = 1"
        );
        const [[{ pendingEnrollments }]] = await pool.execute(
            "SELECT COUNT(*) AS pendingEnrollments FROM students WHERE status = 'Suspended'"
        );
        const [[{ pendingApprovals }]] = await pool.execute(
            "SELECT COUNT(*) AS pendingApprovals FROM users WHERE is_active = 0"
        );

        res.json({ totalStudents, totalTeachers, pendingEnrollments, pendingApprovals });
    } catch (err) {
        console.error("getDashboardStats error:", err.message);
        res.status(500).json({ error: "Failed to load dashboard statistics" });
    }
};

/**
 * GET /api/dashboard/recent-activity
 * Returns the 10 most recent audit log entries.
 */
const getRecentActivity = async (req, res) => {
    try {
        // Check if audit_log table exists before querying
        const [tables] = await pool.execute(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_log'"
        );

        if (!tables.length) {
            // Table not yet created — return empty list gracefully
            return res.json({ activities: [] });
        }

        const [rows] = await pool.execute(
            `SELECT al.id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
                    u.fullName AS actorName, u.role AS actorRole
             FROM audit_log al
             LEFT JOIN users u ON u.id = al.actor_id
             ORDER BY al.created_at DESC
             LIMIT 10`
        );

        const activities = rows.map((row) => ({
            id: row.id,
            action: row.action,
            entityType: row.entity_type,
            entityId: row.entity_id,
            details: row.details,
            actorName: row.actor_name,
            actorRole: row.actor_role,
            createdAt: row.created_at,
            description: buildDescription(row),
        }));

        res.json({ activities });
    } catch (err) {
        console.error("getRecentActivity error:", err.message);
        res.status(500).json({ error: "Failed to load recent activity" });
    }
};

function buildDescription(row) {
    switch (row.action) {
        case 'CREATE':
            return `${row.entity_type} created`;
        case 'UPDATE':
            return `${row.entity_type} updated`;
        case 'DELETE':
            return `${row.entity_type} deleted`;
        case 'LOGIN':
            return `${row.entity_type} logged in`;
        case 'LOGOUT':
            return `${row.entity_type} logged out`;
        case 'ASSIGN':
            return `${row.entity_type} assigned`;
        case 'REVOKE':
            return `${row.entity_type} revoked`;
        case 'SUSPEND':
            return `${row.entity_type} suspended`;
        case 'RESTORE':
            return `${row.entity_type} restored`;
        default:
            return `${row.entity_type} ${row.action.toLowerCase()}`;
    }
}

module.exports = { getDashboardStats, getRecentActivity };
