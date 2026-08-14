const pool = require("../config/db");

/**
 * GET /api/search
 * Global search endpoint across students, teachers/staff, and classes.
 */
const globalSearch = async (req, res) => {
    try {
        const query = String(req.query.q || req.query.search || "").trim();
        if (!query) {
            return res.json({ students: [], teachers: [], classes: [] });
        }

        const term = `%${query}%`;

        // Search students
        const [students] = await pool.execute(
            `SELECT id, admission_number, first_name, last_name, grade, section, status
             FROM students
             WHERE first_name LIKE ? OR last_name LIKE ? OR admission_number LIKE ? OR grade LIKE ?
             LIMIT 10`,
            [term, term, term, term]
        );

        // Search teachers / users
        const [teachers] = await pool.execute(
            `SELECT id, name, email, role, is_active
             FROM users
             WHERE (name LIKE ? OR email LIKE ?) AND role IN ('staff', 'admin', 'headmaster')
             LIMIT 10`,
            [term, term]
        );

        // Search classes
        const [classes] = await pool.execute(
            `SELECT c.id, c.grade_level, c.stream, c.capacity,
                    CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name
             FROM classes c
             WHERE c.grade_level LIKE ? OR c.stream LIKE ?
             LIMIT 10`,
            [term, term]
        );

        res.json({
            students: students.map(s => ({
                id: s.id,
                admissionNumber: s.admission_number,
                name: `${s.first_name} ${s.last_name}`,
                grade: s.grade ? `${s.grade} ${s.section || ''}` : 'N/A',
                status: s.status,
                type: 'student'
            })),
            teachers: teachers.map(t => ({
                id: t.id,
                name: t.name,
                email: t.email,
                role: t.role,
                type: 'staff'
            })),
            classes: classes.map(c => ({
                id: c.id,
                name: c.class_name,
                type: 'class'
            }))
        });
    } catch (err) {
        console.error("globalSearch error:", err.message);
        res.status(500).json({ error: "Search failed" });
    }
};

/**
 * GET /api/search/students
 * Dedicated student search & listing endpoint for students.html.
 */
const searchStudents = async (req, res) => {
    try {
        const query = String(req.query.q || req.query.search || "").trim();
        const term = `%${query}%`;
        const where = query ? "WHERE s.first_name LIKE ? OR s.last_name LIKE ? OR s.admission_number LIKE ? OR s.grade LIKE ?" : "";
        const params = query ? [term, term, term, term] : [];

        const [rows] = await pool.execute(
            `SELECT s.id, s.admission_number, s.first_name, s.last_name, s.gender, s.grade, s.section,
                    s.enrollment_date, s.date_of_birth, s.status, s.class_id,
                    s.parent_guardian_name AS guardian_name,
                    s.phone_number AS guardian_phone,
                    CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name
             FROM students s
             LEFT JOIN classes c ON c.id = s.class_id
             ${where}
             ORDER BY s.id DESC
             LIMIT 500`,
            params
        );

        res.json({ students: rows });
    } catch (err) {
        console.error("searchStudents error:", err.message);
        res.status(500).json({ error: "Could not load students" });
    }
};

module.exports = { globalSearch, searchStudents };

