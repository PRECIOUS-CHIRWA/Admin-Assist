const pool = require("../config/db");

// GET /api/settings/grading-scale
const getGradingScale = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            "SELECT * FROM grading_scales ORDER BY min_mark DESC"
        );
        res.json({ gradingScale: rows });
    } catch (err) {
        console.error("getGradingScale error:", err.message);
        res.status(500).json({ error: "Something went wrong fetching grading scale" });
    }
};

// GET /api/moderation/checklist?term=Term+2
const getModerationChecklist = async (req, res) => {
    try {
        const term = ["Term 1", "Term 2", "Term 3"].includes(req.query.term)
            ? req.query.term
            : "Term 1";

        const [rows] = await pool.execute(
            "SELECT * FROM moderation_checklists WHERE term = ? ORDER BY id",
            [term]
        );
        res.json({ checklist: rows });
    } catch (err) {
        console.error("getModerationChecklist error:", err.message);
        res.status(500).json({ error: "Something went wrong fetching checklist" });
    }
};

// GET /api/notes?studentId=5
const getNotes = async (req, res) => {
    try {
        const studentId = req.query.studentId ? parseInt(req.query.studentId, 10) : null;

        const conditions = ["n.author_id = ?"];
        const params = [req.user.sub];

        if (studentId) {
            conditions.push("n.student_id = ?");
            params.push(studentId);
        }

        const [rows] = await pool.execute(
            `SELECT n.id, n.content, n.student_id, n.created_at, u.name AS authorName
             FROM teacher_notes n
             JOIN users u ON n.author_id = u.id
             WHERE ${conditions.join(" AND ")}
             ORDER BY n.created_at DESC
             LIMIT 50`,
            params
        );
        res.json({ notes: rows });
    } catch (err) {
        console.error("getNotes error:", err.message);
        res.status(500).json({ error: "Something went wrong fetching notes" });
    }
};

// POST /api/notes
const createNote = async (req, res) => {
    try {
        const { content, studentId } = req.body;

        if (!content || !String(content).trim()) {
            return res.status(400).json({ error: "Note content is required" });
        }

        const [result] = await pool.execute(
            "INSERT INTO teacher_notes (author_id, student_id, content) VALUES (?, ?, ?)",
            [req.user.sub, studentId || null, String(content).trim()]
        );

        const [rows] = await pool.execute(
            `SELECT n.id, n.content, n.student_id, n.created_at, u.name AS authorName
             FROM teacher_notes n
             JOIN users u ON n.author_id = u.id
             WHERE n.id = ?`,
            [result.insertId]
        );

        res.status(201).json({ note: rows[0] });
    } catch (err) {
        console.error("createNote error:", err.message);
        res.status(500).json({ error: "Something went wrong creating note" });
    }
};

module.exports = { getGradingScale, getModerationChecklist, getNotes, createNote };