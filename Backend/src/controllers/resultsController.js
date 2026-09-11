const pool = require("../config/db");
const { sendNotification } = require("./notificationController");

// ─── ECZ Grading Scale ────────────────────────────────────────────────────────

const getECZGrade = (percentage) => {
    if (percentage >= 75) return { code: 1, classification: "Distinction 1", remarks: "Outstanding" };
    if (percentage >= 70) return { code: 2, classification: "Distinction 2", remarks: "Excellent" };
    if (percentage >= 64) return { code: 3, classification: "Merit 3",       remarks: "Very Good" };
    if (percentage >= 60) return { code: 4, classification: "B Merit 4",     remarks: "Good" };
    if (percentage >= 54) return { code: 5, classification: "Credit 5",      remarks: "Credit Pass" };
    if (percentage >= 50) return { code: 6, classification: "Credit 6",      remarks: "Credit Pass" };
    if (percentage >= 40) return { code: 7, classification: "Satisfactory 7",remarks: "Satisfactory" };
    if (percentage >= 30) return { code: 8, classification: "Satisfactory 8",remarks: "Satisfactory" };
    return { code: 9, classification: "Fail", remarks: "Fail" };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const requireFields = (body, fields) => {
    const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
    return missing.length ? `${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} required` : null;
};

// ─── RESULTS CRUD ─────────────────────────────────────────────────────────────

/**
 * GET /api/results
 * Query: class_id?, subject_id?, term_id?, academic_year_id?
 */
const getResults = async (req, res) => {
    const { class_id, subject_id, term_id, academic_year_id } = req.query;

    const filters = [];
    const values = [];
    if (class_id) { filters.push("r.class_id = ?"); values.push(class_id); }
    if (subject_id) { filters.push("r.subject_id = ?"); values.push(subject_id); }
    if (term_id) { filters.push("r.term_id = ?"); values.push(term_id); }
    if (academic_year_id) { filters.push("r.academic_year_id = ?"); values.push(academic_year_id); }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
        const [rows] = await pool.execute(
            `SELECT r.*,
              st.first_name, st.last_name, st.admission_number,
              sub.subject_code, sub.subject_name,
              t.term_name, ay.year_label,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              u.name AS teacher_name
       FROM   results r
       JOIN   students      st  ON st.id  = r.student_id
       JOIN   subjects      sub ON sub.id = r.subject_id
       JOIN   terms         t   ON t.id   = r.term_id
       JOIN   academic_years ay ON ay.id  = r.academic_year_id
       JOIN   classes       c   ON c.id   = r.class_id
       JOIN   users         u   ON u.id   = r.teacher_id
       ${where}
       ORDER BY st.last_name, st.first_name, sub.subject_name`,
            values
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/results/:id
 */
const getResultById = async (req, res) => {
    const { id } = req.params;

    try {
        const [[result]] = await pool.execute(
            `SELECT r.*,
              st.first_name, st.last_name, st.admission_number,
              sub.subject_code, sub.subject_name,
              t.term_name, ay.year_label,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name
       FROM   results r
       JOIN   students      st  ON st.id  = r.student_id
       JOIN   subjects      sub ON sub.id = r.subject_id
       JOIN   terms         t   ON t.id   = r.term_id
       JOIN   academic_years ay ON ay.id  = r.academic_year_id
       JOIN   classes       c   ON c.id   = r.class_id
       WHERE  r.id = ?`,
            [id]
        );
        if (!result) return res.status(404).json({ error: "Result not found" });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/results
 * Body: { student_id, subject_id, class_id, term_id, academic_year_id,
 *         test_mark, assignment_mark, exam_mark, teacher_comment? }
 * Backend calculates total, percentage, and ECZ grade automatically.
 * Staff can only enter results for subjects/classes they are assigned to.
 */
const createResult = async (req, res) => {
    const {
        student_id, subject_id, class_id, term_id, academic_year_id,
        test_mark = 0, assignment_mark = 0, exam_mark = 0, teacher_comment = null,
    } = req.body;

    const fieldErr = requireFields(req.body, ["student_id", "subject_id", "class_id", "term_id", "academic_year_id"]);
    if (fieldErr) return res.status(400).json({ error: fieldErr });

    // JWT payload uses `sub` (not `id`) — req.user.sub is the authenticated user's DB id
    const teacher_id = req.user.sub;
    const schoolId = (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;

    // Staff: must be assigned to this class/subject
    if (req.user.role === "staff") {
        try {
            const [[assigned]] = await pool.execute(
                `SELECT id FROM teacher_subjects
                 WHERE teacher_id = ? AND subject_id = ? AND class_id = ?
                 LIMIT 1`,
                [teacher_id, subject_id, class_id]
            );
            if (!assigned) {
                // Also allow if they are class teacher
                const [[isClassTeacher]] = await pool.execute(
                    "SELECT id FROM classes WHERE id = ? AND class_teacher_id = ? LIMIT 1",
                    [class_id, teacher_id]
                );
                if (!isClassTeacher) {
                    return res.status(403).json({ error: "You are not assigned to teach this subject in this class" });
                }
            }
        } catch (err) {
            console.error("createResult teacher check:", err.message);
        }
    }

    const total_marks = Number(test_mark) + Number(assignment_mark) + Number(exam_mark);

    // Default full marks: test=30, assignment=20, exam=50 (total 100)
    const full_marks = 100;
    const percentage = Math.min((total_marks / full_marks) * 100, 100);
    const { code, classification, remarks } = getECZGrade(percentage);

    try {
        const [result] = await pool.execute(
            `INSERT INTO results
         (school_id, student_id, subject_id, teacher_id, class_id, term_id, academic_year_id,
          test_mark, assignment_mark, exam_mark, total_marks, percentage,
          grade_code, grade_classification, remarks, teacher_comment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                schoolId,
                student_id, subject_id, teacher_id, class_id, term_id, academic_year_id,
                test_mark, assignment_mark, exam_mark,
                total_marks.toFixed(2), percentage.toFixed(2),
                code, classification, remarks, teacher_comment,
            ]
        );

        // Recalculate class positions for this subject/term
        await recalculatePositions(subject_id, class_id, term_id, academic_year_id);

        const [[created]] = await pool.execute("SELECT * FROM results WHERE id = ?", [result.insertId]);

        // Notify the submitting teacher that their result was recorded (non-fatal)
        try {
            const [[sub]] = await pool.execute("SELECT subject_name FROM subjects WHERE id = ? LIMIT 1", [subject_id]);
            const subName = sub ? sub.subject_name : "a subject";
            await sendNotification({
                userId: teacher_id,
                type: "academics",
                title: "Result Recorded",
                description: `Result for ${subName} was saved successfully (${classification}, ${percentage.toFixed(1)}%).`,
                entityType: "result",
                entityId: result.insertId,
            });
        } catch { /* non-fatal */ }

        res.status(201).json({ message: "Result recorded successfully", result: created });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "A result already exists for this student/subject/term. Use PUT to update." });
        }
        res.status(500).json({ error: err.message });
    }
};

/**
 * PUT /api/results/:id
 * Body: { test_mark?, assignment_mark?, exam_mark?, teacher_comment? }
 * Recalculates grade automatically on update.
 * Staff: can only update results for subjects/classes they are assigned to.
 */
const updateResult = async (req, res) => {
    const { id } = req.params;
    const { test_mark, assignment_mark, exam_mark, teacher_comment } = req.body;

    try {
        const [[existing]] = await pool.execute(
            "SELECT * FROM results WHERE id = ?",
            [id]
        );
        if (!existing) return res.status(404).json({ error: "Result not found" });

        // Staff: must be assigned to this class/subject
        if (req.user.role === "staff") {
            const teacher_id = req.user.sub;
            const [[assigned]] = await pool.execute(
                `SELECT id FROM teacher_subjects
                 WHERE teacher_id = ? AND subject_id = ? AND class_id = ?
                 LIMIT 1`,
                [teacher_id, existing.subject_id, existing.class_id]
            ).catch(() => [[null]]);
            if (!assigned) {
                const [[isClassTeacher]] = await pool.execute(
                    "SELECT id FROM classes WHERE id = ? AND class_teacher_id = ? LIMIT 1",
                    [existing.class_id, teacher_id]
                ).catch(() => [[null]]);
                if (!isClassTeacher) {
                    return res.status(403).json({ error: "You are not authorized to update this result" });
                }
            }
        }

        const newTest = test_mark !== undefined ? Number(test_mark) : existing.test_mark;
        const newAssign = assignment_mark !== undefined ? Number(assignment_mark) : existing.assignment_mark;
        const newExam = exam_mark !== undefined ? Number(exam_mark) : existing.exam_mark;

        const total_marks = newTest + newAssign + newExam;
        const percentage = Math.min((total_marks / 100) * 100, 100);
        const { code, classification, remarks } = getECZGrade(percentage);

        const fields = [
            "test_mark = ?", "assignment_mark = ?", "exam_mark = ?",
            "total_marks = ?", "percentage = ?",
            "grade_code = ?", "grade_classification = ?", "remarks = ?",
            "updated_at = CURRENT_TIMESTAMP",
        ];
        const values = [
            newTest, newAssign, newExam,
            total_marks.toFixed(2), percentage.toFixed(2),
            code, classification, remarks,
        ];

        if (teacher_comment !== undefined) {
            fields.splice(-1, 0, "teacher_comment = ?");
            values.splice(-1, 0, teacher_comment);
        }

        values.push(id);
        await pool.execute(`UPDATE results SET ${fields.join(", ")} WHERE id = ?`, values);

        // Recalculate positions
        await recalculatePositions(
            existing.subject_id, existing.class_id, existing.term_id, existing.academic_year_id
        );

        res.json({ message: "Result updated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * DELETE /api/results/:id
 */
const deleteResult = async (req, res) => {
    const { id } = req.params;

    try {
        const [[existing]] = await pool.execute("SELECT subject_id, class_id, term_id, academic_year_id FROM results WHERE id = ?", [id]);
        if (!existing) return res.status(404).json({ error: "Result not found" });

        await pool.execute("DELETE FROM results WHERE id = ?", [id]);
        await recalculatePositions(
            existing.subject_id, existing.class_id, existing.term_id, existing.academic_year_id
        );

        res.json({ message: "Result deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── Position recalculation helper ───────────────────────────────────────────

const recalculatePositions = async (subject_id, class_id, term_id, academic_year_id) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id FROM results
       WHERE  subject_id = ? AND class_id = ? AND term_id = ? AND academic_year_id = ?
       ORDER BY percentage DESC, total_marks DESC`,
            [subject_id, class_id, term_id, academic_year_id]
        );

        for (let i = 0; i < rows.length; i++) {
            await pool.execute(
                "UPDATE results SET class_position = ? WHERE id = ?",
                [i + 1, rows[i].id]
            );
        }
    } catch (_) {
        // Non-critical — position update failure should not block the main response
    }
};

// ─── STUDENT RESULTS ──────────────────────────────────────────────────────────

/**
 * GET /api/results/student/:studentId
 * Query: term_id?, academic_year_id?
 * Role: user = only own results (IDOR check). staff/admin = any student in school.
 */
const getStudentResults = async (req, res) => {
    const { studentId } = req.params;
    const { term_id, academic_year_id } = req.query;
    const schoolId = (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;
    const role = req.user.role;
    const userId = req.user.sub || req.user.id;

    try {
        // IDOR: user may only view their own results
        if (role === "user") {
            const [[linked]] = await pool.execute(
                "SELECT id FROM students WHERE user_id = ? AND id = ? AND school_id = ? LIMIT 1",
                [userId, studentId, schoolId]
            );
            if (!linked) {
                return res.status(403).json({ error: "Access denied" });
            }
        }

        const [[student]] = await pool.execute(
            "SELECT id, first_name, last_name, admission_number, class_id FROM students WHERE id = ? AND school_id = ?",
            [studentId, schoolId]
        );
        if (!student) return res.status(404).json({ error: "Student not found" });

        const filters = ["r.student_id = ?"];
        const values = [studentId];
        if (term_id) { filters.push("r.term_id = ?"); values.push(term_id); }
        if (academic_year_id) { filters.push("r.academic_year_id = ?"); values.push(academic_year_id); }

        const [results] = await pool.execute(
            `SELECT r.*,
              sub.subject_code, sub.subject_name,
              t.term_name, ay.year_label
       FROM   results r
       JOIN   subjects      sub ON sub.id = r.subject_id
       JOIN   terms         t   ON t.id   = r.term_id
       JOIN   academic_years ay ON ay.id  = r.academic_year_id
       WHERE  ${filters.join(" AND ")}
       ORDER BY sub.subject_name`,
            values
        );

        const totalSubjects = results.length;
        const avgPercentage = totalSubjects
            ? (results.reduce((s, r) => s + parseFloat(r.percentage), 0) / totalSubjects).toFixed(1)
            : 0;

        res.json({
            student,
            results,
            summary: { total_subjects: totalSubjects, average_percentage: avgPercentage },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/results/class/:classId
 * Query: subject_id?, term_id?, academic_year_id?
 */
const getClassResults = async (req, res) => {
    const { classId } = req.params;
    const { subject_id, term_id, academic_year_id } = req.query;

    const filters = ["r.class_id = ?"];
    const values = [classId];
    if (subject_id) { filters.push("r.subject_id = ?"); values.push(subject_id); }
    if (term_id) { filters.push("r.term_id = ?"); values.push(term_id); }
    if (academic_year_id) { filters.push("r.academic_year_id = ?"); values.push(academic_year_id); }

    try {
        const [rows] = await pool.execute(
            `SELECT r.*,
              st.first_name, st.last_name, st.admission_number,
              sub.subject_code, sub.subject_name,
              t.term_name, ay.year_label
       FROM   results r
       JOIN   students      st  ON st.id  = r.student_id
       JOIN   subjects      sub ON sub.id = r.subject_id
       JOIN   terms         t   ON t.id   = r.term_id
       JOIN   academic_years ay ON ay.id  = r.academic_year_id
       WHERE  ${filters.join(" AND ")}
       ORDER BY (r.class_position IS NULL), r.class_position ASC, st.last_name`,
            values
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── TRANSCRIPT ───────────────────────────────────────────────────────────────

/**
 * GET /api/results/transcript/:studentId
 * Query: academic_year_id?
 * Returns structured transcript data grouped by term.
 * Role: user = only own transcript (IDOR protection).
 */
const generateTranscript = async (req, res) => {
    const { studentId } = req.params;
    const { academic_year_id } = req.query;
    const schoolId = (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;
    const role = req.user.role;
    const userId = req.user.sub || req.user.id;

    try {
        // IDOR: user may only view their own transcript
        if (role === "user") {
            const [[linked]] = await pool.execute(
                "SELECT id FROM students WHERE user_id = ? AND id = ? AND school_id = ? LIMIT 1",
                [userId, studentId, schoolId]
            );
            if (!linked) {
                return res.status(403).json({ error: "Access denied" });
            }
        }

        const filters = ["r.student_id = ?"];
        const values = [studentId];
        if (academic_year_id) { filters.push("r.academic_year_id = ?"); values.push(academic_year_id); }

        const [[student]] = await pool.execute(
            `SELECT st.*,
                    COALESCE(
                        NULLIF(CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')), ''),
                        NULLIF(CONCAT(st.grade, IF(st.section != '' AND st.section IS NOT NULL, CONCAT(' ', st.section), '')), ''),
                        'Not assigned'
                    ) AS class_name
       FROM   students st
       LEFT JOIN classes c ON c.id = st.class_id
       WHERE  st.id = ? AND st.school_id = ?`,
            [studentId, schoolId]
        );
        if (!student) return res.status(404).json({ error: "Student not found" });

        const [results] = await pool.execute(
            `SELECT r.*,
              sub.subject_code, sub.subject_name,
              t.term_number, t.term_name,
              ay.year_label
       FROM   results r
       JOIN   subjects      sub ON sub.id = r.subject_id
       JOIN   terms         t   ON t.id   = r.term_id
       JOIN   academic_years ay ON ay.id  = r.academic_year_id
       WHERE  ${filters.join(" AND ")}
       ORDER BY t.term_number, sub.subject_name`,
            values
        );

        // Group by term
        const byTerm = {};
        for (const r of results) {
            const key = `${r.year_label}-T${r.term_number}`;
            if (!byTerm[key]) {
                byTerm[key] = {
                    term_name: r.term_name, year_label: r.year_label,
                    term_number: r.term_number, subjects: [],
                };
            }
            byTerm[key].subjects.push(r);
        }

        // Compute term averages
        const terms = Object.values(byTerm).map((term) => {
            const avg =
                term.subjects.length
                    ? (term.subjects.reduce((s, r) => s + parseFloat(r.percentage), 0) / term.subjects.length).toFixed(1)
                    : 0;
            return { ...term, average_percentage: avg };
        });

        // ─── Attendance summary for this student ────────────────────────────
        const attFilters = ['ar.student_id = ?'];
        const attValues = [studentId];
        if (academic_year_id) {
            attFilters.push('sess.academic_year_id = ?');
            attValues.push(academic_year_id);
        }

        const [[attRow]] = await pool.execute(
            `SELECT
               COUNT(ar.id)               AS total_sessions,
               SUM(ar.status = 'present') AS present,
               SUM(ar.status = 'absent')  AS absent,
               SUM(ar.status = 'late')    AS late,
               SUM(ar.status = 'excused') AS excused
       FROM   attendance_records ar
       JOIN   attendance_sessions sess ON sess.id = ar.session_id
       WHERE  ${attFilters.join(' AND ')}`,
            attValues
        );

        const attendance_summary = {
            total_sessions : Number(attRow.total_sessions) || 0,
            present        : Number(attRow.present)        || 0,
            absent         : Number(attRow.absent)         || 0,
            late           : Number(attRow.late)           || 0,
            excused        : Number(attRow.excused)        || 0,
            attendance_rate: attRow.total_sessions
                ? ((attRow.present / attRow.total_sessions) * 100).toFixed(1)
                : '0.0',
        };

        let school_name = process.env.SCHOOL_NAME || 'Admin Assist School';
        try {
            const [[settingRow]] = await pool.execute(
                "SELECT school_name FROM school_settings WHERE school_id = 1 LIMIT 1"
            );
            if (settingRow && settingRow.school_name) {
                school_name = settingRow.school_name;
            } else {
                const [[schoolRow]] = await pool.execute(
                    "SELECT name FROM schools WHERE id = 1 LIMIT 1"
                );
                if (schoolRow && schoolRow.name) {
                    school_name = schoolRow.name;
                }
            }
        } catch { /* use default school_name */ }

        res.json({ student, terms, attendance_summary, school_name, generated_at: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

/**
 * GET /api/results/analytics
 * Query: academic_year_id?, term_id?
 */
const getResultsAnalytics = async (req, res) => {
    const { academic_year_id, term_id } = req.query;

    const filters = [];
    const values = [];
    if (academic_year_id) { filters.push("r.academic_year_id = ?"); values.push(academic_year_id); }
    if (term_id) { filters.push("r.term_id = ?"); values.push(term_id); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
        const [[overall]] = await pool.execute(
            `SELECT COUNT(*)                                                   AS total_entries,
              AVG(r.percentage)                                          AS overall_average,
              SUM(r.grade_code <= 6)                                    AS passes,
              SUM(r.grade_code = 9)                                     AS failures,
              ROUND(SUM(r.grade_code <= 6) / COUNT(*) * 100, 1)        AS pass_rate
       FROM   results r
       ${where}`,
            values
        );

        const [bySubject] = await pool.execute(
            `SELECT sub.subject_name,
              COUNT(r.id)             AS total,
              ROUND(AVG(r.percentage), 1)  AS avg_percentage,
              SUM(r.grade_code <= 6)  AS passes,
              ROUND(SUM(r.grade_code <= 6) / COUNT(r.id) * 100, 1) AS pass_rate
       FROM   results r
       JOIN   subjects sub ON sub.id = r.subject_id
       ${where}
       GROUP BY r.subject_id
       ORDER BY avg_percentage DESC`,
            values
        );

        const [gradeDistribution] = await pool.execute(
            `SELECT r.grade_code,
              r.grade_classification,
              COUNT(*) AS count
       FROM   results r
       ${where}
       GROUP BY r.grade_code, r.grade_classification
       ORDER BY r.grade_code`,
            values
        );

        res.json({ overall, bySubject, gradeDistribution });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getResults, getResultById, createResult, updateResult, deleteResult,
    getStudentResults, getClassResults, generateTranscript, getResultsAnalytics,
    getECZGrade, // exported so reports controller can import it
};