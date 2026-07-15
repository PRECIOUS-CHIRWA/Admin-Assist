const pool = require("../config/db");

// ─── GLOBAL SEARCH ────────────────────────────────────────────────────────────

/**
 * GET /api/search
 * Query: q (search term, required), type? (students|classes|subjects|all — default all)
 * Searches across students, classes, and subjects in one call.
 */
const globalSearch = async (req, res) => {
    const { q, type = "all" } = req.query;

    if (!q || q.trim().length < 2) {
        return res.status(400).json({ error: "Search query (q) must be at least 2 characters" });
    }

    const term = `%${q.trim()}%`;

    try {
        const results = {};

        if (type === "all" || type === "students") {
            const [students] = await pool.execute(
                `SELECT st.id, st.admission_number, st.first_name, st.last_name, st.gender,
                CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name
         FROM   students st
         LEFT JOIN classes c ON c.id = st.class_id
         WHERE  st.first_name LIKE ? OR st.last_name LIKE ?
                OR st.admission_number LIKE ?
                OR CONCAT(st.first_name, ' ', st.last_name) LIKE ?
         ORDER BY st.last_name
         LIMIT 25`,
                [term, term, term, term]
            );
            results.students = students;
        }

        if (type === "all" || type === "classes") {
            const [classes] = await pool.execute(
                `SELECT id, grade_level, stream,
                CONCAT(grade_level, IF(stream != '', CONCAT(' ', stream), '')) AS class_name
         FROM   classes
         WHERE  grade_level LIKE ? OR stream LIKE ?
         ORDER BY grade_level
         LIMIT 25`,
                [term, term]
            );
            results.classes = classes;
        }

        if (type === "all" || type === "subjects") {
            const [subjects] = await pool.execute(
                `SELECT id, subject_code, subject_name
         FROM   subjects
         WHERE  subject_name LIKE ? OR subject_code LIKE ?
         ORDER BY subject_name
         LIMIT 25`,
                [term, term]
            );
            results.subjects = subjects;
        }

        const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

        res.json({ query: q, total_results: totalResults, ...results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/search/students
 * Dedicated student search with richer filters.
 * Query: q?, class_id?, gender?, status?
 */
const searchStudents = async (req, res) => {
    const { q, class_id, gender, status } = req.query;

    const filters = [];
    const values = [];

    if (q && q.trim().length >= 1) {
        filters.push("(st.first_name LIKE ? OR st.last_name LIKE ? OR st.admission_number LIKE ?)");
        const term = `%${q.trim()}%`;
        values.push(term, term, term);
    }
    if (class_id) { filters.push("st.class_id = ?"); values.push(class_id); }
    if (gender) { filters.push("st.gender = ?"); values.push(gender); }
    if (status) { filters.push("st.status = ?"); values.push(status); }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
        const [rows] = await pool.execute(
            `SELECT st.id, st.admission_number, st.first_name, st.last_name,
              st.gender, st.date_of_birth, st.enrollment_date,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name
       FROM   students st
       LEFT JOIN classes c ON c.id = st.class_id
       ${where}
       ORDER BY st.last_name, st.first_name
       LIMIT 100`,
            values
        );
        res.json({ total: rows.length, students: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { globalSearch, searchStudents };