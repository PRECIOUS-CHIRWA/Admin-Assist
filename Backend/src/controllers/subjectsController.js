const pool = require("../config/db");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const requireFields = (body, fields) => {
    const missing = fields.filter((f) => !body[f] && body[f] !== 0);
    return missing.length ? `${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} required` : null;
};

// ─── SUBJECT CRUD ─────────────────────────────────────────────────────────────

/**
 * GET /api/subjects
 * Query: is_active? (1 or 0)
 */
const getSubjects = async (req, res) => {
    const { is_active } = req.query;
    const filters = [];
    const values = [];

    if (is_active !== undefined) { filters.push("s.is_active = ?"); values.push(is_active); }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
        const [rows] = await pool.execute(
            `SELECT s.id, s.subject_code, s.subject_name, s.description, s.is_active,
              s.created_at, s.updated_at,
              COUNT(DISTINCT ts.id) AS teacher_assignments
       FROM   subjects s
       LEFT JOIN teacher_subjects ts ON ts.subject_id = s.id
       ${where}
       GROUP BY s.id
       ORDER BY s.subject_name`,
            values
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/subjects/:id
 */
const getSubjectById = async (req, res) => {
    const { id } = req.params;

    try {
        const [[subject]] = await pool.execute(
            "SELECT * FROM subjects WHERE id = ?",
            [id]
        );
        if (!subject) return res.status(404).json({ error: "Subject not found" });

        const [assignments] = await pool.execute(
            `SELECT ts.id, u.name AS teacher_name, u.id AS teacher_id,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              c.id AS class_id, ay.year_label
       FROM   teacher_subjects ts
       JOIN   users         u  ON u.id  = ts.teacher_id
       JOIN   classes       c  ON c.id  = ts.class_id
       JOIN   academic_years ay ON ay.id = ts.academic_year_id
       WHERE  ts.subject_id = ?
       ORDER BY ay.year_label DESC, c.grade_level`,
            [id]
        );

        res.json({ subject, assignments });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/subjects
 * Body: { subject_code, subject_name, description? }
 */
const createSubject = async (req, res) => {
    const { subject_code, subject_name, description = null } = req.body;

    const fieldErr = requireFields(req.body, ["subject_code", "subject_name"]);
    if (fieldErr) return res.status(400).json({ error: fieldErr });

    try {
        const [result] = await pool.execute(
            "INSERT INTO subjects (subject_code, subject_name, description) VALUES (?, ?, ?)",
            [subject_code.toUpperCase(), subject_name, description]
        );
        const [[subject]] = await pool.execute("SELECT * FROM subjects WHERE id = ?", [result.insertId]);
        res.status(201).json({ message: "Subject created successfully", subject });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: `Subject code "${subject_code}" already exists` });
        }
        res.status(500).json({ error: err.message });
    }
};

/**
 * PUT /api/subjects/:id
 * Body: { subject_code?, subject_name?, description?, is_active? }
 */
const updateSubject = async (req, res) => {
    const { id } = req.params;
    const { subject_code, subject_name, description, is_active } = req.body;

    try {
        const [[existing]] = await pool.execute("SELECT id FROM subjects WHERE id = ?", [id]);
        if (!existing) return res.status(404).json({ error: "Subject not found" });

        const fields = [];
        const values = [];
        if (subject_code !== undefined) { fields.push("subject_code = ?"); values.push(subject_code.toUpperCase()); }
        if (subject_name !== undefined) { fields.push("subject_name = ?"); values.push(subject_name); }
        if (description !== undefined) { fields.push("description = ?"); values.push(description); }
        if (is_active !== undefined) { fields.push("is_active = ?"); values.push(is_active); }

        if (!fields.length) return res.status(400).json({ error: "Nothing to update" });

        values.push(id);
        await pool.execute(
            `UPDATE subjects SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );
        res.json({ message: "Subject updated successfully" });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "That subject code is already in use" });
        }
        res.status(500).json({ error: err.message });
    }
};

/**
 * DELETE /api/subjects/:id (soft-delete via is_active = 0)
 */
const deleteSubject = async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await pool.execute(
            "UPDATE subjects SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: "Subject not found" });
        res.json({ message: "Subject deactivated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── TEACHER ASSIGNMENTS ──────────────────────────────────────────────────────

/**
 * GET /api/subjects/assignments
 * Query: teacher_id?, class_id?, academic_year_id?
 */
const getTeacherAssignments = async (req, res) => {
    const { teacher_id, class_id, academic_year_id } = req.query;

    const filters = [];
    const values = [];
    if (teacher_id) { filters.push("ts.teacher_id = ?"); values.push(teacher_id); }
    if (class_id) { filters.push("ts.class_id = ?"); values.push(class_id); }
    if (academic_year_id) { filters.push("ts.academic_year_id = ?"); values.push(academic_year_id); }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
        const [rows] = await pool.execute(
            `SELECT ts.id,
              u.id   AS teacher_id,   u.name  AS teacher_name,
              sub.id AS subject_id,   sub.subject_code, sub.subject_name,
              c.id   AS class_id,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              ay.id  AS academic_year_id, ay.year_label
       FROM   teacher_subjects ts
       JOIN   users         u   ON u.id   = ts.teacher_id
       JOIN   subjects      sub ON sub.id = ts.subject_id
       JOIN   classes       c   ON c.id   = ts.class_id
       JOIN   academic_years ay ON ay.id  = ts.academic_year_id
       ${where}
       ORDER BY ay.year_label DESC, c.grade_level, sub.subject_name`,
            values
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/subjects/assign
 * Body: { teacher_id, subject_id, class_id, academic_year_id }
 */
const assignTeacher = async (req, res) => {
    const { teacher_id, subject_id, class_id, academic_year_id } = req.body;

    const fieldErr = requireFields(req.body, ["teacher_id", "subject_id", "class_id", "academic_year_id"]);
    if (fieldErr) return res.status(400).json({ error: fieldErr });

    try {
        const [result] = await pool.execute(
            `INSERT INTO teacher_subjects (teacher_id, subject_id, class_id, academic_year_id)
       VALUES (?, ?, ?, ?)`,
            [teacher_id, subject_id, class_id, academic_year_id]
        );
        res.status(201).json({ message: "Teacher assigned successfully", id: result.insertId });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "This teacher is already assigned to that subject/class/year" });
        }
        res.status(500).json({ error: err.message });
    }
};

/**
 * DELETE /api/subjects/assign/:id
 */
const removeAssignment = async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await pool.execute("DELETE FROM teacher_subjects WHERE id = ?", [id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: "Assignment not found" });
        res.json({ message: "Assignment removed successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getSubjects, getSubjectById, createSubject, updateSubject, deleteSubject,
    getTeacherAssignments, assignTeacher, removeAssignment,
};