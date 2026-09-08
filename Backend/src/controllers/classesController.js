/**
 * classesController.js — Class Management & Teacher Class Scoping
 */
"use strict";

const pool = require("../config/db");

// ─── List classes ─────────────────────────────────────────────────────────────
const listClasses = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const role = req.user?.role || "user";
        const userId = req.user?.sub;

        let whereConditions = ["c.school_id = ?"];
        let params = [schoolId];

        // Role scoping:
        // Staff/Teacher can ONLY see classes assigned to them
        if (role === "staff") {
            whereConditions.push(`(
                c.class_teacher_id = ? OR c.id IN (
                    SELECT class_id FROM teacher_subjects WHERE teacher_id = ?
                )
            )`);
            params.push(userId, userId);
        } else if (role === "user") {
            // Student / Parent can only see their own class
            whereConditions.push(`c.id IN (
                SELECT class_id FROM students WHERE user_id = ?
            )`);
            params.push(userId);
        }

        const where = `WHERE ${whereConditions.join(" AND ")}`;

        const [rows] = await pool.execute(
            `SELECT c.id, c.grade_level, c.stream, c.capacity, c.core_focus, c.class_teacher_id,
                    u.name AS class_teacher_name,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    COUNT(s.id) AS student_count
             FROM classes c
             LEFT JOIN users u ON u.id = c.class_teacher_id
             LEFT JOIN students s ON (s.class_id = c.id AND s.status = 'Active')
             ${where}
             GROUP BY c.id
             ORDER BY c.grade_level, c.stream`,
            params
        );
        res.json(rows);
    } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
            return res.json([]);
        }
        console.error("listClasses error:", err.message);
        res.status(500).json({ error: "Failed to load classes" });
    }
};

// ─── Get class by ID ──────────────────────────────────────────────────────────
const getClassById = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const [rows] = await pool.execute(
            `SELECT c.id, c.grade_level, c.stream, c.capacity, c.core_focus, c.class_teacher_id,
                    u.name AS class_teacher_name,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name
             FROM classes c
             LEFT JOIN users u ON u.id = c.class_teacher_id
             WHERE c.id = ? AND c.school_id = ?
             LIMIT 1`,
            [req.params.id, schoolId]
        );
        if (!rows[0]) return res.status(404).json({ error: "Class not found" });

        // If staff, verify assignment
        if (req.user?.role === "staff") {
            const [[assignment]] = await pool.execute(
                `SELECT id FROM teacher_subjects WHERE teacher_id = ? AND class_id = ?
                 UNION
                 SELECT id FROM classes WHERE id = ? AND class_teacher_id = ?`,
                [req.user.sub, req.params.id, req.params.id, req.user.sub]
            );
            if (!assignment) {
                return res.status(403).json({ error: "You are not assigned to this class" });
            }
        }

        res.json(rows[0]);
    } catch (err) {
        console.error("getClassById error:", err.message);
        res.status(500).json({ error: "Failed to load class" });
    }
};

// ─── Get Class Record (Students in class & core focus) ────────────────────────
const getClassStudents = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const classId = req.params.id;
        const role = req.user?.role || "user";
        const userId = req.user?.sub;

        const [[classRow]] = await pool.execute(
            `SELECT c.id, c.grade_level, c.stream, c.capacity, c.core_focus, c.class_teacher_id,
                    u.name AS class_teacher_name,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name
             FROM classes c
             LEFT JOIN users u ON u.id = c.class_teacher_id
             WHERE c.id = ? AND c.school_id = ?`,
            [classId, schoolId]
        );
        if (!classRow) return res.status(404).json({ error: "Class not found" });

        // Authorization check for Staff
        if (role === "staff") {
            const [[isAssigned]] = await pool.execute(
                `SELECT id FROM teacher_subjects WHERE teacher_id = ? AND class_id = ?
                 UNION
                 SELECT id FROM classes WHERE id = ? AND class_teacher_id = ?`,
                [userId, classId, classId, userId]
            );
            if (!isAssigned) {
                return res.status(403).json({ error: "You are not authorized to view this class" });
            }
        }

        // Default core focus if not set
        if (!classRow.core_focus) {
            const isSenior = ["Grade 10", "Grade 11", "Grade 12"].includes(classRow.grade_level);
            if (isSenior) {
                classRow.core_focus = classRow.stream === "A" ? "Sciences Focus" : (classRow.stream === "B" ? "Arts & Humanities Focus" : "Commercial Studies Focus");
            } else {
                classRow.core_focus = "Junior Secondary Core";
            }
        }

        // Fetch subjects assigned to this class (for staff, only their assigned subjects)
        let subjectQuery = `
            SELECT sub.id, sub.subject_code, sub.subject_name, u.name AS teacher_name
            FROM teacher_subjects ts
            JOIN subjects sub ON sub.id = ts.subject_id
            JOIN users u ON u.id = ts.teacher_id
            WHERE ts.class_id = ?`;
        let subjectParams = [classId];

        if (role === "staff") {
            subjectQuery += " AND ts.teacher_id = ?";
            subjectParams.push(userId);
        }

        subjectQuery += " ORDER BY sub.subject_name";
        const [subjects] = await pool.execute(subjectQuery, subjectParams);

        // Fetch students in this class
        const [students] = await pool.execute(
            `SELECT s.id, s.admission_number, s.first_name, s.last_name, s.gender, s.status, s.enrollment_date
             FROM students s
             WHERE s.school_id = ? AND (s.class_id = ? OR (s.grade = ? AND s.section = ?))
             ORDER BY s.last_name, s.first_name`,
            [schoolId, classId, classRow.grade_level, classRow.stream]
        );

        res.json({
            class: classRow,
            subjects,
            students,
            total_students: students.length,
        });
    } catch (err) {
        console.error("getClassStudents error:", err.message);
        res.status(500).json({ error: "Failed to load class record" });
    }
};

// ─── Create class ─────────────────────────────────────────────────────────────
const ALLOWED_GRADE_LEVELS = ["Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];

const normalizeGrade = (raw) => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    if (ALLOWED_GRADE_LEVELS.includes(trimmed)) return trimmed;
    const num = trimmed.replace(/^Grade\s*/i, "");
    const candidate = `Grade ${num}`;
    if (ALLOWED_GRADE_LEVELS.includes(candidate)) return candidate;
    return trimmed;
};

const createClass = async (req, res) => {
    const schoolId = req.user?.school_id || 1;
    const { grade_level, gradeLevel, stream = "", capacity = 40, core_focus, coreFocus, class_teacher_id = null, classTeacherId = null } = req.body;
    const grade = normalizeGrade(grade_level || gradeLevel);
    const str = String(stream || "").trim().toUpperCase();
    const cap = parseInt(capacity, 10) || 40;
    const teacherId = class_teacher_id || classTeacherId || null;
    const focus = String(core_focus || coreFocus || "").trim() || null;

    if (!ALLOWED_GRADE_LEVELS.includes(grade)) {
        return res.status(400).json({ error: `grade_level must be one of: ${ALLOWED_GRADE_LEVELS.join(", ")}` });
    }
    if (!str) return res.status(400).json({ error: "stream is required, e.g. 'A'" });

    try {
        const [[dupe]] = await pool.execute(
            "SELECT id FROM classes WHERE school_id = ? AND grade_level = ? AND stream = ?",
            [schoolId, grade, str]
        );
        if (dupe) {
            return res.status(409).json({ error: `${grade} ${str} already exists` });
        }

        const [result] = await pool.execute(
            "INSERT INTO classes (school_id, grade_level, stream, capacity, core_focus, class_teacher_id) VALUES (?, ?, ?, ?, ?, ?)",
            [schoolId, grade, str, cap, focus, teacherId]
        );
        res.status(201).json({
            message: "Class created successfully",
            id: result.insertId,
            grade_level: grade,
            stream: str,
            capacity: cap,
            core_focus: focus,
        });
    } catch (err) {
        console.error("createClass error:", err.message);
        res.status(500).json({ error: "Failed to create class" });
    }
};

// ─── Update class ─────────────────────────────────────────────────────────────
const updateClass = async (req, res) => {
    const schoolId = req.user?.school_id || 1;
    const { grade_level, gradeLevel, stream, capacity, core_focus, coreFocus, class_teacher_id, classTeacherId } = req.body;
    const id = req.params.id;

    try {
        const fields = [];
        const values = [];

        if (grade_level !== undefined || gradeLevel !== undefined) {
            fields.push("grade_level = ?");
            values.push((grade_level || gradeLevel || "").trim());
        }
        if (stream !== undefined) {
            fields.push("stream = ?");
            values.push(String(stream).trim());
        }
        if (capacity !== undefined) {
            fields.push("capacity = ?");
            values.push(parseInt(capacity, 10) || 40);
        }
        if (core_focus !== undefined || coreFocus !== undefined) {
            fields.push("core_focus = ?");
            values.push(String(core_focus || coreFocus || "").trim() || null);
        }
        if (class_teacher_id !== undefined || classTeacherId !== undefined) {
            fields.push("class_teacher_id = ?");
            values.push(class_teacher_id || classTeacherId || null);
        }

        if (!fields.length) return res.status(400).json({ error: "No fields to update" });

        values.push(id, schoolId);
        const [result] = await pool.execute(
            `UPDATE classes SET ${fields.join(", ")} WHERE id = ? AND school_id = ?`,
            values
        );

        if (result.affectedRows === 0) return res.status(404).json({ error: "Class not found" });

        res.json({ message: "Class updated successfully" });
    } catch (err) {
        console.error("updateClass error:", err.message);
        res.status(500).json({ error: "Failed to update class" });
    }
};

// ─── Delete class ─────────────────────────────────────────────────────────────
const deleteClass = async (req, res) => {
    const schoolId = req.user?.school_id || 1;
    try {
        const [result] = await pool.execute("DELETE FROM classes WHERE id = ? AND school_id = ?", [req.params.id, schoolId]);
        if (result.affectedRows === 0) return res.status(404).json({ error: "Class not found" });
        res.json({ message: "Class deleted successfully" });
    } catch (err) {
        console.error("deleteClass error:", err.message);
        res.status(500).json({ error: "Failed to delete class" });
    }
};

module.exports = {
    listClasses,
    getClassById,
    getClassStudents,
    createClass,
    updateClass,
    deleteClass,
};