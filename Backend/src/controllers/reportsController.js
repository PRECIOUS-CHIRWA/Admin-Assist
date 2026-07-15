const pool = require("../config/db");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const escapeCsvField = (value) => {
    const str = String(value === null || value === undefined ? "" : value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

const toCsv = (rows, columns) => {
    const header = columns.map((c) => escapeCsvField(c.label)).join(",");
    const lines = rows.map((row) =>
        columns.map((c) => escapeCsvField(row[c.key])).join(",")
    );
    return [header, ...lines].join("\n");
};

// ─── ENROLLMENT REPORT ────────────────────────────────────────────────────────

/**
 * GET /api/reports/enrollment
 * Query: format? (json|csv), class_id?
 */
const getEnrollmentReport = async (req, res) => {
    const { format = "json", class_id } = req.query;

    const filters = [];
    const values = [];
    if (class_id) { filters.push("st.class_id = ?"); values.push(class_id); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
        const [rows] = await pool.execute(
            `SELECT st.id, st.admission_number, st.first_name, st.last_name,
              st.gender, st.date_of_birth, st.enrollment_date,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name
       FROM   students st
       LEFT JOIN classes c ON c.id = st.class_id
       ${where}
       ORDER BY c.grade_level, st.last_name`,
            values
        );

        if (format === "csv") {
            const csv = toCsv(rows, [
                { key: "admission_number", label: "Admission No" },
                { key: "first_name", label: "First Name" },
                { key: "last_name", label: "Last Name" },
                { key: "gender", label: "Gender" },
                { key: "class_name", label: "Class" },
                { key: "enrollment_date", label: "Enrollment Date" },
            ]);
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", "attachment; filename=enrollment_report.csv");
            return res.send(csv);
        }

        res.json({ total: rows.length, students: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── ATTENDANCE REPORT ────────────────────────────────────────────────────────

/**
 * GET /api/reports/attendance
 * Query: format? (json|csv), class_id?, term_id?, academic_year_id?
 */
const getAttendanceReport = async (req, res) => {
    const { format = "json", class_id, term_id, academic_year_id } = req.query;

    const filters = [];
    const values = [];
    if (class_id) { filters.push("s.class_id = ?"); values.push(class_id); }
    if (term_id) { filters.push("s.term_id = ?"); values.push(term_id); }
    if (academic_year_id) { filters.push("s.academic_year_id = ?"); values.push(academic_year_id); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
        const [rows] = await pool.execute(
            `SELECT st.admission_number, st.first_name, st.last_name,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              COUNT(ar.id)                                                          AS total_sessions,
              SUM(ar.status = 'present')                                           AS present,
              SUM(ar.status = 'absent')                                            AS absent,
              SUM(ar.status = 'late')                                              AS late,
              SUM(ar.status = 'excused')                                           AS excused,
              ROUND(SUM(ar.status = 'present') / COUNT(ar.id) * 100, 1)           AS attendance_rate
       FROM   attendance_records ar
       JOIN   attendance_sessions s  ON s.id  = ar.session_id
       JOIN   students            st ON st.id = ar.student_id
       LEFT JOIN classes          c  ON c.id  = st.class_id
       ${where}
       GROUP BY ar.student_id
       ORDER BY c.grade_level, st.last_name`,
            values
        );

        if (format === "csv") {
            const csv = toCsv(rows, [
                { key: "admission_number", label: "Admission No" },
                { key: "first_name", label: "First Name" },
                { key: "last_name", label: "Last Name" },
                { key: "class_name", label: "Class" },
                { key: "total_sessions", label: "Total Sessions" },
                { key: "present", label: "Present" },
                { key: "absent", label: "Absent" },
                { key: "late", label: "Late" },
                { key: "excused", label: "Excused" },
                { key: "attendance_rate", label: "Attendance Rate (%)" },
            ]);
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", "attachment; filename=attendance_report.csv");
            return res.send(csv);
        }

        res.json({ total: rows.length, records: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── ACADEMIC PERFORMANCE REPORT ──────────────────────────────────────────────

/**
 * GET /api/reports/academic
 * Query: format? (json|csv), class_id?, subject_id?, term_id?, academic_year_id?
 */
const getAcademicReport = async (req, res) => {
    const { format = "json", class_id, subject_id, term_id, academic_year_id } = req.query;

    const filters = [];
    const values = [];
    if (class_id) { filters.push("r.class_id = ?"); values.push(class_id); }
    if (subject_id) { filters.push("r.subject_id = ?"); values.push(subject_id); }
    if (term_id) { filters.push("r.term_id = ?"); values.push(term_id); }
    if (academic_year_id) { filters.push("r.academic_year_id = ?"); values.push(academic_year_id); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
        const [rows] = await pool.execute(
            `SELECT st.admission_number, st.first_name, st.last_name,
              sub.subject_name,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              r.total_marks, r.percentage, r.grade_classification, r.remarks, r.class_position
       FROM   results r
       JOIN   students st  ON st.id  = r.student_id
       JOIN   subjects sub ON sub.id = r.subject_id
       JOIN   classes  c   ON c.id   = r.class_id
       ${where}
       ORDER BY c.grade_level, sub.subject_name, r.class_position`,
            values
        );

        if (format === "csv") {
            const csv = toCsv(rows, [
                { key: "admission_number", label: "Admission No" },
                { key: "first_name", label: "First Name" },
                { key: "last_name", label: "Last Name" },
                { key: "class_name", label: "Class" },
                { key: "subject_name", label: "Subject" },
                { key: "total_marks", label: "Total Marks" },
                { key: "percentage", label: "Percentage" },
                { key: "grade_classification", label: "Grade" },
                { key: "remarks", label: "Remarks" },
                { key: "class_position", label: "Position" },
            ]);
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", "attachment; filename=academic_report.csv");
            return res.send(csv);
        }

        res.json({ total: rows.length, results: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── DASHBOARD SUMMARY REPORT ─────────────────────────────────────────────────

/**
 * GET /api/reports/summary
 * High-level counts for the reports landing page.
 */
const getSummaryReport = async (req, res) => {
    try {
        const [[studentTotals]] = await pool.execute(
            "SELECT COUNT(*) AS total_students FROM students"
        );

        const [[classTotals]] = await pool.execute(
            "SELECT COUNT(*) AS total_classes FROM classes"
        );

        const [[attendanceTotals]] = await pool.execute(
            `SELECT ROUND(SUM(status = 'present') / COUNT(*) * 100, 1) AS overall_attendance_rate
       FROM   attendance_records
       WHERE  created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
        );

        const [[resultsTotals]] = await pool.execute(
            `SELECT ROUND(AVG(percentage), 1) AS overall_average,
              ROUND(SUM(grade_code <= 6) / COUNT(*) * 100, 1) AS pass_rate
       FROM   results`
        );

        res.json({
            total_students: studentTotals.total_students,
            total_classes: classTotals.total_classes,
            overall_attendance_rate: attendanceTotals.overall_attendance_rate || 0,
            overall_average: resultsTotals.overall_average || 0,
            pass_rate: resultsTotals.pass_rate || 0,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getEnrollmentReport, getAttendanceReport, getAcademicReport, getSummaryReport,
};