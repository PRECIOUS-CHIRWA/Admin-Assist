const pool = require("../config/db");

// ─── OVERVIEW ANALYTICS ───────────────────────────────────────────────────────

/**
 * GET /api/analytics/overview
 * High-level KPI cards for the analytics dashboard.
 */
const getOverview = async (req, res) => {
    try {
        const [[students]] = await pool.execute(
            "SELECT COUNT(*) AS total FROM students"
        );

        const [[newThisMonth]] = await pool.execute(
            `SELECT COUNT(*) AS total FROM students
       WHERE  enrollment_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`
        );

        const [[attendanceToday]] = await pool.execute(
            `SELECT ROUND(SUM(ar.status = 'present') / COUNT(*) * 100, 1) AS rate
       FROM   attendance_records ar
       JOIN   attendance_sessions s ON s.id = ar.session_id
       WHERE  s.attendance_date = CURDATE()`
        );

        const [[avgPerformance]] = await pool.execute(
            `SELECT ROUND(AVG(percentage), 1) AS average FROM results`
        );

        res.json({
            total_students: students.total,
            new_enrollments_this_month: newThisMonth.total,
            attendance_rate_today: attendanceToday.rate || 0,
            average_academic_performance: avgPerformance.average || 0,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── ENROLLMENT TRENDS ────────────────────────────────────────────────────────

/**
 * GET /api/analytics/enrollment-trends
 * Monthly enrollment counts for the past 12 months.
 */
const getEnrollmentTrends = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT DATE_FORMAT(enrollment_date, '%Y-%m') AS month,
              COUNT(*)                              AS count
       FROM   students
       WHERE  enrollment_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY month
       ORDER BY month`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── CLASS DISTRIBUTION ───────────────────────────────────────────────────────

/**
 * GET /api/analytics/class-distribution
 * Student count per class — used for bar charts.
 */
const getClassDistribution = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              COUNT(st.id)                                                          AS student_count,
              c.capacity
       FROM   classes c
       LEFT JOIN students st ON st.class_id = c.id
       GROUP BY c.id
       ORDER BY c.grade_level, c.stream`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── GENDER DISTRIBUTION ──────────────────────────────────────────────────────

/**
 * GET /api/analytics/gender-distribution
 */
const getGenderDistribution = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT gender, COUNT(*) AS count
       FROM   students
       GROUP BY gender`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── ATTENDANCE TREND ─────────────────────────────────────────────────────────

/**
 * GET /api/analytics/attendance-trend
 * Query: weeks? (default 8)
 */
const getAttendanceTrend = async (req, res) => {
    const weeks = Number(req.query.weeks) || 8;

    try {
        const [rows] = await pool.execute(
            `SELECT DATE_FORMAT(s.attendance_date, '%Y-%m-%d') AS date,
              ROUND(SUM(ar.status = 'present') / COUNT(*) * 100, 1) AS rate
       FROM   attendance_records ar
       JOIN   attendance_sessions s ON s.id = ar.session_id
       WHERE  s.attendance_date >= DATE_SUB(CURDATE(), INTERVAL ? WEEK)
       GROUP BY s.attendance_date
       ORDER BY s.attendance_date`,
            [weeks]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── PERFORMANCE BY SUBJECT ───────────────────────────────────────────────────

/**
 * GET /api/analytics/performance-by-subject
 * Query: term_id?, academic_year_id?
 */
const getPerformanceBySubject = async (req, res) => {
    const { term_id, academic_year_id } = req.query;

    const filters = [];
    const values = [];
    if (term_id) { filters.push("r.term_id = ?"); values.push(term_id); }
    if (academic_year_id) { filters.push("r.academic_year_id = ?"); values.push(academic_year_id); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
        const [rows] = await pool.execute(
            `SELECT sub.subject_name,
              ROUND(AVG(r.percentage), 1)                              AS average_percentage,
              ROUND(SUM(r.grade_code <= 6) / COUNT(r.id) * 100, 1)    AS pass_rate,
              COUNT(r.id)                                               AS entries
       FROM   results r
       JOIN   subjects sub ON sub.id = r.subject_id
       ${where}
       GROUP BY r.subject_id
       ORDER BY average_percentage DESC`,
            values
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── TOP PERFORMERS ───────────────────────────────────────────────────────────

/**
 * GET /api/analytics/top-performers
 * Query: term_id?, academic_year_id?, class_id?, limit? (default 10)
 */
const getTopPerformers = async (req, res) => {
    const { term_id, academic_year_id, class_id } = req.query;
    const limit = Number(req.query.limit) || 10;

    const filters = [];
    const values = [];
    if (term_id) { filters.push("r.term_id = ?"); values.push(term_id); }
    if (academic_year_id) { filters.push("r.academic_year_id = ?"); values.push(academic_year_id); }
    if (class_id) { filters.push("r.class_id = ?"); values.push(class_id); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
        const [rows] = await pool.execute(
            `SELECT st.id AS student_id, st.first_name, st.last_name, st.admission_number,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              ROUND(AVG(r.percentage), 1) AS average_percentage,
              COUNT(r.id)                 AS subjects_count
       FROM   results r
       JOIN   students st ON st.id = r.student_id
       JOIN   classes  c  ON c.id  = r.class_id
       ${where}
       GROUP BY r.student_id
       ORDER BY average_percentage DESC
       LIMIT ?`,
            [...values, limit]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getOverview, getEnrollmentTrends, getClassDistribution, getGenderDistribution,
    getAttendanceTrend, getPerformanceBySubject, getTopPerformers,
};