/**
 * timetableController.js — School Timetable Management, Conflict Validation,
 * Teacher-Scoping & Student-Class Timetable Access.
 *
 * Endpoints:
 *   GET    /api/timetable/my/today   — Teacher / Student: today's schedule
 *   GET    /api/timetable/my/week    — Teacher / Student: full weekly schedule
 *   GET    /api/timetable            — Admin: list timetable entries with filters
 *   POST   /api/timetable            — Admin: create timetable entry with strict conflict checks
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
 * Audit log writer helper
 */
async function writeAuditLog(actorId, action, entityType, entityId, details) {
    try {
        await pool.execute(
            `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
             VALUES (?, ?, ?, ?, ?)`,
            [actorId, action, entityType, entityId, details ? JSON.stringify(details) : null]
        );
    } catch {
        // non-fatal
    }
}

/**
 * GET /api/timetable/my/today
 * Supports Staff (teacher's own teaching schedule) AND Unified Student/Guardian (class schedule).
 */
const getMyTodayTimetable = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const userId = req.user?.sub || req.user?.id;
        const role = req.user?.role || "user";

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { dayName: todayDay, formattedDate } = getZambianCurrentDayAndDate();
        let queryDay = req.query.day;
        if (!queryDay || !VALID_DAYS.includes(queryDay)) {
            queryDay = todayDay;
        }

        let rows = [];

        // ── 1. UNIFIED STUDENT / PARENT USER ('user') ──────────────────────
        if (role === "user") {
            const [[student]] = await pool.execute(
                `SELECT s.id, s.class_id,
                        CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name
                 FROM students s
                 LEFT JOIN classes c ON c.id = s.class_id
                 WHERE s.user_id = ? AND s.school_id = ?
                 LIMIT 1`,
                [userId, schoolId]
            );

            if (student && student.class_id) {
                const [ttRows] = await pool.execute(
                    `SELECT tt.id, tt.day_of_week, tt.start_time, tt.end_time, tt.room, tt.is_active,
                            tt.class_id, tt.subject_id, tt.teacher_id,
                            u.name AS teacher_name,
                            CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                            c.grade_level, c.stream,
                            s.subject_name, s.subject_code
                     FROM timetables tt
                     JOIN classes c ON c.id = tt.class_id
                     JOIN subjects s ON s.id = tt.subject_id
                     JOIN users u ON u.id = tt.teacher_id
                     WHERE tt.class_id = ? AND tt.school_id = ? AND tt.day_of_week = ? AND tt.is_active = 1
                     ORDER BY tt.start_time ASC`,
                    [student.class_id, schoolId, queryDay]
                );
                rows = ttRows;
            }
        } else {
            // ── 2. STAFF / TEACHER ──────────────────────────────────────────
            const [ttRows] = await pool.execute(
                `SELECT tt.id, tt.day_of_week, tt.start_time, tt.end_time, tt.room, tt.is_active,
                        tt.class_id, tt.subject_id, tt.teacher_id,
                        u.name AS teacher_name,
                        CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                        c.grade_level, c.stream,
                        s.subject_name, s.subject_code
                 FROM timetables tt
                 JOIN classes c ON c.id = tt.class_id
                 JOIN subjects s ON s.id = tt.subject_id
                 JOIN users u ON u.id = tt.teacher_id
                 WHERE tt.teacher_id = ? AND tt.school_id = ? AND tt.day_of_week = ? AND tt.is_active = 1
                 ORDER BY tt.start_time ASC`,
                [userId, schoolId, queryDay]
            );
            rows = ttRows;
        }

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
 * Staff: full weekly schedule across all assigned classes.
 * Student: full weekly schedule for their class.
 */
const getMyWeekTimetable = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const userId = req.user?.sub || req.user?.id;
        const role = req.user?.role || "user";

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        let rows = [];

        // ── 1. UNIFIED STUDENT / PARENT USER ('user') ──────────────────────
        if (role === "user") {
            const [[student]] = await pool.execute(
                `SELECT s.id, s.class_id
                 FROM students s
                 WHERE s.user_id = ? AND s.school_id = ?
                 LIMIT 1`,
                [userId, schoolId]
            );

            if (student && student.class_id) {
                const [ttRows] = await pool.execute(
                    `SELECT tt.id, tt.day_of_week, tt.start_time, tt.end_time, tt.room, tt.is_active,
                            tt.class_id, tt.subject_id, tt.teacher_id,
                            u.name AS teacher_name,
                            CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                            c.grade_level, c.stream,
                            s.subject_name, s.subject_code
                     FROM timetables tt
                     JOIN classes c ON c.id = tt.class_id
                     JOIN subjects s ON s.id = tt.subject_id
                     JOIN users u ON u.id = tt.teacher_id
                     WHERE tt.class_id = ? AND tt.school_id = ? AND tt.is_active = 1
                     ORDER BY FIELD(tt.day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'), tt.start_time ASC`,
                    [student.class_id, schoolId]
                );
                rows = ttRows;
            }
        } else {
            // ── 2. STAFF / TEACHER ──────────────────────────────────────────
            const [ttRows] = await pool.execute(
                `SELECT tt.id, tt.day_of_week, tt.start_time, tt.end_time, tt.room, tt.is_active,
                        tt.class_id, tt.subject_id, tt.teacher_id,
                        u.name AS teacher_name,
                        CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                        c.grade_level, c.stream,
                        s.subject_name, s.subject_code
                 FROM timetables tt
                 JOIN classes c ON c.id = tt.class_id
                 JOIN subjects s ON s.id = tt.subject_id
                 JOIN users u ON u.id = tt.teacher_id
                 WHERE tt.teacher_id = ? AND tt.school_id = ? AND tt.is_active = 1
                 ORDER BY FIELD(tt.day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'), tt.start_time ASC`,
                [userId, schoolId]
            );
            rows = ttRows;
        }

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
 * Admin / Headmaster: List timetable entries with comprehensive filters
 */
const listTimetables = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const { class_id, teacher_id, subject_id, day_of_week, academic_year_id, term_id } = req.query;

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
        if (academic_year_id) {
            where.push("tt.academic_year_id = ?");
            params.push(academic_year_id);
        }
        if (term_id) {
            where.push("tt.term_id = ?");
            params.push(term_id);
        }

        const [rows] = await pool.execute(
            `SELECT tt.id, tt.day_of_week, tt.start_time, tt.end_time, tt.room, tt.is_active,
                    tt.class_id, tt.subject_id, tt.teacher_id, tt.academic_year_id, tt.term_id,
                    u.name AS teacher_name,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    c.grade_level, c.stream,
                    s.subject_name, s.subject_code,
                    ay.year_label,
                    t.term_name
             FROM timetables tt
             JOIN users u ON u.id = tt.teacher_id
             JOIN classes c ON c.id = tt.class_id
             JOIN subjects s ON s.id = tt.subject_id
             LEFT JOIN academic_years ay ON ay.id = tt.academic_year_id
             LEFT JOIN terms t ON t.id = tt.term_id
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
        const actorId = req.user?.sub || req.user?.id;
        const {
            teacher_id, class_id, subject_id, day_of_week, start_time, end_time,
            room, academic_year_id, term_id, allow_override
        } = req.body;

        // Validation: Required fields
        if (!class_id || !subject_id || !teacher_id || !day_of_week || !start_time || !end_time) {
            return res.status(400).json({
                error: "Class, Subject, Teacher, Day, Start time, and End time are all required before saving."
            });
        }

        if (!VALID_DAYS.includes(day_of_week)) {
            return res.status(400).json({
                error: `Invalid day of week. Must be one of: ${VALID_DAYS.join(", ")}`
            });
        }

        const normStart = normalizeTime(start_time);
        const normEnd = normalizeTime(end_time);

        if (normStart >= normEnd) {
            return res.status(400).json({ error: "End time must be after start time." });
        }

        // Determine academic_year_id & term_id if not supplied
        let targetYearId = academic_year_id;
        if (!targetYearId) {
            const [[curYear]] = await pool.execute(
                "SELECT id FROM academic_years WHERE school_id = ? AND is_current = 1 LIMIT 1",
                [schoolId]
            );
            targetYearId = curYear ? curYear.id : 1;
        }

        let targetTermId = term_id || null;
        if (!targetTermId) {
            const [[curTerm]] = await pool.execute(
                "SELECT id FROM terms WHERE school_id = ? AND is_current = 1 LIMIT 1",
                [schoolId]
            );
            targetTermId = curTerm ? curTerm.id : null;
        }

        // 1. Conflict Check: Is the teacher already scheduled for another class during this time?
        if (!allow_override) {
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
                    error: "This teacher is already scheduled for another class during this period.",
                    conflict_type: "teacher",
                    details: `Already scheduled for ${conf.class_name} (${conf.subject_name}) from ${conf.start_time.substring(0, 5)} to ${conf.end_time.substring(0, 5)}.`
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
                    error: "Class conflict: this class is already scheduled for another subject during this period.",
                    conflict_type: "class",
                    details: `Class is already taking ${conf.subject_name} with ${conf.teacher_name} from ${conf.start_time.substring(0, 5)} to ${conf.end_time.substring(0, 5)}.`
                });
            }
        }

        // Insert new entry
        const [result] = await pool.execute(
            `INSERT INTO timetables (school_id, academic_year_id, term_id, teacher_id, class_id, subject_id, day_of_week, start_time, end_time, room, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [schoolId, targetYearId, targetTermId, teacher_id, class_id, subject_id, day_of_week, normStart, normEnd, room ? room.trim() : null]
        );

        const newId = result.insertId;

        // Audit log
        await writeAuditLog(actorId, "CREATE_TIMETABLE_ENTRY", "timetable", newId, {
            day_of_week,
            start_time: normStart,
            end_time: normEnd,
            class_id,
            subject_id,
            teacher_id,
            room: room ? room.trim() : null
        });

        res.status(201).json({
            message: "Timetable entry created successfully",
            id: newId
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
        const actorId = req.user?.sub || req.user?.id;
        const entryId = req.params.id;
        const {
            teacher_id, class_id, subject_id, day_of_week, start_time, end_time,
            room, academic_year_id, term_id, is_active, allow_override
        } = req.body;

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
        const newYearId = academic_year_id || existing.academic_year_id || 1;
        const newTermId = term_id !== undefined ? term_id : existing.term_id;

        if (!VALID_DAYS.includes(newDay)) {
            return res.status(400).json({ error: `Invalid day of week. Must be one of: ${VALID_DAYS.join(", ")}` });
        }
        if (normStart >= normEnd) {
            return res.status(400).json({ error: "End time must be after start time." });
        }

        if (newActive === 1 && !allow_override) {
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
                    error: "This teacher is already scheduled for another class during this period.",
                    conflict_type: "teacher",
                    details: `Already scheduled for ${conf.class_name} (${conf.subject_name}) from ${conf.start_time.substring(0, 5)} to ${conf.end_time.substring(0, 5)}.`
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
                    error: "Class conflict: this class is already scheduled for another subject during this period.",
                    conflict_type: "class",
                    details: `Class is already taking ${conf.subject_name} with ${conf.teacher_name} from ${conf.start_time.substring(0, 5)} to ${conf.end_time.substring(0, 5)}.`
                });
            }
        }

        await pool.execute(
            `UPDATE timetables
             SET teacher_id = ?, class_id = ?, subject_id = ?, day_of_week = ?,
                 start_time = ?, end_time = ?, room = ?, is_active = ?,
                 academic_year_id = ?, term_id = ?
             WHERE id = ? AND school_id = ?`,
            [newTeacherId, newClassId, newSubjectId, newDay, normStart, normEnd, newRoom, newActive, newYearId, newTermId, entryId, schoolId]
        );

        await writeAuditLog(actorId, "UPDATE_TIMETABLE_ENTRY", "timetable", Number(entryId), {
            day_of_week: newDay,
            start_time: normStart,
            end_time: normEnd,
            class_id: newClassId,
            subject_id: newSubjectId,
            teacher_id: newTeacherId
        });

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
        const actorId = req.user?.sub || req.user?.id;
        const entryId = req.params.id;

        const [[existing]] = await pool.execute(
            "SELECT * FROM timetables WHERE id = ? AND school_id = ? LIMIT 1",
            [entryId, schoolId]
        );

        if (!existing) {
            return res.status(404).json({ error: "Timetable entry not found" });
        }

        await pool.execute(
            `DELETE FROM timetables WHERE id = ? AND school_id = ?`,
            [entryId, schoolId]
        );

        await writeAuditLog(actorId, "DELETE_TIMETABLE_ENTRY", "timetable", Number(entryId), {
            class_id: existing.class_id,
            subject_id: existing.subject_id,
            teacher_id: existing.teacher_id,
            day_of_week: existing.day_of_week,
            start_time: existing.start_time
        });

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
