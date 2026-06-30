const pool = require("../config/db");

// ─── Constants & Helpers ──────────────────────────────────────────────────────

const VALID_STATUSES = ["present", "absent", "late", "excused"];

const validateStatus = (status) =>
    VALID_STATUSES.includes(status)
        ? null
        : `status must be one of: ${VALID_STATUSES.join(", ")}`;

const requireFields = (body, fields) => {
    const missing = fields.filter((f) => !body[f] && body[f] !== 0);
    return missing.length ? `${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} required` : null;
};

// ─── META — Classes & Terms ───────────────────────────────────────────────────

/**
 * GET /api/attendance/classes
 * Lists all class sections with student count.
 */
const getClasses = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT c.id, c.grade_level, c.stream,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              c.capacity,
              u.name AS class_teacher_name,
              COUNT(s.id)                                                            AS student_count
       FROM   classes c
       LEFT JOIN users    u ON u.id = c.class_teacher_id
       LEFT JOIN students s ON s.class_id = c.id
       GROUP BY c.id
       ORDER BY c.grade_level, c.stream`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/attendance/terms
 * Returns all terms with their academic year.
 */
const getTerms = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT t.id, t.term_number, t.term_name, t.start_date, t.end_date, t.is_current,
              ay.id AS academic_year_id, ay.year_label
       FROM   terms t
       JOIN   academic_years ay ON ay.id = t.academic_year_id
       ORDER BY ay.year_label DESC, t.term_number`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── SESSION MANAGEMENT ───────────────────────────────────────────────────────

/**
 * POST /api/attendance/sessions
 * Creates a new attendance session (one per class per date per period).
 * Body: { class_id, term_id, academic_year_id, attendance_date, subject_id?, period?, notes? }
 */
const createSession = async (req, res) => {
    const {
        class_id,
        term_id,
        academic_year_id,
        attendance_date,
        subject_id = null,
        period = "General",
        notes = null,
    } = req.body;

    const fieldErr = requireFields(req.body, ["class_id", "term_id", "academic_year_id", "attendance_date"]);
    if (fieldErr) return res.status(400).json({ error: fieldErr });

    const teacher_id = req.user.id;

    try {
        const [result] = await pool.execute(
            `INSERT INTO attendance_sessions
         (class_id, subject_id, teacher_id, term_id, academic_year_id, attendance_date, period, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [class_id, subject_id, teacher_id, term_id, academic_year_id, attendance_date, period, notes]
        );

        const [[session]] = await pool.execute(
            `SELECT s.*,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              u.name  AS teacher_name,
              t.term_name, ay.year_label,
              sub.subject_name
       FROM   attendance_sessions s
       JOIN   classes       c   ON c.id   = s.class_id
       JOIN   users         u   ON u.id   = s.teacher_id
       JOIN   terms         t   ON t.id   = s.term_id
       JOIN   academic_years ay ON ay.id  = s.academic_year_id
       LEFT JOIN subjects   sub ON sub.id = s.subject_id
       WHERE  s.id = ?`,
            [result.insertId]
        );

        res.status(201).json({ message: "Session created successfully", session });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                error: "An attendance session already exists for this class, date, and period.",
            });
        }
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/attendance/sessions
 * Query filters: class_id, teacher_id, term_id, academic_year_id, from_date, to_date
 * Returns sessions with per-session attendance counts.
 */
const getSessions = async (req, res) => {
    const { class_id, teacher_id, term_id, academic_year_id, from_date, to_date } = req.query;

    const filters = [];
    const values = [];

    if (class_id) { filters.push("s.class_id = ?"); values.push(class_id); }
    if (teacher_id) { filters.push("s.teacher_id = ?"); values.push(teacher_id); }
    if (term_id) { filters.push("s.term_id = ?"); values.push(term_id); }
    if (academic_year_id) { filters.push("s.academic_year_id = ?"); values.push(academic_year_id); }
    if (from_date) { filters.push("s.attendance_date >= ?"); values.push(from_date); }
    if (to_date) { filters.push("s.attendance_date <= ?"); values.push(to_date); }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
        const [rows] = await pool.execute(
            `SELECT s.id, s.attendance_date, s.period, s.notes, s.created_at,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              u.name AS teacher_name,
              t.term_name, ay.year_label,
              sub.subject_name,
              COUNT(ar.id)                     AS records_count,
              SUM(ar.status = 'present')       AS present_count,
              SUM(ar.status = 'absent')        AS absent_count,
              SUM(ar.status = 'late')          AS late_count,
              SUM(ar.status = 'excused')       AS excused_count
       FROM   attendance_sessions s
       JOIN   classes       c   ON c.id   = s.class_id
       JOIN   users         u   ON u.id   = s.teacher_id
       JOIN   terms         t   ON t.id   = s.term_id
       JOIN   academic_years ay ON ay.id  = s.academic_year_id
       LEFT JOIN subjects   sub ON sub.id = s.subject_id
       LEFT JOIN attendance_records ar ON ar.session_id = s.id
       ${where}
       GROUP BY s.id
       ORDER BY s.attendance_date DESC, s.created_at DESC`,
            values
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/attendance/sessions/:id
 * Returns full session + every student record.
 */
const getSessionById = async (req, res) => {
    const { id } = req.params;

    try {
        const [[session]] = await pool.execute(
            `SELECT s.*,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              u.name AS teacher_name, t.term_name, ay.year_label, sub.subject_name
       FROM   attendance_sessions s
       JOIN   classes       c   ON c.id   = s.class_id
       JOIN   users         u   ON u.id   = s.teacher_id
       JOIN   terms         t   ON t.id   = s.term_id
       JOIN   academic_years ay ON ay.id  = s.academic_year_id
       LEFT JOIN subjects   sub ON sub.id = s.subject_id
       WHERE  s.id = ?`,
            [id]
        );

        if (!session) return res.status(404).json({ error: "Session not found" });

        const [records] = await pool.execute(
            `SELECT ar.id, ar.status, ar.remarks, ar.created_at, ar.updated_at,
              st.id AS student_id, st.first_name, st.last_name, st.admission_number
       FROM   attendance_records ar
       JOIN   students st ON st.id = ar.student_id
       WHERE  ar.session_id = ?
       ORDER BY st.last_name, st.first_name`,
            [id]
        );

        res.json({ session, records });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * DELETE /api/attendance/sessions/:id
 * Cascades to attendance_records via FK ON DELETE CASCADE.
 */
const deleteSession = async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await pool.execute("DELETE FROM attendance_sessions WHERE id = ?", [id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: "Session not found" });
        res.json({ message: "Session and all its records deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── BULK ATTENDANCE SUBMISSION ───────────────────────────────────────────────

/**
 * POST /api/attendance/sessions/:id/submit
 * Bulk create OR update student records for a session.
 * Body: { records: [{ student_id, status, remarks? }] }
 * Idempotent — safe to call again to correct mistakes.
 */
const submitSessionAttendance = async (req, res) => {
    const { id } = req.params;
    const { records } = req.body;
    const recorded_by = req.user.id;

    if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: "records array is required and must not be empty" });
    }

    // Validate all statuses before touching the DB
    for (const r of records) {
        const err = validateStatus(r.status);
        if (err) return res.status(400).json({ error: `student_id ${r.student_id}: ${err}` });
        if (!r.student_id) return res.status(400).json({ error: "Each record must include student_id" });
    }

    const [[session]] = await pool.execute(
        "SELECT id FROM attendance_sessions WHERE id = ?",
        [id]
    );
    if (!session) return res.status(404).json({ error: "Session not found" });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        let inserted = 0, updated = 0;

        for (const r of records) {
            const [existing] = await conn.execute(
                "SELECT id FROM attendance_records WHERE session_id = ? AND student_id = ?",
                [id, r.student_id]
            );

            if (existing.length) {
                await conn.execute(
                    `UPDATE attendance_records
           SET    status = ?, remarks = ?, recorded_by = ?, updated_at = CURRENT_TIMESTAMP
           WHERE  session_id = ? AND student_id = ?`,
                    [r.status, r.remarks || null, recorded_by, id, r.student_id]
                );
                updated++;
            } else {
                await conn.execute(
                    `INSERT INTO attendance_records (session_id, student_id, status, remarks, recorded_by)
           VALUES (?, ?, ?, ?, ?)`,
                    [id, r.student_id, r.status, r.remarks || null, recorded_by]
                );
                inserted++;
            }
        }

        await conn.commit();
        res.json({ message: "Attendance submitted successfully", inserted, updated, total: records.length });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
};

// ─── INDIVIDUAL RECORD UPDATES ────────────────────────────────────────────────

/**
 * PATCH /api/attendance/records/:id
 */
const updateAttendanceRecord = async (req, res) => {
    const { id } = req.params;
    const { status, remarks } = req.body;

    if (!status && remarks === undefined) {
        return res.status(400).json({ error: "At least one of status or remarks must be provided" });
    }

    if (status) {
        const err = validateStatus(status);
        if (err) return res.status(400).json({ error: err });
    }

    try {
        const [existing] = await pool.execute(
            "SELECT id FROM attendance_records WHERE id = ?",
            [id]
        );
        if (!existing.length) return res.status(404).json({ error: "Attendance record not found" });

        const fields = [];
        const values = [];
        if (status) { fields.push("status = ?"); values.push(status); }
        if (remarks !== undefined) { fields.push("remarks = ?"); values.push(remarks); }
        values.push(id);

        await pool.execute(
            `UPDATE attendance_records SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );

        res.json({ message: "Attendance record updated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * DELETE /api/attendance/records/:id
 */
const deleteAttendanceRecord = async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await pool.execute("DELETE FROM attendance_records WHERE id = ?", [id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: "Attendance record not found" });
        res.json({ message: "Attendance record deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── STUDENT & SUMMARY QUERIES ────────────────────────────────────────────────

/**
 * GET /api/attendance/student/:studentId
 * Query: term_id?, academic_year_id?, from_date?, to_date?
 */
const getStudentAttendance = async (req, res) => {
    const { studentId } = req.params;
    const { term_id, academic_year_id, from_date, to_date } = req.query;

    const filters = ["ar.student_id = ?"];
    const values = [studentId];

    if (term_id) { filters.push("sess.term_id = ?"); values.push(term_id); }
    if (academic_year_id) { filters.push("sess.academic_year_id = ?"); values.push(academic_year_id); }
    if (from_date) { filters.push("sess.attendance_date >= ?"); values.push(from_date); }
    if (to_date) { filters.push("sess.attendance_date <= ?"); values.push(to_date); }

    try {
        const [[student]] = await pool.execute(
            "SELECT id, first_name, last_name, admission_number FROM students WHERE id = ?",
            [studentId]
        );
        if (!student) return res.status(404).json({ error: "Student not found" });

        const [records] = await pool.execute(
            `SELECT ar.id, ar.status, ar.remarks, ar.created_at,
              sess.attendance_date, sess.period,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              sub.subject_name, t.term_name, ay.year_label,
              u.name AS teacher_name
       FROM   attendance_records ar
       JOIN   attendance_sessions sess ON sess.id   = ar.session_id
       JOIN   classes             c    ON c.id      = sess.class_id
       JOIN   terms               t    ON t.id      = sess.term_id
       JOIN   academic_years      ay   ON ay.id     = sess.academic_year_id
       LEFT JOIN subjects         sub  ON sub.id    = sess.subject_id
       LEFT JOIN users            u    ON u.id      = sess.teacher_id
       WHERE  ${filters.join(" AND ")}
       ORDER BY sess.attendance_date DESC`,
            values
        );

        const total = records.length;
        const present = records.filter((r) => r.status === "present").length;
        const summary = {
            total,
            present,
            absent: records.filter((r) => r.status === "absent").length,
            late: records.filter((r) => r.status === "late").length,
            excused: records.filter((r) => r.status === "excused").length,
            attendance_rate: total ? ((present / total) * 100).toFixed(1) : "0.0",
        };

        res.json({ student, records, summary });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/attendance/summary
 * Query: class_id?, term_id?, academic_year_id?
 * Per-student summary for a class/term — used for attendance report page.
 */
const getAttendanceSummary = async (req, res) => {
    const { class_id, term_id, academic_year_id } = req.query;

    const filters = [];
    const values = [];

    if (class_id) { filters.push("s.class_id = ?"); values.push(class_id); }
    if (term_id) { filters.push("s.term_id = ?"); values.push(term_id); }
    if (academic_year_id) { filters.push("s.academic_year_id = ?"); values.push(academic_year_id); }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
        const [rows] = await pool.execute(
            `SELECT st.id AS student_id, st.first_name, st.last_name, st.admission_number,
              CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              COUNT(ar.id)                                                          AS total_sessions,
              SUM(ar.status = 'present')                                           AS present,
              SUM(ar.status = 'absent')                                            AS absent,
              SUM(ar.status = 'late')                                              AS late,
              SUM(ar.status = 'excused')                                           AS excused,
              ROUND(SUM(ar.status = 'present') / COUNT(ar.id) * 100, 1)           AS attendance_rate
       FROM   attendance_records ar
       JOIN   attendance_sessions s  ON s.id    = ar.session_id
       JOIN   students            st ON st.id   = ar.student_id
       LEFT JOIN classes          c  ON c.id    = st.class_id
       ${where}
       GROUP BY ar.student_id
       ORDER BY attendance_rate ASC, st.last_name`,
            values
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/attendance/analytics
 * Query: academic_year_id?, term_id?
 * Returns overall totals, by-class breakdown, and 8-week trend.
 */
const getAttendanceAnalytics = async (req, res) => {
    const { academic_year_id, term_id } = req.query;

    const filters = [];
    const values = [];
    if (academic_year_id) { filters.push("s.academic_year_id = ?"); values.push(academic_year_id); }
    if (term_id) { filters.push("s.term_id = ?"); values.push(term_id); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    try {
        const [[overall]] = await pool.execute(
            `SELECT COUNT(ar.id)               AS total,
              SUM(ar.status = 'present') AS present,
              SUM(ar.status = 'absent')  AS absent,
              SUM(ar.status = 'late')    AS late,
              SUM(ar.status = 'excused') AS excused,
              ROUND(SUM(ar.status = 'present') / COUNT(ar.id) * 100, 1) AS attendance_rate
       FROM   attendance_records ar
       JOIN   attendance_sessions s ON s.id = ar.session_id
       ${where}`,
            values
        );

        const [byClass] = await pool.execute(
            `SELECT CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
              COUNT(ar.id)                                                          AS total,
              SUM(ar.status = 'present')                                           AS present,
              ROUND(SUM(ar.status = 'present') / COUNT(ar.id) * 100, 1)           AS attendance_rate
       FROM   attendance_records ar
       JOIN   attendance_sessions s ON s.id  = ar.session_id
       JOIN   classes             c ON c.id  = s.class_id
       ${where}
       GROUP BY s.class_id
       ORDER BY c.grade_level, c.stream`,
            values
        );

        const [trend] = await pool.execute(
            `SELECT DATE_FORMAT(s.attendance_date, '%Y-%m-%d') AS date,
              COUNT(ar.id)               AS total,
              SUM(ar.status = 'present') AS present,
              ROUND(SUM(ar.status = 'present') / COUNT(ar.id) * 100, 1) AS rate
       FROM   attendance_records ar
       JOIN   attendance_sessions s ON s.id = ar.session_id
       WHERE  s.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 8 WEEK)
       GROUP BY s.attendance_date
       ORDER BY s.attendance_date`,
            []
        );

        res.json({ overall, byClass, trend });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── LEGACY ALIASES (kept so any existing references don't break) ─────────────
const markAttendance = createSession;
const getAllAttendance = getSessions;
const updateAttendance = updateAttendanceRecord;
const deleteAttendance = deleteAttendanceRecord;
const getAttendanceByStudent = getStudentAttendance;

module.exports = {
    // Meta
    getClasses, getTerms,
    // Sessions
    createSession, getSessions, getSessionById, deleteSession,
    // Bulk submit
    submitSessionAttendance,
    // Individual records
    updateAttendanceRecord, deleteAttendanceRecord,
    // Queries
    getStudentAttendance, getAttendanceSummary, getAttendanceAnalytics,
    // Legacy aliases
    markAttendance, getAllAttendance, updateAttendance, deleteAttendance, getAttendanceByStudent,
};