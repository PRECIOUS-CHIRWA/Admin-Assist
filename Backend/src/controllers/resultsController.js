const pool = require("../config/db");
const { sendNotification } = require("./notificationController");
const {
    DEFAULT_POLICY,
    getECZGrade,
    validatePolicyWeights,
    isScoreProvided,
    calculateFinalMark,
} = require("../services/assessmentCalculationService");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const requireFields = (body, fields) => {
    const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
    return missing.length ? `${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} required` : null;
};

const getSchoolPolicy = async (schoolId) => {
    try {
        const [[row]] = await pool.execute(
            `SELECT assessment_model, mid_term_weight, final_term_weight,
                    continuous_assessment_enabled, continuous_assessment_weight,
                    grading_scheme
             FROM school_settings WHERE school_id = ? LIMIT 1`,
            [schoolId]
        );
        return row ? { ...DEFAULT_POLICY, ...row } : DEFAULT_POLICY;
    } catch {
        return DEFAULT_POLICY;
    }
};

// ─── POLICY ENDPOINTS ─────────────────────────────────────────────────────────

/**
 * GET /api/results/policy
 * Retrieve school's active assessment policy
 */
const getAssessmentPolicy = async (req, res) => {
    const schoolId = (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;
    try {
        const policy = await getSchoolPolicy(schoolId);
        res.json({ policy });
    } catch (err) {
        console.error("getAssessmentPolicy error:", err.message);
        res.status(500).json({ error: "Failed to load assessment policy" });
    }
};

/**
 * PUT /api/results/policy
 * Update school's assessment policy (admin / headmaster only)
 */
const updateAssessmentPolicy = async (req, res) => {
    const schoolId = (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;
    const {
        assessment_model = "MID_TERM_FINAL",
        mid_term_weight = 20.0,
        final_term_weight = 80.0,
        continuous_assessment_enabled = 0,
        continuous_assessment_weight = 0.0,
        grading_scheme = "ADMIN_ASSIST_ECZ",
    } = req.body;

    try {
        validatePolicyWeights({
            mid_term_weight,
            final_term_weight,
            continuous_assessment_enabled,
            continuous_assessment_weight,
        });

        await pool.execute(
            `UPDATE school_settings 
             SET assessment_model = ?, 
                 mid_term_weight = ?, 
                 final_term_weight = ?, 
                 continuous_assessment_enabled = ?, 
                 continuous_assessment_weight = ?, 
                 grading_scheme = ?
             WHERE school_id = ?`,
            [
                assessment_model,
                Number(mid_term_weight),
                Number(final_term_weight),
                continuous_assessment_enabled ? 1 : 0,
                Number(continuous_assessment_weight || 0),
                grading_scheme,
                schoolId,
            ]
        );

        const updated = await getSchoolPolicy(schoolId);
        res.json({ message: "Assessment policy updated successfully", policy: updated });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

/**
 * POST /api/results/calculate-preview
 * Authoritative preview calculation for frontend live editing
 */
const calculatePreview = async (req, res) => {
    const schoolId = (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;
    const { mid_term_score, final_term_score, continuous_assessment_score } = req.body;

    try {
        const policy = await getSchoolPolicy(schoolId);
        const result = calculateFinalMark({
            midTermScore: mid_term_score,
            finalTermScore: final_term_score,
            continuousAssessmentScore: continuous_assessment_score,
            policy,
        });
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// ─── RESULTS CRUD ─────────────────────────────────────────────────────────────

/**
 * GET /api/results
 * Query: class_id?, subject_id?, term_id?, academic_year_id?
 * Note: Staff can ONLY view results of classes/subjects they are assigned to teach!
 */
const getResults = async (req, res) => {
    const { class_id, subject_id, term_id, academic_year_id } = req.query;
    const schoolId = (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;
    const role = req.user?.role || "user";
    const teacherId = req.user?.sub || req.user?.id;

    const filters = ["r.school_id = ?"];
    const values = [schoolId];

    // Teacher scoping: only classes and subjects assigned to this teacher
    const isTeacherUser = (role === "staff" || req.user?.is_teacher || req.user?.school_position === "Teacher" || req.query.teaching === "1");
    if (isTeacherUser) {
        filters.push(`(
            r.class_id IN (SELECT id FROM classes WHERE class_teacher_id = ? AND school_id = ?)
            OR (r.class_id, r.subject_id) IN (SELECT class_id, subject_id FROM teacher_subjects WHERE teacher_id = ?)
        )`);
        values.push(teacherId, schoolId, teacherId);
    }

    if (class_id) { filters.push("r.class_id = ?"); values.push(class_id); }
    if (subject_id) { filters.push("r.subject_id = ?"); values.push(subject_id); }
    if (term_id) { filters.push("r.term_id = ?"); values.push(term_id); }
    if (academic_year_id) { filters.push("r.academic_year_id = ?"); values.push(academic_year_id); }

    const where = `WHERE ${filters.join(" AND ")}`;

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
       LEFT JOIN users      u   ON u.id   = r.teacher_id
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
    const schoolId = (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;

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
       WHERE  r.id = ? AND r.school_id = ?`,
            [id, schoolId]
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
 *         mid_term_score, final_term_score, continuous_assessment_score?, teacher_comment? }
 * Authoritative backend calculation using school assessment policy.
 * Staff can only enter results for subjects/classes they are assigned to.
 */
const createResult = async (req, res) => {
    const {
        student_id, subject_id, class_id, term_id, academic_year_id,
        mid_term_score, final_term_score, continuous_assessment_score,
        test_mark, assignment_mark, exam_mark, teacher_comment = null,
    } = req.body;

    const fieldErr = requireFields(req.body, ["student_id", "subject_id", "class_id", "term_id", "academic_year_id"]);
    if (fieldErr) return res.status(400).json({ error: fieldErr });

    const teacher_id = req.user.sub || req.user.id;
    const schoolId = (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;

    // Must be assigned to teach this class/subject
    const isTeacherUser = (req.user.role === "staff" || req.user?.is_teacher || req.user?.school_position === "Teacher" || req.query.teaching === "1");
    if (isTeacherUser) {
        try {
            const [[assigned]] = await pool.execute(
                `SELECT id FROM teacher_subjects
                 WHERE teacher_id = ? AND subject_id = ? AND class_id = ?
                 LIMIT 1`,
                [teacher_id, subject_id, class_id]
            );
            if (!assigned) {
                return res.status(403).json({ error: "You are not assigned to teach this subject in this class" });
            }
        } catch (err) {
            console.error("createResult teacher check:", err.message);
        }
    }

    try {
        const policy = await getSchoolPolicy(schoolId);

        // Support both mid_term_score / final_term_score and legacy test_mark / exam_mark
        const midScoreInput = mid_term_score !== undefined ? mid_term_score : (test_mark !== undefined ? test_mark : null);
        const finScoreInput = final_term_score !== undefined ? final_term_score : (exam_mark !== undefined ? exam_mark : null);
        const caScoreInput = continuous_assessment_score !== undefined ? continuous_assessment_score : (assignment_mark !== undefined ? assignment_mark : null);

        const calc = calculateFinalMark({
            midTermScore: midScoreInput,
            finalTermScore: finScoreInput,
            continuousAssessmentScore: caScoreInput,
            policy,
        });

        const legacyTotal = calc.finalMark !== null 
            ? calc.finalMark 
            : (Number(calc.midTermScore || 0) + Number(calc.finalTermScore || 0));
        const legacyPercentage = calc.percentage !== null ? calc.percentage : 0;
        const legacyGradeCode = calc.gradeCode !== null ? calc.gradeCode : 9;

        const [result] = await pool.execute(
            `INSERT INTO results
         (school_id, student_id, subject_id, teacher_id, class_id, term_id, academic_year_id,
          mid_term_score, final_term_score, continuous_assessment_score, final_mark,
          test_mark, assignment_mark, exam_mark, total_marks, percentage,
          grade_code, grade_classification, remarks, status, assessment_policy_snapshot, teacher_comment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                schoolId,
                student_id, subject_id, teacher_id, class_id, term_id, academic_year_id,
                calc.midTermScore, calc.finalTermScore, calc.continuousAssessmentScore, calc.finalMark,
                calc.midTermScore || 0, calc.continuousAssessmentScore || 0, calc.finalTermScore || 0,
                legacyTotal, legacyPercentage,
                legacyGradeCode, calc.gradeClassification, calc.remarks, calc.status,
                JSON.stringify(calc.policySnapshot), teacher_comment,
            ]
        );

        // Recalculate class positions for this subject/term
        await recalculatePositions(subject_id, class_id, term_id, academic_year_id);

        const [[created]] = await pool.execute("SELECT * FROM results WHERE id = ?", [result.insertId]);

        // Notify teacher of recorded result (non-fatal)
        try {
            const [[sub]] = await pool.execute("SELECT subject_name FROM subjects WHERE id = ? LIMIT 1", [subject_id]);
            const subName = sub ? sub.subject_name : "a subject";
            await sendNotification({
                userId: teacher_id,
                type: "academics",
                title: "Result Recorded",
                description: `Result for ${subName} was saved successfully (${calc.gradeClassification}, ${calc.finalMark !== null ? calc.finalMark + '%' : 'Pending'}).`,
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
 * Body: { mid_term_score?, final_term_score?, continuous_assessment_score?, teacher_comment? }
 * Recalculates grade automatically on update.
 * Staff: can only update results for subjects/classes they are assigned to.
 * Cannot modify approved results unless admin.
 */
const updateResult = async (req, res) => {
    const { id } = req.params;
    const {
        mid_term_score, final_term_score, continuous_assessment_score,
        test_mark, assignment_mark, exam_mark, teacher_comment, status
    } = req.body;
    const schoolId = (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;
    const role = req.user.role;
    const teacher_id = req.user.sub || req.user.id;

    try {
        const [[existing]] = await pool.execute(
            "SELECT * FROM results WHERE id = ? AND school_id = ?",
            [id, schoolId]
        );
        if (!existing) return res.status(404).json({ error: "Result not found" });

        // Locked/approved check
        if (existing.status === "APPROVED" && role === "staff") {
            return res.status(403).json({ error: "This result has been approved and cannot be modified by staff without administrator review." });
        }

        // Must be assigned to this class/subject
        const isTeacherUser = (role === "staff" || req.user?.is_teacher || req.user?.school_position === "Teacher" || req.query.teaching === "1");
        if (isTeacherUser) {
            const [[assigned]] = await pool.execute(
                `SELECT id FROM teacher_subjects
                 WHERE teacher_id = ? AND subject_id = ? AND class_id = ?
                 LIMIT 1`,
                [teacher_id, existing.subject_id, existing.class_id]
            ).catch(() => [[null]]);
            if (!assigned) {
                return res.status(403).json({ error: "You are not authorized to update this result" });
            }
        }

        const policy = await getSchoolPolicy(schoolId);

        // Resolve input or keep existing
        const newMid = mid_term_score !== undefined ? mid_term_score : (test_mark !== undefined ? test_mark : existing.mid_term_score);
        const newFin = final_term_score !== undefined ? final_term_score : (exam_mark !== undefined ? exam_mark : existing.final_term_score);
        const newCa = continuous_assessment_score !== undefined ? continuous_assessment_score : (assignment_mark !== undefined ? assignment_mark : existing.continuous_assessment_score);

        const calc = calculateFinalMark({
            midTermScore: newMid,
            finalTermScore: newFin,
            continuousAssessmentScore: newCa,
            policy,
        });

        const newLegacyTotal = calc.finalMark !== null 
            ? calc.finalMark 
            : (Number(calc.midTermScore || 0) + Number(calc.finalTermScore || 0));
        const newLegacyPct = calc.percentage !== null ? calc.percentage : 0;
        const newGradeCode = calc.gradeCode !== null ? calc.gradeCode : 9;
        const resultStatus = (status && (role === "admin" || role === "headmaster")) ? status : calc.status;

        const fields = [
            "mid_term_score = ?", "final_term_score = ?", "continuous_assessment_score = ?",
            "final_mark = ?", "test_mark = ?", "assignment_mark = ?", "exam_mark = ?",
            "total_marks = ?", "percentage = ?",
            "grade_code = ?", "grade_classification = ?", "remarks = ?",
            "status = ?", "assessment_policy_snapshot = ?",
            "updated_at = CURRENT_TIMESTAMP",
        ];
        const values = [
            calc.midTermScore, calc.finalTermScore, calc.continuousAssessmentScore,
            calc.finalMark, calc.midTermScore || 0, calc.continuousAssessmentScore || 0, calc.finalTermScore || 0,
            newLegacyTotal, newLegacyPct,
            newGradeCode, calc.gradeClassification, calc.remarks,
            resultStatus, JSON.stringify(calc.policySnapshot),
        ];

        if (teacher_comment !== undefined) {
            fields.splice(-1, 0, "teacher_comment = ?");
            values.splice(-1, 0, teacher_comment);
        }

        values.push(id, schoolId);
        await pool.execute(`UPDATE results SET ${fields.join(", ")} WHERE id = ? AND school_id = ?`, values);

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

        // Compute term averages (only completed subjects count)
        const terms = Object.values(byTerm).map((term) => {
            const completeSubs = term.subjects.filter((r) => (r.final_mark != null || (r.percentage != null && r.status === "COMPLETE")));
            const avg = completeSubs.length
                ? (completeSubs.reduce((s, r) => s + parseFloat(r.final_mark != null ? r.final_mark : r.percentage), 0) / completeSubs.length).toFixed(1)
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
 * Distinguishes Mid-Term, Final, and completed term calculations.
 * Incomplete results are reported separately and do not distort pass rates.
 */
const getResultsAnalytics = async (req, res) => {
    const { academic_year_id, term_id } = req.query;
    const schoolId = (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;

    const filters = ["r.school_id = ?"];
    const values = [schoolId];
    if (academic_year_id) { filters.push("r.academic_year_id = ?"); values.push(academic_year_id); }
    if (term_id) { filters.push("r.term_id = ?"); values.push(term_id); }
    const where = `WHERE ${filters.join(" AND ")}`;

    try {
        const [[overall]] = await pool.execute(
            `SELECT COUNT(*)                                                           AS total_entries,
              SUM(r.status = 'COMPLETE')                                               AS completed_entries,
              SUM(r.status = 'INCOMPLETE')                                             AS pending_entries,
              ROUND(AVG(IF(r.status = 'COMPLETE', r.final_mark, NULL)), 1)             AS overall_average,
              ROUND(AVG(r.mid_term_score), 1)                                          AS mid_term_average,
              ROUND(AVG(r.final_term_score), 1)                                        AS final_term_average,
              SUM(IF(r.status = 'COMPLETE', r.grade_code <= 6, 0))                    AS passes,
              SUM(IF(r.status = 'COMPLETE', r.grade_code = 9, 0))                     AS failures,
              ROUND(
                CASE WHEN SUM(r.status = 'COMPLETE') = 0 THEN 0
                     ELSE SUM(IF(r.status = 'COMPLETE', r.grade_code <= 6, 0)) / SUM(r.status = 'COMPLETE') * 100
                END, 1
              ) AS pass_rate
       FROM   results r
       ${where}`,
            values
        );

        const [bySubject] = await pool.execute(
            `SELECT sub.subject_name,
              COUNT(r.id)                                                           AS total,
              SUM(r.status = 'COMPLETE')                                            AS completed,
              SUM(r.status = 'INCOMPLETE')                                          AS pending,
              ROUND(AVG(r.mid_term_score), 1)                                       AS avg_mid_term,
              ROUND(AVG(r.final_term_score), 1)                                     AS avg_final_term,
              ROUND(AVG(IF(r.status = 'COMPLETE', r.final_mark, NULL)), 1)          AS avg_percentage,
              SUM(IF(r.status = 'COMPLETE', r.grade_code <= 6, 0))                 AS passes,
              ROUND(
                CASE WHEN SUM(r.status = 'COMPLETE') = 0 THEN 0
                     ELSE SUM(IF(r.status = 'COMPLETE', r.grade_code <= 6, 0)) / SUM(r.status = 'COMPLETE') * 100
                END, 1
              ) AS pass_rate
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
       ${where} AND r.status = 'COMPLETE'
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
    getAssessmentPolicy, updateAssessmentPolicy, calculatePreview,
    getECZGrade,
};