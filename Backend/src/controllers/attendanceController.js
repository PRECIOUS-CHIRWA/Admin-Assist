const pool = require("../config/db");

// ─── Constants & Helpers ──────────────────────────────────────────────────────

const VALID_STATUSES = ["present", "absent", "late", "excused"];

const validateStatus = (status) =>
    VALID_STATUSES.includes(status)
        ? null
        : `Status must be one of: ${VALID_STATUSES.join(", ")}`;

const requireFields = (body, fields) => {
    const missing = fields.filter((f) => !body[f] && body[f] !== 0);
    return missing.length ? `${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} required` : null;
};

/**
 * Helper: extracts user's school_id from JWT payload or defaults to 1.
 * Enforces School-Level Data Isolation.
 */
const getSchoolId = (req) => {
    if (req.user && (req.user.school_id || req.user.schoolId)) {
        return parseInt(req.user.school_id || req.user.schoolId, 10);
    }
    return 1;
};

/**
 * Helper: validates YYYY-MM-DD date strings
 */
const isValidDateStr = (dateStr) => {
    if (!dateStr || typeof dateStr !== "string") return false;
    const match = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
    if (!match) return false;
    const d = new Date(dateStr);
    return d instanceof Date && !isNaN(d.getTime());
};

// ─── META — Academic Years, Terms, Classes, Subjects ───────────────────────────

/**
 * GET /api/attendance/academic-years (or /api/attendance/years)
 * Returns all academic years for the user's school, ordered newest first.
 */
const getAcademicYears = async (req, res) => {
    const school_id = getSchoolId(req);
    try {
        const [rows] = await pool.execute(
            `SELECT id, year_label, start_date, end_date, is_current
             FROM   academic_years
             WHERE  school_id = ?
             ORDER BY year_label DESC`,
            [school_id]
        );
        res.json(rows);
    } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
            return res.json([
                { id: 1, year_label: "2026", is_current: 1 },
                { id: 2, year_label: "2025", is_current: 0 }
            ]);
        }
        console.error("getAcademicYears error:", err.message);
        res.status(500).json({ error: "Failed to load academic years" });
    }
};

/**
 * GET /api/attendance/terms
 * Query params: academicYearId or academic_year_id (optional)
 * Returns all terms belonging to the user's school, filtered by academic year if supplied.
 */
const getTerms = async (req, res) => {
    const school_id = getSchoolId(req);
    const academic_year_id = req.query.academicYearId || req.query.academic_year_id;

    const filters = ["t.school_id = ?"];
    const values = [school_id];

    if (academic_year_id) {
        filters.push("t.academic_year_id = ?");
        values.push(academic_year_id);
    }

    const where = `WHERE ${filters.join(" AND ")}`;

    try {
        const [rows] = await pool.execute(
            `SELECT t.id, t.term_number, t.term_name, t.start_date, t.end_date, t.is_current,
                    ay.id AS academic_year_id, ay.year_label
             FROM   terms t
             JOIN   academic_years ay ON ay.id = t.academic_year_id
             ${where}
             ORDER BY ay.year_label DESC, t.term_number`,
            values
        );
        res.json(rows);
    } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
            return res.json([
                { id: 1, term_number: 1, term_name: "Term 1", academic_year_id: 1, year_label: "2026", is_current: 1 },
                { id: 2, term_number: 2, term_name: "Term 2", academic_year_id: 1, year_label: "2026", is_current: 0 },
                { id: 3, term_number: 3, term_name: "Term 3", academic_year_id: 1, year_label: "2026", is_current: 0 }
            ]);
        }
        console.error("getTerms error:", err.message);
        res.status(500).json({ error: "Failed to load terms" });
    }
};

/**
 * GET /api/attendance/classes
 * Query params: academicYearId or academic_year_id (optional)
 * Lists all class sections for the school with student count.
 */
const getClasses = async (req, res) => {
    const school_id = getSchoolId(req);
    try {
        const [rows] = await pool.execute(
            `SELECT c.id, c.grade_level, c.stream,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    c.capacity,
                    u.name AS class_teacher_name,
                    COUNT(s.id) AS student_count
             FROM   classes c
             LEFT JOIN users u ON u.id = c.class_teacher_id
             LEFT JOIN students s ON (s.class_id = c.id OR CONCAT(s.grade, IF(s.section != '' AND s.section IS NOT NULL, CONCAT(' ', s.section), '')) = CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), ''))) AND s.status = 'Active'
             WHERE  c.school_id = ?
             GROUP BY c.id
             ORDER BY c.grade_level, c.stream`,
            [school_id]
        );
        res.json(rows);
    } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
            return res.json([]);
        }
        console.error("getClasses error:", err.message);
        res.status(500).json({ error: "Failed to load classes" });
    }
};

/**
 * GET /api/attendance/subjects
 * Query params: classId or class_id (optional), is_active (optional)
 * Returns active subjects for the school.
 */
const getSubjects = async (req, res) => {
    const school_id = getSchoolId(req);
    const { is_active = 1, classId, class_id } = req.query;
    const targetClassId = classId || class_id;

    const filters = ["s.school_id = ?"];
    const values = [school_id];

    if (is_active !== undefined) {
        filters.push("s.is_active = ?");
        values.push(is_active);
    }

    const where = `WHERE ${filters.join(" AND ")}`;

    try {
        let sql = `SELECT s.id, s.subject_code, s.subject_name, s.description, s.is_active
                   FROM   subjects s
                   ${where}
                   ORDER BY s.subject_name`;

        if (targetClassId) {
            // Filter by teacher_subjects assignment if present
            sql = `SELECT DISTINCT s.id, s.subject_code, s.subject_name, s.description, s.is_active
                   FROM   subjects s
                   LEFT JOIN teacher_subjects ts ON ts.subject_id = s.id AND ts.class_id = ?
                   ${where}
                   ORDER BY s.subject_name`;
            values.unshift(targetClassId);
        }

        const [rows] = await pool.execute(sql, values);
        res.json(rows);
    } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
            return res.json([]);
        }
        console.error("getSubjects error:", err.message);
        res.status(500).json({ error: "Failed to load subjects" });
    }
};

// ─── REGISTER / ROSTER ────────────────────────────────────────────────────────

/**
 * GET /api/attendance/register (or /api/attendance/roster)
 * Query: class_id (required), term_id, academic_year_id, date / attendance_date, period, subject_id
 * Returns active enrolled students in the class, class metadata, and existing session details if present.
 */
const getRegister = async (req, res) => {
    const school_id = getSchoolId(req);
    const class_id = req.query.class_id || req.query.classId;
    const term_id = req.query.term_id || req.query.termId;
    const academic_year_id = req.query.academic_year_id || req.query.academicYearId || req.query.yearId;
    const attendance_date = req.query.date || req.query.attendance_date || req.query.attendanceDate;
    const period = req.query.period || "General";
    const subject_id = req.query.subject_id || req.query.subjectId || null;

    if (!class_id) {
        return res.status(400).json({ error: "class_id parameter is required" });
    }

    try {
        // 1. Fetch Class metadata
        const [[classInfo]] = await pool.execute(
            `SELECT c.id, c.grade_level, c.stream, c.capacity,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    u.name AS class_teacher_name
             FROM   classes c
             LEFT JOIN users u ON u.id = c.class_teacher_id
             WHERE  c.id = ? AND c.school_id = ?`,
            [class_id, school_id]
        );

        if (!classInfo) {
            return res.status(404).json({ error: "Class not found or does not belong to your school" });
        }

        // 2. Fetch Active students enrolled in this class
        const [students] = await pool.execute(
            `SELECT s.id, s.admission_number, s.first_name, s.last_name, s.gender, s.status AS student_status
             FROM   students s
             WHERE  (s.class_id = ? OR CONCAT(s.grade, IF(s.section != '' AND s.section IS NOT NULL, CONCAT(' ', s.section), '')) = ?)
               AND  s.status = 'Active'
               AND  s.school_id = ?
             ORDER BY s.last_name, s.first_name`,
            [class_id, classInfo.class_name, school_id]
        );

        // 3. Check for an existing session matching this class, date, period, and optional subject
        let existing_session = null;
        let records_map = {};

        if (attendance_date) {
            const subjectCondition = subject_id ? "AND s.subject_id = ?" : "AND (s.subject_id IS NULL OR s.subject_id = 0)";
            const sessionParams = [class_id, attendance_date, period, school_id];
            if (subject_id) sessionParams.push(subject_id);

            const [[sess]] = await pool.execute(
                `SELECT s.id, s.attendance_date, s.period, s.notes, s.teacher_id, u.name AS teacher_name, s.created_at
                 FROM   attendance_sessions s
                 LEFT JOIN users u ON u.id = s.teacher_id
                 WHERE  s.class_id = ? AND s.attendance_date = ? AND s.period = ? AND s.school_id = ?
                        ${subjectCondition}
                 LIMIT 1`,
                sessionParams
            );

            if (sess) {
                existing_session = sess;

                // Load existing student attendance records for this session
                const [records] = await pool.execute(
                    `SELECT student_id, status, remarks
                     FROM   attendance_records
                     WHERE  session_id = ?`,
                    [sess.id]
                );

                records.forEach(r => {
                    records_map[r.student_id] = r;
                });
            }
        }

        // Merge existing attendance status into each student object if found
        const studentRoster = students.map(s => ({
            id: s.id,
            studentNumber: s.admission_number,
            admissionNumber: s.admission_number,
            firstName: s.first_name,
            lastName: s.last_name,
            name: `${s.first_name} ${s.last_name}`,
            gender: s.gender,
            status: records_map[s.id] ? records_map[s.id].status : "present",
            remarks: records_map[s.id] ? records_map[s.id].remarks : "",
        }));

        res.json({
            class: classInfo,
            students: studentRoster,
            student_count: studentRoster.length,
            existing_session,
        });
    } catch (err) {
        console.error("getRegister error:", err.message);
        res.status(500).json({ error: "Failed to load class register" });
    }
};

// ─── SESSIONS CRUD ────────────────────────────────────────────────────────────

/**
 * POST /api/attendance/sessions
 * Body: { class_id, term_id, academic_year_id, attendance_date, period?, subject_id?, notes? }
 * Creates or retrieves a session for a class/date/period.
 */
const createSession = async (req, res) => {
    const school_id = getSchoolId(req);
    const teacher_id = req.user.sub || req.user.id;

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

    if (!isValidDateStr(attendance_date)) {
        return res.status(400).json({ error: "attendance_date must be a valid date in YYYY-MM-DD format" });
    }

    try {
        // Verify class belongs to user's school
        const [[cls]] = await pool.execute(
            "SELECT id FROM classes WHERE id = ? AND school_id = ?",
            [class_id, school_id]
        );
        if (!cls) {
            return res.status(404).json({ error: "Class not found or does not belong to your school" });
        }

        // Check if session already exists
        const subjectCondition = subject_id ? "AND subject_id = ?" : "AND (subject_id IS NULL OR subject_id = 0)";
        const checkParams = [class_id, attendance_date, period, school_id];
        if (subject_id) checkParams.push(subject_id);

        const [[existing]] = await pool.execute(
            `SELECT id FROM attendance_sessions
             WHERE  class_id = ? AND attendance_date = ? AND period = ? AND school_id = ? ${subjectCondition}
             LIMIT 1`,
            checkParams
        );

        if (existing) {
            // Update notes/teacher if provided
            await pool.execute(
                `UPDATE attendance_sessions SET notes = ?, teacher_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [notes, teacher_id, existing.id]
            );

            const [[session]] = await pool.execute(
                `SELECT s.*,
                        CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                        u.name AS teacher_name, t.term_name, ay.year_label, sub.subject_name
                 FROM   attendance_sessions s
                 JOIN   classes c ON c.id = s.class_id
                 JOIN   users u ON u.id = s.teacher_id
                 JOIN   terms t ON t.id = s.term_id
                 JOIN   academic_years ay ON ay.id = s.academic_year_id
                 LEFT JOIN subjects sub ON sub.id = s.subject_id
                 WHERE  s.id = ?`,
                [existing.id]
            );

            return res.status(200).json({ message: "Existing session loaded for edit", session, isExisting: true });
        }

        // Insert new session
        const [result] = await pool.execute(
            `INSERT INTO attendance_sessions
             (school_id, class_id, subject_id, teacher_id, term_id, academic_year_id, attendance_date, period, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [school_id, class_id, subject_id || null, teacher_id, term_id, academic_year_id, attendance_date, period, notes]
        );

        const [[session]] = await pool.execute(
            `SELECT s.*,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    u.name AS teacher_name, t.term_name, ay.year_label, sub.subject_name
             FROM   attendance_sessions s
             JOIN   classes c ON c.id = s.class_id
             JOIN   users u ON u.id = s.teacher_id
             JOIN   terms t ON t.id = s.term_id
             JOIN   academic_years ay ON ay.id = s.academic_year_id
             LEFT JOIN subjects sub ON sub.id = s.subject_id
             WHERE  s.id = ?`,
            [result.insertId]
        );

        res.status(201).json({ message: "Attendance session created successfully", session, isExisting: false });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "An attendance session already exists for this class, date, and period." });
        }
        console.error("createSession error:", err.message);
        res.status(500).json({ error: "Failed to create attendance session" });
    }
};

/**
 * GET /api/attendance/sessions
 * Query filters: class_id, teacher_id, term_id, academic_year_id, from_date, to_date
 * Returns list of sessions with per-session status counts and attendance rate.
 */
const getSessions = async (req, res) => {
    const school_id = getSchoolId(req);
    const {
        class_id, classId,
        teacher_id, teacherId,
        term_id, termId,
        academic_year_id, yearId,
        from_date, fromDate,
        to_date, toDate
    } = req.query;

    const targetClass = class_id || classId;
    const targetTeacher = teacher_id || teacherId;
    const targetTerm = term_id || termId;
    const targetYear = academic_year_id || yearId;
    const targetFrom = from_date || fromDate;
    const targetTo = to_date || toDate;

    const filters = ["s.school_id = ?"];
    const values = [school_id];

    if (targetClass) { filters.push("s.class_id = ?"); values.push(targetClass); }
    if (targetTeacher) { filters.push("s.teacher_id = ?"); values.push(targetTeacher); }
    if (targetTerm) { filters.push("s.term_id = ?"); values.push(targetTerm); }
    if (targetYear) { filters.push("s.academic_year_id = ?"); values.push(targetYear); }
    if (targetFrom) { filters.push("s.attendance_date >= ?"); values.push(targetFrom); }
    if (targetTo) { filters.push("s.attendance_date <= ?"); values.push(targetTo); }

    const where = `WHERE ${filters.join(" AND ")}`;

    try {
        const [rows] = await pool.execute(
            `SELECT s.id, s.attendance_date, s.period, s.notes, s.created_at,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    u.name AS teacher_name,
                    t.term_name, ay.year_label,
                    sub.subject_name,
                    COUNT(ar.id)                                      AS records_count,
                    COALESCE(SUM(ar.status = 'present'), 0)          AS present_count,
                    COALESCE(SUM(ar.status = 'absent'), 0)           AS absent_count,
                    COALESCE(SUM(ar.status = 'late'), 0)             AS late_count,
                    COALESCE(SUM(ar.status = 'excused'), 0)          AS excused_count
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
        if (err.code === "ER_NO_SUCH_TABLE") {
            return res.json([]);
        }
        console.error("getSessions error:", err.message);
        res.status(500).json({ error: "Failed to load attendance sessions" });
    }
};

/**
 * GET /api/attendance/sessions/:id
 * Returns session details + list of all student records.
 */
const getSessionById = async (req, res) => {
    const school_id = getSchoolId(req);
    const { id } = req.params;

    try {
        const [[session]] = await pool.execute(
            `SELECT s.*,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    u.name AS teacher_name, t.term_name, ay.year_label, sub.subject_name
             FROM   attendance_sessions s
             JOIN   classes       c   ON c.id   = s.class_id
             JOIN   users         u   ON u.id   = s.teacher_id
             JOIN   terms         t   ON t.id   = s.term_id
             JOIN   academic_years ay ON ay.id  = s.academic_year_id
             LEFT JOIN subjects   sub ON sub.id = s.subject_id
             WHERE  s.id = ? AND s.school_id = ?`,
            [id, school_id]
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
        console.error("getSessionById error:", err.message);
        res.status(500).json({ error: "Failed to load session details" });
    }
};

/**
 * PUT /api/attendance/sessions/:id
 * Updates session metadata.
 */
const updateSession = async (req, res) => {
    const school_id = getSchoolId(req);
    const { id } = req.params;
    const { attendance_date, period, notes, subject_id } = req.body;

    try {
        const [[existing]] = await pool.execute(
            "SELECT id FROM attendance_sessions WHERE id = ? AND school_id = ?",
            [id, school_id]
        );
        if (!existing) return res.status(404).json({ error: "Session not found" });

        const fields = [];
        const values = [];

        if (attendance_date) {
            if (!isValidDateStr(attendance_date)) {
                return res.status(400).json({ error: "Invalid date format YYYY-MM-DD" });
            }
            fields.push("attendance_date = ?");
            values.push(attendance_date);
        }
        if (period !== undefined) { fields.push("period = ?"); values.push(period); }
        if (notes !== undefined) { fields.push("notes = ?"); values.push(notes); }
        if (subject_id !== undefined) { fields.push("subject_id = ?"); values.push(subject_id || null); }

        if (!fields.length) return res.status(400).json({ error: "Nothing to update" });

        values.push(id);
        await pool.execute(
            `UPDATE attendance_sessions SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );

        res.json({ message: "Session updated successfully" });
    } catch (err) {
        console.error("updateSession error:", err.message);
        res.status(500).json({ error: "Failed to update attendance session" });
    }
};

/**
 * DELETE /api/attendance/sessions/:id
 * Deletes attendance session and cascades to attendance_records.
 */
const deleteSession = async (req, res) => {
    const school_id = getSchoolId(req);
    const { id } = req.params;

    try {
        const [result] = await pool.execute(
            "DELETE FROM attendance_sessions WHERE id = ? AND school_id = ?",
            [id, school_id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: "Session not found" });
        res.json({ message: "Session and all associated records deleted successfully" });
    } catch (err) {
        console.error("deleteSession error:", err.message);
        res.status(500).json({ error: "Failed to delete session" });
    }
};

// ─── BULK SUBMISSION WITH TRANSACTION ─────────────────────────────────────────

/**
 * POST /api/attendance/sessions/:id/submit
 * Bulk create/update student attendance records in a DB transaction.
 * Body: { records: [{ student_id, status, remarks? }] }
 */
const submitSessionAttendance = async (req, res) => {
    const school_id = getSchoolId(req);
    const { id } = req.params;
    const { records } = req.body;
    const recorded_by = req.user.sub || req.user.id;

    if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: "records array is required and must not be empty" });
    }

    // Pre-validate all student statuses
    for (const r of records) {
        if (!r.student_id) return res.status(400).json({ error: "Each record must include student_id" });
        const err = validateStatus(r.status);
        if (err) return res.status(400).json({ error: `Student ID ${r.student_id}: ${err}` });
    }

    // Confirm session exists for this school
    const [[session]] = await pool.execute(
        "SELECT id FROM attendance_sessions WHERE id = ? AND school_id = ?",
        [id, school_id]
    );
    if (!session) return res.status(404).json({ error: "Session not found or forbidden" });

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
        console.error("submitSessionAttendance transaction error:", err.message);
        res.status(500).json({ error: "Failed to submit attendance records" });
    } finally {
        conn.release();
    }
};

// ─── INDIVIDUAL RECORD EDITS ──────────────────────────────────────────────────

/**
 * PATCH /api/attendance/records/:id
 */
const updateAttendanceRecord = async (req, res) => {
    const { id } = req.params;
    const { status, remarks } = req.body;

    if (!status && remarks === undefined) {
        return res.status(400).json({ error: "At least status or remarks must be provided" });
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
        console.error("updateAttendanceRecord error:", err.message);
        res.status(500).json({ error: "Failed to update attendance record" });
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
        console.error("deleteAttendanceRecord error:", err.message);
        res.status(500).json({ error: "Failed to delete attendance record" });
    }
};

// ─── AGGREGATE QUERIES ────────────────────────────────────────────────────────

/**
 * GET /api/attendance/student/:studentId
 */
const getStudentAttendance = async (req, res) => {
    const school_id = getSchoolId(req);
    const { studentId } = req.params;
    const { term_id, academic_year_id, from_date, to_date } = req.query;

    const filters = ["ar.student_id = ?", "sess.school_id = ?"];
    const values = [studentId, school_id];

    if (term_id) { filters.push("sess.term_id = ?"); values.push(term_id); }
    if (academic_year_id) { filters.push("sess.academic_year_id = ?"); values.push(academic_year_id); }
    if (from_date) { filters.push("sess.attendance_date >= ?"); values.push(from_date); }
    if (to_date) { filters.push("sess.attendance_date <= ?"); values.push(to_date); }

    try {
        const [[student]] = await pool.execute(
            "SELECT id, first_name, last_name, admission_number FROM students WHERE id = ? AND school_id = ?",
            [studentId, school_id]
        );
        if (!student) return res.status(404).json({ error: "Student not found" });

        const [records] = await pool.execute(
            `SELECT ar.id, ar.status, ar.remarks, ar.created_at,
                    sess.attendance_date, sess.period,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    sub.subject_name, t.term_name, ay.year_label,
                    u.name AS teacher_name
             FROM   attendance_records ar
             JOIN   attendance_sessions sess ON sess.id = ar.session_id
             JOIN   classes             c    ON c.id    = sess.class_id
             JOIN   terms               t    ON t.id    = sess.term_id
             JOIN   academic_years      ay   ON ay.id   = sess.academic_year_id
             LEFT JOIN subjects         sub  ON sub.id  = sess.subject_id
             LEFT JOIN users            u    ON u.id    = sess.teacher_id
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
        console.error("getStudentAttendance error:", err.message);
        res.status(500).json({ error: "Failed to load student attendance" });
    }
};

/**
 * GET /api/attendance/summary
 */
const getAttendanceSummary = async (req, res) => {
    const school_id = getSchoolId(req);
    const { class_id, term_id, academic_year_id } = req.query;

    const filters = ["s.school_id = ?"];
    const values = [school_id];

    if (class_id) { filters.push("s.class_id = ?"); values.push(class_id); }
    if (term_id) { filters.push("s.term_id = ?"); values.push(term_id); }
    if (academic_year_id) { filters.push("s.academic_year_id = ?"); values.push(academic_year_id); }

    const where = `WHERE ${filters.join(" AND ")}`;

    try {
        const [rows] = await pool.execute(
            `SELECT st.id AS student_id, st.first_name, st.last_name, st.admission_number,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
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
             ORDER BY attendance_rate ASC, st.last_name`,
            values
        );
        res.json(rows);
    } catch (err) {
        console.error("getAttendanceSummary error:", err.message);
        res.status(500).json({ error: "Failed to load attendance summary" });
    }
};

/**
 * GET /api/attendance/analytics
 */
const getAttendanceAnalytics = async (req, res) => {
    const school_id = getSchoolId(req);
    const { academic_year_id, term_id } = req.query;

    const filters = ["s.school_id = ?"];
    const values = [school_id];

    if (academic_year_id) { filters.push("s.academic_year_id = ?"); values.push(academic_year_id); }
    if (term_id) { filters.push("s.term_id = ?"); values.push(term_id); }

    const where = `WHERE ${filters.join(" AND ")}`;

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
            `SELECT CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    COUNT(ar.id)                                                          AS total,
                    SUM(ar.status = 'present')                                           AS present,
                    ROUND(SUM(ar.status = 'present') / COUNT(ar.id) * 100, 1)           AS attendance_rate
             FROM   attendance_records ar
             JOIN   attendance_sessions s ON s.id = ar.session_id
             JOIN   classes             c ON c.id = s.class_id
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
             WHERE  s.school_id = ? AND s.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 8 WEEK)
             GROUP BY s.attendance_date
             ORDER BY s.attendance_date`,
            [school_id]
        );

        res.json({ overall, byClass, trend });
    } catch (err) {
        console.error("getAttendanceAnalytics error:", err.message);
        res.status(500).json({ error: "Failed to load attendance analytics" });
    }
};

module.exports = {
    // Meta
    getAcademicYears, getTerms, getClasses, getSubjects, getRegister,
    // Sessions
    createSession, getSessions, getSessionById, updateSession, deleteSession,
    // Bulk submit
    submitSessionAttendance,
    // Individual records
    updateAttendanceRecord, deleteAttendanceRecord,
    // Aggregates
    getStudentAttendance, getAttendanceSummary, getAttendanceAnalytics,
};