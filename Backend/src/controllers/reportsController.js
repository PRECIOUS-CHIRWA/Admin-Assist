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

const getSchoolId = (req) => (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;

// ─── ENROLLMENT REPORT ────────────────────────────────────────────────────────

/**
 * GET /api/reports/enrollment
 * Query: format? (json|csv), class_id?
 */
const getEnrollmentReport = async (req, res) => {
    const { format = "json", class_id } = req.query;
    const schoolId = getSchoolId(req);

    const filters = ["st.school_id = ?"];
    const values = [schoolId];
    if (class_id) { filters.push("st.class_id = ?"); values.push(class_id); }
    const where = `WHERE ${filters.join(" AND ")}`;

    try {
        const [rows] = await pool.execute(
            `SELECT st.id, st.admission_number, st.first_name, st.last_name,
              st.gender, st.date_of_birth, st.enrollment_date,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name
       FROM   students st
       LEFT JOIN classes c ON c.id = st.class_id
       ${where}
       ORDER BY COALESCE(CAST(REGEXP_SUBSTR(c.grade_level, '[0-9]+') AS UNSIGNED), 999) ASC, c.grade_level ASC, c.stream ASC, st.last_name`,
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
    const { format = "json", class_id, term_id, academic_year_id, student_id } = req.query;
    const schoolId = getSchoolId(req);

    const filters = ["st.school_id = ?"];
    const values = [schoolId];
    if (student_id)       { filters.push("ar.student_id = ?");       values.push(student_id); }
    if (class_id)         { filters.push("s.class_id = ?");          values.push(class_id); }
    if (term_id)          { filters.push("s.term_id = ?");           values.push(term_id); }
    if (academic_year_id) { filters.push("s.academic_year_id = ?"); values.push(academic_year_id); }

    const isTeachingMode = (req.user && (req.user.role === "staff" || req.query.teaching === "1" || req.user.is_teacher || req.user.school_position === "Teacher"));
    if (isTeachingMode) {
        const teacherId = req.user.sub || req.user.id;
        filters.push(`s.teacher_id = ? AND s.class_id IN (
            SELECT DISTINCT ts.class_id FROM teacher_subjects ts WHERE ts.teacher_id = ?
            UNION SELECT c2.id FROM classes c2 WHERE c2.class_teacher_id = ?
        )`);
        values.push(teacherId, teacherId, teacherId);
    }

    const where = `WHERE ${filters.join(" AND ")}`;

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
       ORDER BY COALESCE(CAST(REGEXP_SUBSTR(c.grade_level, '[0-9]+') AS UNSIGNED), 999) ASC, c.grade_level ASC, c.stream ASC, st.last_name`,
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
    const { format = "json", class_id, subject_id, term_id, academic_year_id, student_id } = req.query;
    const schoolId = getSchoolId(req);

    const filters = ["r.school_id = ?"];
    const values = [schoolId];
    if (student_id)       { filters.push("r.student_id = ?");       values.push(student_id); }
    if (class_id)         { filters.push("r.class_id = ?");         values.push(class_id); }
    if (subject_id)       { filters.push("r.subject_id = ?");       values.push(subject_id); }
    if (term_id)          { filters.push("r.term_id = ?");          values.push(term_id); }
    if (academic_year_id) { filters.push("r.academic_year_id = ?"); values.push(academic_year_id); }

    const isTeachingMode = (req.user && (req.user.role === "staff" || req.query.teaching === "1" || req.user.is_teacher || req.user.school_position === "Teacher"));
    if (isTeachingMode) {
        const teacherId = req.user.sub || req.user.id;
        filters.push(`(
            r.class_id IN (SELECT c2.id FROM classes c2 WHERE c2.class_teacher_id = ?)
            OR (r.class_id, r.subject_id) IN (SELECT ts.class_id, ts.subject_id FROM teacher_subjects ts WHERE ts.teacher_id = ?)
        )`);
        values.push(teacherId, teacherId);
    }
    const where = `WHERE ${filters.join(" AND ")}`;

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
        ORDER BY COALESCE(CAST(REGEXP_SUBSTR(c.grade_level, '[0-9]+') AS UNSIGNED), 999) ASC, c.grade_level ASC, c.stream ASC, sub.subject_name, r.class_position`,
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
 * High-level counts for the reports landing page, scoped to school.
 */
const getSummaryReport = async (req, res) => {
    const schoolId = getSchoolId(req);
    try {
        const [[studentTotals]] = await pool.execute(
            "SELECT COUNT(*) AS total_students FROM students WHERE school_id = ?",
            [schoolId]
        );

        const [[classTotals]] = await pool.execute(
            "SELECT COUNT(*) AS total_classes FROM classes WHERE school_id = ?",
            [schoolId]
        );

        const [[attendanceTotals]] = await pool.execute(
            `SELECT ROUND(SUM(ar.status = 'present') / COUNT(*) * 100, 1) AS overall_attendance_rate
       FROM   attendance_records ar
       JOIN   attendance_sessions s ON s.id = ar.session_id
       WHERE  s.school_id = ? AND ar.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
            [schoolId]
        );

        const [[resultsTotals]] = await pool.execute(
            `SELECT ROUND(AVG(percentage), 1) AS overall_average,
              ROUND(SUM(grade_code <= 6) / COUNT(*) * 100, 1) AS pass_rate
       FROM   results
       WHERE  school_id = ?`,
            [schoolId]
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

// ─── SUBJECT PERFORMANCE REPORT ───────────────────────────────────────────────────────────

/**
 * GET /api/reports/subject-performance
 * Query: format? (json|csv), term_id?, academic_year_id?
 * Average marks and pass rate per subject.
 */
const getSubjectPerformanceReport = async (req, res) => {
    const { format = 'json', term_id, academic_year_id } = req.query;
    const schoolId = getSchoolId(req);

    const filters = ['r.school_id = ?'];
    const values = [schoolId];
    if (term_id)          { filters.push('r.term_id = ?');           values.push(term_id); }
    if (academic_year_id) { filters.push('r.academic_year_id = ?'); values.push(academic_year_id); }
    const where = `WHERE ${filters.join(' AND ')}`;

    try {
        const [rows] = await pool.execute(
            `SELECT sub.subject_code, sub.subject_name,
              COUNT(r.id)                                                   AS entries,
              ROUND(AVG(r.percentage), 1)                                   AS avg_percentage,
              ROUND(AVG(r.total_marks), 1)                                  AS avg_total,
              SUM(r.grade_code <= 6)                                        AS passes,
              ROUND(SUM(r.grade_code <= 6) / COUNT(r.id) * 100, 1)         AS pass_rate,
              MIN(r.percentage)                                             AS min_pct,
              MAX(r.percentage)                                             AS max_pct
       FROM   results r
       JOIN   subjects sub ON sub.id = r.subject_id
       ${where}
       GROUP BY r.subject_id
       ORDER BY avg_percentage DESC`,
            values
        );

        if (format === 'csv') {
            const csv = toCsv(rows, [
                { key: 'subject_code',  label: 'Code' },
                { key: 'subject_name',  label: 'Subject' },
                { key: 'entries',       label: 'Entries' },
                { key: 'avg_percentage', label: 'Avg %' },
                { key: 'avg_total',     label: 'Avg Total' },
                { key: 'passes',        label: 'Passes' },
                { key: 'pass_rate',     label: 'Pass Rate (%)' },
                { key: 'min_pct',       label: 'Min %' },
                { key: 'max_pct',       label: 'Max %' },
            ]);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=subject_performance.csv');
            return res.send(csv);
        }

        res.json({ total: rows.length, subjects: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── TOP PERFORMERS REPORT ──────────────────────────────────────────────────────────────

/**
 * GET /api/reports/top-performers
 * Query: format? (json|csv), term_id?, academic_year_id?, limit? (default 20)
 * Students ranked by overall average percentage.
 */
const getTopPerformersReport = async (req, res) => {
    const { format = 'json', term_id, academic_year_id, limit = 20 } = req.query;
    const schoolId = getSchoolId(req);

    const filters = ['r.school_id = ?'];
    const values = [schoolId];
    if (term_id)          { filters.push('r.term_id = ?');           values.push(term_id); }
    if (academic_year_id) { filters.push('r.academic_year_id = ?'); values.push(academic_year_id); }
    const where = `WHERE ${filters.join(' AND ')}`;

    try {
        const [rows] = await pool.execute(
            `SELECT st.admission_number, st.first_name, st.last_name,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              ROUND(AVG(r.percentage), 1)                                          AS avg_percentage,
              COUNT(r.id)                                                           AS subjects_recorded
       FROM   results r
       JOIN   students st ON st.id = r.student_id
       LEFT JOIN classes  c  ON c.id  = st.class_id
       ${where}
       GROUP BY r.student_id
       ORDER BY avg_percentage DESC
       LIMIT ?`,
            [...values, Number(limit)]
        );

        if (format === 'csv') {
            const csv = toCsv(rows, [
                { key: 'admission_number',   label: 'Admission No' },
                { key: 'first_name',         label: 'First Name' },
                { key: 'last_name',          label: 'Last Name' },
                { key: 'class_name',         label: 'Class' },
                { key: 'avg_percentage',     label: 'Average (%)' },
                { key: 'subjects_recorded',  label: 'Subjects' },
            ]);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=top_performers.csv');
            return res.send(csv);
        }

        res.json({ total: rows.length, students: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── INTERVENTION REPORT (Students At Risk) ──────────────────────────────────────────────────

/**
 * GET /api/reports/intervention
 * Query: format? (json|csv), term_id?, academic_year_id?, threshold? (default 50)
 * Students whose average is below the threshold — requires academic intervention.
 */
const getInterventionReport = async (req, res) => {
    const { format = 'json', term_id, academic_year_id, threshold = 50 } = req.query;
    const schoolId = getSchoolId(req);

    const filters = ['r.school_id = ?'];
    const values = [schoolId];
    if (term_id)          { filters.push('r.term_id = ?');           values.push(term_id); }
    if (academic_year_id) { filters.push('r.academic_year_id = ?'); values.push(academic_year_id); }
    const where = `WHERE ${filters.join(' AND ')}`;

    try {
        const [rows] = await pool.execute(
            `SELECT st.admission_number, st.first_name, st.last_name, st.phone_number,
              st.parent_guardian_name,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              ROUND(AVG(r.percentage), 1)                                          AS avg_percentage,
              COUNT(r.id)                                                           AS subjects_recorded,
              SUM(r.grade_code = 9)                                                AS fails
       FROM   results r
       JOIN   students st ON st.id = r.student_id
       LEFT JOIN classes  c  ON c.id  = st.class_id
       ${where}
       GROUP BY r.student_id
       HAVING avg_percentage < ?
       ORDER BY avg_percentage ASC`,
            [...values, Number(threshold)]
        );

        if (format === 'csv') {
            const csv = toCsv(rows, [
                { key: 'admission_number',  label: 'Admission No' },
                { key: 'first_name',        label: 'First Name' },
                { key: 'last_name',         label: 'Last Name' },
                { key: 'class_name',        label: 'Class' },
                { key: 'avg_percentage',    label: 'Average (%)' },
                { key: 'fails',             label: 'Failed Subjects' },
                { key: 'parent_guardian_name', label: 'Parent/Guardian' },
                { key: 'phone_number',      label: 'Contact' },
            ]);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=students_at_risk.csv');
            return res.send(csv);
        }

        res.json({ total: rows.length, students: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── PER-STUDENT ATTENDANCE SUMMARY ──────────────────────────────────────────

/**
 * GET /api/reports/student-attendance/:studentId
 * Query: academic_year_id?
 * Returns a single student's attendance summary stats.
 */
const getStudentAttendanceSummary = async (req, res) => {
    const { studentId } = req.params;
    const { academic_year_id } = req.query;

    const filters = ["ar.student_id = ?"];
    const values  = [studentId];
    if (academic_year_id) {
        filters.push("s.academic_year_id = ?");
        values.push(academic_year_id);
    }

    // Staff only see attendance for their own sessions and students
    if (req.user && req.user.role === "staff") {
        const teacherId = req.user.sub || req.user.id;
        filters.push(`s.teacher_id = ? AND s.class_id IN (
            SELECT DISTINCT ts.class_id FROM teacher_subjects ts WHERE ts.teacher_id = ?
            UNION SELECT c2.id FROM classes c2 WHERE c2.class_teacher_id = ?
        )`);
        values.push(teacherId, teacherId, teacherId);
    }

    const where = `WHERE ${filters.join(" AND ")}`;

    try {
        const [[row]] = await pool.execute(
            `SELECT st.id, st.first_name, st.last_name, st.admission_number,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              COUNT(ar.id)                                                          AS total_sessions,
              SUM(ar.status = 'present')                                           AS present,
              SUM(ar.status = 'absent')                                            AS absent,
              SUM(ar.status = 'late')                                              AS late,
              SUM(ar.status = 'excused')                                           AS excused,
              ROUND(
                CASE WHEN COUNT(ar.id) = 0 THEN 0
                     ELSE SUM(ar.status = 'present') / COUNT(ar.id) * 100
                END, 1
              ) AS attendance_rate
       FROM   attendance_records ar
       JOIN   attendance_sessions s  ON s.id  = ar.session_id
       JOIN   students            st ON st.id = ar.student_id
       LEFT JOIN classes          c  ON c.id  = st.class_id
       ${where}
       GROUP BY ar.student_id`,
            values
        );

        if (!row) {
            // Student exists but no attendance records yet — return zero summary
            const [[student]] = await pool.execute(
                `SELECT st.id, st.first_name, st.last_name, st.admission_number,
                  CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name
                 FROM students st LEFT JOIN classes c ON c.id = st.class_id
                 WHERE st.id = ? LIMIT 1`,
                [studentId]
            );
            if (!student) return res.status(404).json({ error: "Student not found" });
            return res.json({
                student,
                total_sessions: 0, present: 0, absent: 0,
                late: 0, excused: 0, attendance_rate: 0,
            });
        }

        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getEnrollmentReport, getAttendanceReport, getAcademicReport, getSummaryReport,
    getSubjectPerformanceReport, getTopPerformersReport, getInterventionReport,
    getStudentAttendanceSummary,
};
