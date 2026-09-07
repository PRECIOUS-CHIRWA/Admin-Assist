"use strict";

const pool = require("../config/db");

// ─── List classes ─────────────────────────────────────────────────────────────
const listClasses = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT c.id, c.grade_level, c.stream, c.capacity, c.core_focus, c.class_teacher_id,
                    u.name AS class_teacher_name,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    COUNT(s.id) AS student_count
             FROM classes c
             LEFT JOIN users u ON u.id = c.class_teacher_id
             LEFT JOIN students s ON (
                 s.class_id = c.id 
                 OR (s.grade = c.grade_level AND (
                     s.section = c.stream 
                     OR s.section = CONCAT(REPLACE(c.grade_level, 'Grade ', ''), c.stream)
                     OR CONCAT(s.grade, IF(s.section != '' AND s.section IS NOT NULL, CONCAT(' ', s.section), '')) = CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), ''))
                 ))
             ) AND s.status = 'Active'
             GROUP BY c.id
             ORDER BY c.grade_level, c.stream`
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
        const [rows] = await pool.execute(
            `SELECT c.id, c.grade_level, c.stream, c.capacity, c.core_focus, c.class_teacher_id,
                    u.name AS class_teacher_name,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name
             FROM classes c
             LEFT JOIN users u ON u.id = c.class_teacher_id
             WHERE c.id = ?
             LIMIT 1`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: "Class not found" });
        res.json(rows[0]);
    } catch (err) {
        console.error("getClassById error:", err.message);
        res.status(500).json({ error: "Failed to load class" });
    }
};

// ─── Get Class Record (Students in class & core focus) ────────────────────────
const getClassStudents = async (req, res) => {
    try {
        const classId = req.params.id;
        const [[classRow]] = await pool.execute(
            `SELECT c.id, c.grade_level, c.stream, c.capacity, c.core_focus, c.class_teacher_id,
                    u.name AS class_teacher_name,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name
             FROM classes c
             LEFT JOIN users u ON u.id = c.class_teacher_id
             WHERE c.id = ?`,
            [classId]
        );
        if (!classRow) return res.status(404).json({ error: "Class not found" });

        // Default core focus if not set
        if (!classRow.core_focus) {
            const isSenior = ["Grade 10", "Grade 11", "Grade 12"].includes(classRow.grade_level);
            if (isSenior) {
                classRow.core_focus = classRow.stream === "A" ? "Sciences Focus" : (classRow.stream === "B" ? "Arts & Humanities Focus" : "Commercial Studies Focus");
            } else {
                classRow.core_focus = "Junior Secondary Core";
            }
        }

        // Fetch subjects assigned to this class
        const [subjects] = await pool.execute(
            `SELECT sub.id, sub.subject_code, sub.subject_name, u.name AS teacher_name
             FROM teacher_subjects ts
             JOIN subjects sub ON sub.id = ts.subject_id
             JOIN users u ON u.id = ts.teacher_id
             WHERE ts.class_id = ?
             ORDER BY sub.subject_name`,
            [classId]
        );

        // Fetch students in this class
        const [students] = await pool.execute(
            `SELECT s.id, s.admission_number, s.first_name, s.last_name, s.gender, s.status, s.enrollment_date
             FROM students s
             WHERE s.class_id = ?
                OR (s.grade = ? AND (
                    s.section = ?
                    OR s.section = CONCAT(REPLACE(?, 'Grade ', ''), ?)
                    OR CONCAT(s.grade, IF(s.section != '' AND s.section IS NOT NULL, CONCAT(' ', s.section), '')) = ?
                ))
             ORDER BY s.last_name, s.first_name`,
            [classId, classRow.grade_level, classRow.stream, classRow.grade_level, classRow.stream, classRow.class_name]
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
            "SELECT id FROM classes WHERE grade_level = ? AND stream = ?",
            [grade, str]
        );
        if (dupe) {
            return res.status(409).json({ error: `${grade} ${str} already exists` });
        }

        const [result] = await pool.execute(
            "INSERT INTO classes (grade_level, stream, capacity, core_focus, class_teacher_id) VALUES (?, ?, ?, ?, ?)",
            [grade, str, cap, focus, teacherId]
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

        values.push(id);
        const [result] = await pool.execute(
            `UPDATE classes SET ${fields.join(", ")} WHERE id = ?`,
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
    try {
        const [result] = await pool.execute("DELETE FROM classes WHERE id = ?", [req.params.id]);
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