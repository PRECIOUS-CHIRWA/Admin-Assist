/**
 * timetableController.js — School Timetable Management & Teacher Scoping
 *
 * Endpoints:
 *   GET    /api/timetable/my/today   — Teacher: today's schedule
 *   GET    /api/timetable/my/week    — Teacher: full weekly schedule
 *   GET    /api/timetable            — Admin: list timetable entries with filters
 *   POST   /api/timetable            — Admin: create timetable entry with conflict checks
 *   PUT    /api/timetable/:id        — Admin: update timetable entry with conflict checks
 *   DELETE /api/timetable/:id        — Admin: delete timetable entry
 */
"use strict";

const pool = require("../config/db");

const VALID_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Helper to get current day and formatted date in Africa/Lusaka (Zambia)
 */
function getZambianCurrentDayAndDate() {
    const now = new Date();
    const dayFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Lusaka",
        weekday: "long"
    });
    const dateFormatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Lusaka",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });

    return {
        dayName: dayFormatter.format(now),
        formattedDate: dateFormatter.format(now)
    };
}

/**
 * Normalise time to HH:MM:SS
 */
function normalizeTime(t) {
    if (!t) return "";
    const parts = t.trim().split(":");
    const h = parts[0].padStart(2, "0");
    const m = (parts[1] || "00").padStart(2, "0");
    const s = (parts[2] || "00").padStart(2, "0");
    return `${h}:${m}:${s}`;
}

/**
 * GET /api/timetable/my/today
 * Staff/Teacher: Get timetable for today (or optional requested day)
 */
const getMyTodayTimetable = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const teacherId = req.user?.sub;

        if (!teacherId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { dayName: todayDay, formattedDate } = getZambianCurrentDayAndDate();
        let queryDay = req.query.day;
        if (!queryDay || !VALID_DAYS.includes(queryDay)) {
            queryDay = todayDay;
        }

        const [rows] = await pool.execute(
            `SELECT tt.id, tt.day_of_week, tt.start_time, tt.end_time, tt.room, tt.is_active,
                    tt.class_id, tt.subject_id,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    c.grade_level, c.stream,
                    s.subject_name, s.subject_code
             FROM timetables tt
             JOIN classes c ON c.id = tt.class_id
             JOIN subjects s ON s.id = tt.subject_id
             WHERE tt.teacher_id = ? AND tt.school_id = ? AND tt.day_of_week = ? AND tt.is_active = 1
             ORDER BY tt.start_time ASC`,
            [teacherId, schoolId, queryDay]
        );

        // Format times for display (HH:MM)
        const formatted = rows.map(r => ({
            ...r,
            start_time_formatted: (r.start_time || "").substring(0, 5),
            end_time_formatted: (r.end_time || "").substring(0, 5)
        }));

        res.json({
            day: queryDay,
            is_today: queryDay.toLowerCase() === todayDay.toLowerCase(),
            date_formatted: formattedDate,
            count: formatted.length,
            timetable: formatted
        });
    } catch (err) {
        console.error("getMyTodayTimetable error:", err.message);
        res.status(500).json({ error: "Failed to load today's timetable" });
    }
};

/**
 * GET /api/timetable/my/week
 * Staff/Teacher: Full weekly timetable grouped by day
 */
const getMyWeekTimetable = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const teacherId = req.user?.sub;

        if (!teacherId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const [rows] = await pool.execute(
            `SELECT tt.id, tt.day_of_week, tt.start_time, tt.end_time, tt.room, tt.is_active,
                    tt.class_id, tt.subject_id,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    c.grade_level, c.stream,
                    s.subject_name, s.subject_code
             FROM timetables tt
             JOIN classes c ON c.id = tt.class_id
             JOIN subjects s ON s.id = tt.subject_id
             WHERE tt.teacher_id = ? AND tt.school_id = ? AND tt.is_active = 1
             ORDER BY FIELD(tt.day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'), tt.start_time ASC`,
            [teacherId, schoolId]
        );

        const formatted = rows.map(r => ({
            ...r,
            start_time_formatted: (r.start_time || "").substring(0, 5),
            end_time_formatted: (r.end_time || "").substring(0, 5)
        }));

        res.json({
            count: formatted.length,
            timetable: formatted
        });
    } catch (err) {
        console.error("getMyWeekTimetable error:", err.message);
        res.status(500).json({ error: "Failed to load weekly timetable" });
    }
};

/**
 * GET /api/timetable
 * Admin / Headmaster: List timetable entries with optional filters
 */
const listTimetables = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const { class_id, teacher_id, subject_id, day_of_week } = req.query;

        let where = ["tt.school_id = ?"];
        let params = [schoolId];

        if (class_id) {
            where.push("tt.class_id = ?");
            params.push(class_id);
        }
        if (teacher_id) {
            where.push("tt.teacher_id = ?");
            params.push(teacher_id);
        }
        if (subject_id) {
            where.push("tt.subject_id = ?");
            params.push(subject_id);
        }
        if (day_of_week && VALID_DAYS.includes(day_of_week)) {
            where.push("tt.day_of_week = ?");
            params.push(day_of_week);
        }

        const [rows] = await pool.execute(
            `SELECT tt.id, tt.day_of_week, tt.start_time, tt.end_time, tt.room, tt.is_active,
                    tt.class_id, tt.subject_id, tt.teacher_id,
                    u.name AS teacher_name,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    c.grade_level, c.stream,
                    s.subject_name, s.subject_code
             FROM timetables tt
             JOIN users u ON u.id = tt.teacher_id
             JOIN classes c ON c.id = tt.class_id
             JOIN subjects s ON s.id = tt.subject_id
             WHERE ${where.join(" AND ")}
             ORDER BY FIELD(tt.day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'), tt.start_time ASC`,
            params
        );

        const formatted = rows.map(r => ({
            ...r,
            start_time_formatted: (r.start_time || "").substring(0, 5),
            end_time_formatted: (r.end_time || "").substring(0, 5)
        }));

        res.json({
            count: formatted.length,
            timetable: formatted
        });
    } catch (err) {
        console.error("listTimetables error:", err.message);
        res.status(500).json({ error: "Failed to load timetables" });
    }
};

/**
 * POST /api/timetable
 * Admin / Headmaster: Create a new timetable entry with conflict detection
 */
const createTimetableEntry = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const { teacher_id, class_id, subject_id, day_of_week, start_time, end_time, room } = req.body;

        if (!teacher_id || !class_id || !subject_id || !day_of_week || !start_time || !end_time) {
            return res.status(400).json({
                error: "Missing required fields: teacher_id, class_id, subject_id, day_of_week, start_time, end_time"
            });
        }

        if (!VALID_DAYS.includes(day_of_week)) {
            return res.status(400).json({
                error: `Invalid day_of_week. Must be one of: ${VALID_DAYS.join(", ")}`
            });
        }

        const normStart = normalizeTime(start_time);
        const normEnd = normalizeTime(end_time);

        if (normStart >= normEnd) {
            return res.status(400).json({ error: "End time must be after start time" });
        }

        // 1. Conflict Check: Is the teacher already booked for another class during this time?
        const [teacherConflicts] = await pool.execute(
            `SELECT tt.id, tt.start_time, tt.end_time,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    s.subject_name
             FROM timetables tt
             JOIN classes c ON c.id = tt.class_id
             JOIN subjects s ON s.id = tt.subject_id
             WHERE tt.school_id = ? AND tt.teacher_id = ? AND tt.day_of_week = ? AND tt.is_active = 1
               AND (tt.start_time < ? AND tt.end_time > ?)
             LIMIT 1`,
            [schoolId, teacher_id, day_of_week, normEnd, normStart]
        );

        if (teacherConflicts.length > 0) {
            const conf = teacherConflicts[0];
            return res.status(409).json({
                error: `Teacher conflict: already scheduled for ${conf.class_name} (${conf.subject_name}) from ${conf.start_time.substring(0, 5)} to ${conf.end_time.substring(0, 5)}`
            });
        }

        // 2. Conflict Check: Does the class already have a subject during this time?
        const [classConflicts] = await pool.execute(
            `SELECT tt.id, tt.start_time, tt.end_time,
                    u.name AS teacher_name,
                    s.subject_name
             FROM timetables tt
             JOIN users u ON u.id = tt.teacher_id
             JOIN subjects s ON s.id = tt.subject_id
             WHERE tt.school_id = ? AND tt.class_id = ? AND tt.day_of_week = ? AND tt.is_active = 1
               AND (tt.start_time < ? AND tt.end_time > ?)
             LIMIT 1`,
            [schoolId, class_id, day_of_week, normEnd, normStart]
        );

        if (classConflicts.length > 0) {
            const conf = classConflicts[0];
            return res.status(409).json({
                error: `Class conflict: class is already taking ${conf.subject_name} with ${conf.teacher_name} from ${conf.start_time.substring(0, 5)} to ${conf.end_time.substring(0, 5)}`
            });
        }

        // Insert new entry
        const [result] = await pool.execute(
            `INSERT INTO timetables (school_id, academic_year_id, teacher_id, class_id, subject_id, day_of_week, start_time, end_time, room, is_active)
             VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [schoolId, teacher_id, class_id, subject_id, day_of_week, normStart, normEnd, room ? room.trim() : null]
        );

        res.status(201).json({
            message: "Timetable entry created successfully",
            id: result.insertId
        });
    } catch (err) {
        console.error("createTimetableEntry error:", err.message);
        res.status(500).json({ error: "Failed to create timetable entry" });
    }
};

/**
 * PUT /api/timetable/:id
 * Admin / Headmaster: Update a timetable entry with conflict checks
 */
const updateTimetableEntry = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const entryId = req.params.id;
        const { teacher_id, class_id, subject_id, day_of_week, start_time, end_time, room, is_active } = req.body;

        const [[existing]] = await pool.execute(
            `SELECT * FROM timetables WHERE id = ? AND school_id = ? LIMIT 1`,
            [entryId, schoolId]
        );
        if (!existing) {
            return res.status(404).json({ error: "Timetable entry not found" });
        }

        const newTeacherId = teacher_id || existing.teacher_id;
        const newClassId = class_id || existing.class_id;
        const newSubjectId = subject_id || existing.subject_id;
        const newDay = day_of_week || existing.day_of_week;
        const normStart = start_time ? normalizeTime(start_time) : existing.start_time;
        const normEnd = end_time ? normalizeTime(end_time) : existing.end_time;
        const newRoom = room !== undefined ? (room ? room.trim() : null) : existing.room;
        const newActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;

        if (!VALID_DAYS.includes(newDay)) {
            return res.status(400).json({ error: `Invalid day_of_week. Must be one of: ${VALID_DAYS.join(", ")}` });
        }
        if (normStart >= normEnd) {
            return res.status(400).json({ error: "End time must be after start time" });
        }

        if (newActive === 1) {
            // Teacher conflict check
            const [teacherConflicts] = await pool.execute(
                `SELECT tt.id, tt.start_time, tt.end_time,
                        CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                        s.subject_name
                 FROM timetables tt
                 JOIN classes c ON c.id = tt.class_id
                 JOIN subjects s ON s.id = tt.subject_id
                 WHERE tt.school_id = ? AND tt.teacher_id = ? AND tt.day_of_week = ? AND tt.is_active = 1
                   AND tt.id != ?
                   AND (tt.start_time < ? AND tt.end_time > ?)
                 LIMIT 1`,
                [schoolId, newTeacherId, newDay, entryId, normEnd, normStart]
            );

            if (teacherConflicts.length > 0) {
                const conf = teacherConflicts[0];
                return res.status(409).json({
                    error: `Teacher conflict: already scheduled for ${conf.class_name} (${conf.subject_name}) from ${conf.start_time.substring(0, 5)} to ${conf.end_time.substring(0, 5)}`
                });
            }

            // Class conflict check
            const [classConflicts] = await pool.execute(
                `SELECT tt.id, tt.start_time, tt.end_time,
                        u.name AS teacher_name,
                        s.subject_name
                 FROM timetables tt
                 JOIN users u ON u.id = tt.teacher_id
                 JOIN subjects s ON s.id = tt.subject_id
                 WHERE tt.school_id = ? AND tt.class_id = ? AND tt.day_of_week = ? AND tt.is_active = 1
                   AND tt.id != ?
                   AND (tt.start_time < ? AND tt.end_time > ?)
                 LIMIT 1`,
                [schoolId, newClassId, newDay, entryId, normEnd, normStart]
            );

            if (classConflicts.length > 0) {
                const conf = classConflicts[0];
                return res.status(409).json({
                    error: `Class conflict: class is already taking ${conf.subject_name} with ${conf.teacher_name} from ${conf.start_time.substring(0, 5)} to ${conf.end_time.substring(0, 5)}`
                });
            }
        }

        await pool.execute(
            `UPDATE timetables
             SET teacher_id = ?, class_id = ?, subject_id = ?, day_of_week = ?,
                 start_time = ?, end_time = ?, room = ?, is_active = ?
             WHERE id = ? AND school_id = ?`,
            [newTeacherId, newClassId, newSubjectId, newDay, normStart, normEnd, newRoom, newActive, entryId, schoolId]
        );

        res.json({ message: "Timetable entry updated successfully" });
    } catch (err) {
        console.error("updateTimetableEntry error:", err.message);
        res.status(500).json({ error: "Failed to update timetable entry" });
    }
};

/**
 * DELETE /api/timetable/:id
 * Admin / Headmaster: Delete a timetable entry
 */
const deleteTimetableEntry = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const entryId = req.params.id;

        const [result] = await pool.execute(
            `DELETE FROM timetables WHERE id = ? AND school_id = ?`,
            [entryId, schoolId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Timetable entry not found" });
        }

        res.json({ message: "Timetable entry deleted successfully" });
    } catch (err) {
        console.error("deleteTimetableEntry error:", err.message);
        res.status(500).json({ error: "Failed to delete timetable entry" });
    }
};

module.exports = {
    getMyTodayTimetable,
    getMyWeekTimetable,
    listTimetables,
    createTimetableEntry,
    updateTimetableEntry,
    deleteTimetableEntry,
    VALID_DAYS,
    normalizeTime,
    getZambianCurrentDayAndDate
};
