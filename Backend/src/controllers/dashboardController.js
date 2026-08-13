// Backend/src/controllers/dashboardController.js
const pool = require("../config/db");

/**
 * GET /api/dashboard/stats
 * Returns all live counts needed by the dashboard stat cards.
 */
const getDashboardStats = async (req, res) => {
    try {
        const [[{ totalStudents }]] = await pool.execute(
            "SELECT COUNT(*) AS totalStudents FROM students WHERE status != 'Inactive'"
        );

        const [[{ totalTeachers }]] = await pool.execute(
            "SELECT COUNT(*) AS totalTeachers FROM users WHERE role IN ('staff', 'headmaster') AND is_active = 1"
        );

        const [[{ totalClasses }]] = await pool.execute(
            "SELECT COUNT(*) AS totalClasses FROM classes"
        );

        const [[{ pendingEnrollments }]] = await pool.execute(
            "SELECT COUNT(*) AS pendingEnrollments FROM students WHERE status = 'Suspended'"
        );

        const [[{ pendingApprovals }]] = await pool.execute(
            "SELECT COUNT(*) AS pendingApprovals FROM users WHERE is_active = 0"
        );

        // Today's attendance overview
        const [[attendanceToday]] = await pool.execute(
            `SELECT
                COALESCE(SUM(ar.status = 'present'), 0) AS todayPresent,
                COALESCE(SUM(ar.status = 'absent'),  0) AS todayAbsent,
                COALESCE(SUM(ar.status = 'late'),    0) AS todayLate,
                COUNT(ar.id)                            AS todayTotal
             FROM attendance_records ar
             JOIN attendance_sessions s ON s.id = ar.session_id
             WHERE s.attendance_date = CURDATE()`
        );

        const [[{ newAdmissions }]] = await pool.execute(
            `SELECT COUNT(*) AS newAdmissions FROM students
             WHERE MONTH(enrollment_date) = MONTH(CURDATE())
               AND YEAR(enrollment_date)  = YEAR(CURDATE())`
        );

        const todayTotal = Number(attendanceToday.todayTotal) || 0;
        const attendanceRate = todayTotal > 0
            ? Math.round((attendanceToday.todayPresent / todayTotal) * 100)
            : 0;

        res.json({
            totalStudents,
            totalTeachers,
            totalClasses,
            pendingEnrollments,
            pendingApprovals,
            todayPresent: Number(attendanceToday.todayPresent),
            todayAbsent: Number(attendanceToday.todayAbsent),
            todayLate: Number(attendanceToday.todayLate),
            todayTotal,
            attendanceRate,
            newAdmissions: Number(newAdmissions),
        });
    } catch (err) {
        console.error("getDashboardStats error:", err.message);
        res.status(500).json({ error: "Failed to load dashboard statistics" });
    }
};

/**
 * GET /api/dashboard/recent-activity
 * Returns the 10 most recent audit log entries as a plain array.
 */
const getRecentActivity = async (req, res) => {
    try {
        const [tables] = await pool.execute(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_log'"
        );

        // Always return a plain array — frontend uses Array.isArray() check
        if (!tables.length) {
            return res.json([]);
        }

        const [rows] = await pool.execute(
            `SELECT al.id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
                    u.name AS actorName, u.role AS actorRole
             FROM   audit_log al
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
            actorName: row.actorName,
            actorRole: row.actorRole,
            createdAt: row.created_at,
            description: _buildDescription(row),
        }));

        res.json(activities);
    } catch (err) {
        console.error("getRecentActivity error:", err.message);
        res.status(500).json({ error: "Failed to load recent activity" });
    }
};

function _buildDescription(row) {
    const entity = row.entity_type || "Record";
    switch (row.action) {
        case "CREATE": return `${entity} created`;
        case "UPDATE": return `${entity} updated`;
        case "DELETE": return `${entity} deleted`;
        case "LOGIN": return `Logged in`;
        case "LOGOUT": return `Logged out`;
        case "ASSIGN": return `${entity} assigned`;
        case "REVOKE": return `${entity} revoked`;
        case "SUSPEND": return `${entity} suspended`;
        case "RESTORE": return `${entity} restored`;
        default: return `${entity} ${String(row.action).toLowerCase()}`;
    }
}

module.exports = { getDashboardStats, getRecentActivity };