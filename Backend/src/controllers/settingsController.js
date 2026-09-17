/**
 * settingsController.js
 * Single-row school settings store (school_settings table).
 *
 * GET  /api/settings      — any authenticated user (read school name, etc.)
 * PUT  /api/settings      — admin or headmaster only
 */
"use strict";

const pool = require("../config/db");

const DEFAULTS = {
    school_name:          "Admin Assist School",
    school_code:          null,
    department:           null,
    country:              "Zambia",
    academic_year_label:  null,
    address:              null,
    phone:                null,
    email:                null,
    logo_url:             null,
    timezone:             "Africa/Lusaka",
    date_format:          "DD/MM/YYYY",
    max_students_per_class: 40,
    grading_system:       "ECZ",
    notify_on_enrollment: 1,
    notify_on_attendance: 1,
    notify_on_results:    1,
    notify_on_announcements: 1,
    max_login_attempts:   5,
};

/**
 * Self-healing helper: ensures school_settings table exists with all required columns
 */
const ensureSettingsTable = async () => {
    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS school_settings (
                id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
                school_id               INT UNSIGNED NOT NULL DEFAULT 1,
                school_name             VARCHAR(255)          DEFAULT 'Admin Assist School',
                school_code             VARCHAR(50)           DEFAULT NULL,
                department              VARCHAR(100)          DEFAULT NULL,
                country                 VARCHAR(100)          DEFAULT 'Zambia',
                academic_year_label     VARCHAR(20)           DEFAULT NULL,
                address                 TEXT                  DEFAULT NULL,
                phone                   VARCHAR(30)           DEFAULT NULL,
                email                   VARCHAR(255)          DEFAULT NULL,
                logo_url                VARCHAR(500)          DEFAULT NULL,
                timezone                VARCHAR(100)          DEFAULT 'Africa/Lusaka',
                date_format             VARCHAR(30)           DEFAULT 'DD/MM/YYYY',
                max_students_per_class  INT UNSIGNED          DEFAULT 40,
                grading_system          VARCHAR(20)           DEFAULT 'ECZ',
                notify_on_enrollment    TINYINT(1)           DEFAULT 1,
                notify_on_attendance    TINYINT(1)           DEFAULT 1,
                notify_on_results       TINYINT(1)           DEFAULT 1,
                notify_on_announcements TINYINT(1)           DEFAULT 1,
                max_login_attempts      TINYINT UNSIGNED     DEFAULT 5,
                updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_school_id (school_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Check if any row exists, if not seed default row
        const [rows] = await pool.execute("SELECT id FROM school_settings WHERE school_id = 1 LIMIT 1");
        if (!rows.length) {
            await pool.execute(`
                INSERT INTO school_settings (school_id, school_name, timezone, country, grading_system)
                VALUES (1, 'Admin Assist School', 'Africa/Lusaka', 'Zambia', 'ECZ')
            `);
        }
    } catch (err) {
        console.warn("ensureSettingsTable notice:", err.message);
    }
};

// ─── GET /api/settings ────────────────────────────────────────────────────────
const getSettings = async (req, res) => {
    const schoolId = (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;
    try {
        let [rows] = await pool.execute(
            "SELECT * FROM school_settings WHERE school_id = ? LIMIT 1",
            [schoolId]
        );

        if (!rows.length) {
            await ensureSettingsTable();
            let [retryRows] = await pool.execute(
                "SELECT * FROM school_settings WHERE school_id = ? LIMIT 1",
                [schoolId]
            );
            const row = retryRows.length ? retryRows[0] : {};
            return res.json({ settings: { ...DEFAULTS, ...row } });
        }

        const row = rows[0];
        res.json({ settings: { ...DEFAULTS, ...row } });
    } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
            await ensureSettingsTable();
            return res.json({ settings: DEFAULTS });
        }
        console.error("getSettings error:", err.message);
        res.status(500).json({ error: "Could not load settings" });
    }
};

// ─── PUT /api/settings ────────────────────────────────────────────────────────
const updateSettings = async (req, res) => {
    const schoolId = (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;
    const allowed = [
        "school_name", "school_code", "department", "country", "academic_year_label", "address", "phone", "email",
        "logo_url", "timezone", "date_format", "max_students_per_class", "grading_system",
        "notify_on_enrollment", "notify_on_attendance", "notify_on_results", "notify_on_announcements",
        "max_login_attempts",
    ];

    const fields = [];
    const values = [];

    for (const key of allowed) {
        if (req.body[key] !== undefined) {
            fields.push(`${key} = ?`);
            values.push(req.body[key]);
        }
    }

    if (!fields.length) return res.status(400).json({ error: "No valid fields to update" });

    try {
        await ensureSettingsTable();

        values.push(schoolId);
        await pool.execute(
            `UPDATE school_settings SET ${fields.join(", ")} WHERE school_id = ?`,
            values
        );

        // Return updated settings
        const [updatedRows] = await pool.execute(
            "SELECT * FROM school_settings WHERE school_id = ? LIMIT 1",
            [schoolId]
        );
        const updated = updatedRows.length ? { ...DEFAULTS, ...updatedRows[0] } : DEFAULTS;

        res.json({ message: "Settings saved successfully", settings: updated });
    } catch (err) {
        console.error("updateSettings error:", err.message);
        res.status(500).json({ error: "Could not save settings" });
    }
};

const { buildHumanReadableDescription } = require("./dashboardController");

/**
 * Sanitizes any sensitive keys from log detail objects or strings.
 * Guarantees passwords, hashes, tokens, secrets, and credentials are never exposed.
 */
function sanitizeDetails(details) {
    if (!details) return null;
    let parsed = details;
    if (typeof details === "string") {
        try {
            parsed = JSON.parse(details);
        } catch {
            return details.replace(/(password|token|hash|secret|auth)\s*[:=]\s*["']?[^"',\s}]+["']?/gi, "$1: [REDACTED]");
        }
    }

    if (typeof parsed !== "object" || parsed === null) return parsed;

    const sanitized = Array.isArray(parsed) ? [] : {};
    const SENSITIVE_KEYS = /password|hash|token|secret|salt|cookie|credential|authorization/i;

    for (const [key, val] of Object.entries(parsed)) {
        if (SENSITIVE_KEYS.test(key)) {
            continue;
        }
        if (val && typeof val === "object") {
            sanitized[key] = sanitizeDetails(val);
        } else {
            sanitized[key] = val;
        }
    }
    return sanitized;
}

/**
 * Formats a user-friendly activity label.
 */
function formatLogAction(action, entityType) {
    if (!action) return "System Activity";
    const act = action.toLowerCase();
    if (act.includes("result")) return "Result Submission";
    if (act.includes("attendance")) return "Attendance Submission";
    if (act.includes("profile") || act.includes("update_user")) return "Profile Update";
    if (act.includes("setting")) return "Settings Change";
    if (act.includes("report")) return "Report Generation";
    if (act.includes("login") || act.includes("auth")) return "Account Security Event";
    if (act.includes("enroll") || act.includes("student")) return "Student Enrollment";
    if (act.includes("timetable")) return "Timetable Update";
    return action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * GET /api/settings/logs
 * Query params:
 *   - mode: "week" (default: max 5 logs for current week) or "all" (full historical logs)
 *   - page: integer (default 1, for mode="all")
 *   - limit: integer (default 20, max 100, for mode="all")
 *   - fromDate: YYYY-MM-DD
 *   - toDate: YYYY-MM-DD
 *   - search: text search across actions and actors
 *
 * Returns role- and school-scoped audit logs with all credentials sanitized and human-readable descriptions.
 */
const getRecentLogs = async (req, res) => {
    try {
        const schoolId = (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;
        const role = req.user?.role || "user";
        const userId = req.user?.sub || req.user?.id;
        const mode = (req.query.mode || "week").toLowerCase();

        // Check if audit_log table exists
        const [tables] = await pool.execute(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_log'"
        ).catch(() => [[]]);

        if (!tables.length) {
            return res.json({ logs: [], total: 0, mode });
        }

        const whereClauses = [];
        const params = [];

        // 1. Role-aware school and user scoping
        if (role === "admin" || role === "headmaster") {
            if (mode === "week") {
                // Compact preview belongs to the authenticated Admin
                whereClauses.push("al.actor_id = ? AND (u.school_id = ? OR u.school_id IS NULL)");
                params.push(userId, schoolId);
            } else {
                // View All Logs: authorized school-level administrative history
                whereClauses.push("(u.school_id = ? OR u.school_id IS NULL OR al.actor_id IS NULL)");
                params.push(schoolId);
            }
        } else if (role === "staff") {
            whereClauses.push("al.actor_id = ?");
            params.push(userId);
        } else {
            whereClauses.push("al.actor_id = ?");
            params.push(userId);
        }

        // 2. Week vs All filtering
        if (mode === "week") {
            // Monday-Sunday of current week
            whereClauses.push("YEARWEEK(al.created_at, 1) = YEARWEEK(CURDATE(), 1)");
        } else {
            // Optional date filters
            if (req.query.fromDate) {
                whereClauses.push("al.created_at >= ?");
                params.push(`${req.query.fromDate} 00:00:00`);
            }
            if (req.query.toDate) {
                whereClauses.push("al.created_at <= ?");
                params.push(`${req.query.toDate} 23:59:59`);
            }
            if (req.query.search) {
                whereClauses.push("(al.action LIKE ? OR u.name LIKE ? OR al.entity_type LIKE ?)");
                const term = `%${req.query.search.trim()}%`;
                params.push(term, term, term);
            }
        }

        const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

        // Determine limits
        let limit = 5;
        let offset = 0;
        let page = 1;
        let total = 0;

        if (mode === "all") {
            page = Math.max(1, parseInt(req.query.page, 10) || 1);
            limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
            offset = (page - 1) * limit;

            // Total count query
            const countQuery = `
                SELECT COUNT(*) AS total
                FROM audit_log al
                LEFT JOIN users u ON u.id = al.actor_id
                ${whereSql}
            `;
            const [[countResult]] = await pool.execute(countQuery, params);
            total = Number(countResult?.total) || 0;
        }

        const query = `
            SELECT al.id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
                   u.name AS actor_name, u.email AS actor_email, u.role AS actor_role
            FROM audit_log al
            LEFT JOIN users u ON u.id = al.actor_id
            ${whereSql}
            ORDER BY al.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const queryParams = [...params, limit, offset];
        const [rows] = await pool.query(query, queryParams);

        if (mode === "week") {
            total = rows.length;
        }

        const logs = await Promise.all(rows.map(async r => {
            const sanitized = sanitizeDetails(r.details);
            let humanDesc = "";
            try {
                humanDesc = await buildHumanReadableDescription(r);
            } catch (e) {
                humanDesc = formatLogAction(r.action, r.entity_type);
            }
            return {
                id: r.id,
                action: r.action,
                action_display: humanDesc,
                description: humanDesc,
                entity_type: r.entity_type,
                entity_id: r.entity_id,
                actor_name: r.actor_name || "System",
                actor_role: r.actor_role || "system",
                actor_email: r.actor_email ? r.actor_email.replace(/^(.{2})(.*)(@.*)$/, "$1***$3") : null,
                details: sanitized,
                created_at: r.created_at
            };
        }));

        res.json({
            logs,
            total,
            page: mode === "all" ? page : 1,
            limit: mode === "all" ? limit : 5,
            totalPages: mode === "all" ? Math.ceil(total / limit) : 1,
            mode
        });
    } catch (err) {
        console.error("getRecentLogs error:", err.message);
        res.status(500).json({ error: "Could not retrieve audit logs" });
    }
};

module.exports = { getSettings, updateSettings, getRecentLogs };
