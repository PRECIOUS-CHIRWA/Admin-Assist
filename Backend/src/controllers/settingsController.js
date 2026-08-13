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
};

// ─── GET /api/settings ────────────────────────────────────────────────────────
const getSettings = async (req, res) => {
    try {
        let [rows] = await pool.execute(
            "SELECT * FROM school_settings WHERE school_id = 1 LIMIT 1"
        );

        if (!rows.length) {
            // Table exists but row not seeded yet — return defaults
            return res.json({ settings: DEFAULTS });
        }

        const row = rows[0];
        // Merge with defaults so missing cols don''t cause undefined
        res.json({ settings: { ...DEFAULTS, ...row } });
    } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
            return res.json({ settings: DEFAULTS });
        }
        console.error("getSettings error:", err.message);
        res.status(500).json({ error: "Could not load settings" });
    }
};

// ─── PUT /api/settings ────────────────────────────────────────────────────────
const updateSettings = async (req, res) => {
    const allowed = [
        "school_name", "school_code", "academic_year_label", "address", "phone", "email",
        "logo_url", "timezone", "date_format", "max_students_per_class", "grading_system",
        "notify_on_enrollment", "notify_on_attendance", "notify_on_results",
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
        // Upsert: insert default row if it doesn''t exist, then update
        await pool.execute(
            "INSERT IGNORE INTO school_settings (school_id, school_name) VALUES (1, ?)",
            [req.body.school_name || DEFAULTS.school_name]
        );
        values.push(1);
        await pool.execute(
            `UPDATE school_settings SET ${fields.join(", ")} WHERE school_id = 1`,
            values
        );
        res.json({ message: "Settings saved successfully" });
    } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
            return res.status(503).json({ error: "Settings table not yet created — run schema.sql first" });
        }
        console.error("updateSettings error:", err.message);
        res.status(500).json({ error: "Could not save settings" });
    }
};

module.exports = { getSettings, updateSettings };
