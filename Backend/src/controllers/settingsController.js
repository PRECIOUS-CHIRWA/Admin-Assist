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
    try {
        let [rows] = await pool.execute(
            "SELECT * FROM school_settings WHERE school_id = 1 LIMIT 1"
        );

        if (!rows.length) {
            await ensureSettingsTable();
            let [retryRows] = await pool.execute(
                "SELECT * FROM school_settings WHERE school_id = 1 LIMIT 1"
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

        values.push(1);
        await pool.execute(
            `UPDATE school_settings SET ${fields.join(", ")} WHERE school_id = 1`,
            values
        );

        // Return updated settings
        const [updatedRows] = await pool.execute(
            "SELECT * FROM school_settings WHERE school_id = 1 LIMIT 1"
        );
        const updated = updatedRows.length ? { ...DEFAULTS, ...updatedRows[0] } : DEFAULTS;

        res.json({ message: "Settings saved successfully", settings: updated });
    } catch (err) {
        console.error("updateSettings error:", err.message);
        res.status(500).json({ error: "Could not save settings" });
    }
};

module.exports = { getSettings, updateSettings };
