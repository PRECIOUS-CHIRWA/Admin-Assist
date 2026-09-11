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
 * Helper: validates YYYY-MM-DD date strings
 */
const isValidDateStr = (dateStr) => {
    if (!dateStr || typeof dateStr !== "string") return false;
    const match = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
    if (!match) return false;
    const d = new Date(dateStr);
    return d instanceof Date && !isNaN(d.getTime());
};

/**
 * Helper: get school_id from req.user (never trust frontend)
 */
const getSchoolId = (req) => (req.user && req.user.school_id) ? Number(req.user.school_id) : 1;

/**
 * Helper: verify a staff/teacher is assigned to a class (or is admin/headmaster)
 * Returns true if authorized to take attendance for this class.
 */
const isTeacherAuthorizedForClass = async (req, classId) => {
    const role = req.user.role;
    if (role === "admin" || role === "headmaster") return true;
    if (role !== "staff") return false;

    const teacherId = req.user.sub || req.user.id;
    const schoolId  = getSchoolId(req);

    // Check 1: class teacher assignment
    const [[cls]] = await pool.execute(
        "SELECT id FROM classes WHERE id = ? AND school_id = ? AND class_teacher_id = ?",
        [classId, schoolId, teacherId]
    );
    if (cls) return true;

    // Check 2: any teacher_subjects assignment for this class
    const [[ts]] = await pool.execute(
        "SELECT id FROM teacher_subjects WHERE teacher_id = ? AND class_id = ? LIMIT 1",
        [teacherId, classId]
    );
    return !!ts;
};

// ─── META — Academic Years, Terms, Classes, Subjects ───────────────────────────

/**
 * GET /api/attendance/academic-years (or /api/attendance/years)
 * Returns all academic years ordered newest first, scoped to caller's school.
 */
const getAcademicYears = async (req, res) => {
    const schoolId = getSchoolId(req);
    try {
        const [rows] = await pool.execute(
            `SELECT id, year_label, start_date, end_date, is_current
             FROM   academic_years
             WHERE  school_id = ?
             ORDER BY year_label DESC`,
            [schoolId]
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
 * Returns all terms, filtered by academic year if supplied, scoped to school.
 */
const getTerms = async (req, res) => {
    const academic_year_id = req.query.academicYearId || req.query.academic_year_id;
    const schoolId = getSchoolId(req);

    const filters = ["t.school_id = ?"];
    const values = [schoolId];

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
 * Lists class sections with student count, scoped to school.
 * If role=staff, restricts to classes the teacher is assigned to.
 */
const getClasses = async (req, res) => {
    const schoolId = getSchoolId(req);
    const role = req.user.role;
    const teacherId = req.user.sub || req.user.id;

    try {
        let sql;
        let params;

        if (role === "staff") {
            // Only classes where this teacher is class teacher OR has a teacher_subjects assignment
            sql = `SELECT DISTINCT c.id, c.grade_level, c.stream,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    c.capacity,
                    u.name AS class_teacher_name,
                    COUNT(DISTINCT s.id) AS student_count
             FROM   classes c
             LEFT JOIN users u ON u.id = c.class_teacher_id
             LEFT JOIN students s ON (
                 s.class_id = c.id 
                 OR (s.grade = c.grade_level AND (
                     s.section = c.stream 
                     OR s.section = CONCAT(REPLACE(c.grade_level, 'Grade ', ''), c.stream)
                     OR CONCAT(s.grade, IF(s.section != '' AND s.section IS NOT NULL, CONCAT(' ', s.section), '')) = CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), ''))
                 ))
             ) AND s.status = 'Active'
             WHERE  c.school_id = ?
               AND  (c.class_teacher_id = ? OR c.id IN (
                        SELECT DISTINCT ts.class_id FROM teacher_subjects ts WHERE ts.teacher_id = ?
                    ))
             GROUP BY c.id
             ORDER BY c.grade_level, c.stream`;
            params = [schoolId, teacherId, teacherId];
        } else {
            sql = `SELECT c.id, c.grade_level, c.stream,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    c.capacity,
                    u.name AS class_teacher_name,
                    COUNT(s.id) AS student_count
             FROM   classes c
             LEFT JOIN users u ON u.id = c.class_teacher_id
             LEFT JOIN students s ON (
                 s.class_id = c.id 
                 OR (s.grade = c.grade_level AND (
                     s.section = c.stream 
                     OR s.section = CONCAT(REPLACE(c.grade_level, 'Grade ', ''), c.stream)
                     OR CONCAT(s.grade, IF(s.section != '' AND s.section IS NOT NULL, CONCAT(' ', s.section), '')) = CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), ''))
                 ))
             ) AND s.status = 'Active'
             WHERE  c.school_id = ?
             GROUP BY c.id
             ORDER BY c.grade_level, c.stream`;
            params = [schoolId];
        }

        const [rows] = await pool.execute(sql, params);
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
 * Returns active subjects.
 */
const getSubjects = async (req, res) => {
    const { is_active = 1, classId, class_id } = req.query;
    const targetClassId = classId || class_id;

    const filters = [];
    const values = [];

    if (is_active !== undefined) {
        filters.push("s.is_active = ?");
        values.push(is_active);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

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
 * Role: admin/headmaster = any class; staff = must be assigned to class; user = forbidden.
 */
const getRegister = async (req, res) => {
    const class_id = req.query.class_id || req.query.classId;
    const term_id = req.query.term_id || req.query.termId;
    const academic_year_id = req.query.academic_year_id || req.query.academicYearId || req.query.yearId;
    const attendance_date = req.query.date || req.query.attendance_date || req.query.attendanceDate;
    const period = req.query.period || "General";
    const subject_id = req.query.subject_id || req.query.subjectId || null;
    const schoolId = getSchoolId(req);

    if (!class_id) {
        return res.status(400).json({ error: "class_id parameter is required" });
    }

    // Role guard: students cannot access registers
    if (req.user.role === "user") {
        return res.status(403).json({ error: "Access denied" });
    }

    try {
        // 1. Fetch Class metadata — scoped to school
        const [[classInfo]] = await pool.execute(
            `SELECT c.id, c.grade_level, c.stream, c.capacity, c.school_id,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    u.name AS class_teacher_name
             FROM   classes c
             LEFT JOIN users u ON u.id = c.class_teacher_id
             WHERE  c.id = ? AND c.school_id = ?`,
            [class_id, schoolId]
        );

        if (!classInfo) {
            return res.status(404).json({ error: "Class not found" });
        }

        // 2. Teacher authorization check
        if (req.user.role === "staff") {
            const authorized = await isTeacherAuthorizedForClass(req, class_id);
            if (!authorized) {
                return res.status(403).json({ error: "You are not assigned to this class" });
            }
        }

        const shortSection = (classInfo.grade_level.replace(/^Grade\s*/i, '') + (classInfo.stream || '')).trim();

        // 3. Fetch Active students enrolled in this class — scoped to school
        const [students] = await pool.execute(
            `SELECT s.id, s.admission_number, s.first_name, s.last_name, s.gender, s.status AS student_status
             FROM   students s
             WHERE  s.school_id = ?
               AND  (
                 s.class_id = ? 
                 OR (s.grade = ? AND (
                     s.section = ? 
                     OR s.section = ? 
                     OR CONCAT(s.grade, IF(s.section != '' AND s.section IS NOT NULL, CONCAT(' ', s.section), '')) = ?
                 ))
             )
               AND  s.status = 'Active'
             ORDER BY s.last_name, s.first_name`,
            [schoolId, class_id, classInfo.grade_level, classInfo.stream, shortSection, classInfo.class_name]
        );

        // 4. Check for an existing session matching this class, date, period, and optional subject
        let existing_session = null;
        let records_map = {};

        if (attendance_date) {
            const subjectCondition = subject_id ? "AND s.subject_id = ?" : "AND (s.subject_id IS NULL OR s.subject_id = 0)";
            const sessionParams = [class_id, attendance_date, period];
            if (subject_id) sessionParams.push(subject_id);

            const [[sess]] = await pool.execute(
                `SELECT s.id, s.attendance_date, s.period, s.notes, s.teacher_id, u.name AS teacher_name, s.created_at
                 FROM   attendance_sessions s
                 LEFT JOIN users u ON u.id = s.teacher_id
                 WHERE  s.class_id = ? AND s.attendance_date = ? AND s.period = ?
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
 * Role: admin/headmaster = any class (with warning); staff = must be assigned to class; user = forbidden.
 */
const createSession = async (req, res) => {
    const teacher_id = req.user.sub || req.user.id;
    const schoolId = getSchoolId(req);

    // Students cannot create sessions
    if (req.user.role === "user") {
        return res.status(403).json({ error: "Access denied" });
    }

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
        // Verify class exists and belongs to this school
        const [[cls]] = await pool.execute(
            "SELECT id FROM classes WHERE id = ? AND school_id = ?",
            [class_id, schoolId]
        );
        if (!cls) {
            return res.status(404).json({ error: "Class not found" });
        }

        // Staff must be assigned to this class
        if (req.user.role === "staff") {
            const authorized = await isTeacherAuthorizedForClass(req, class_id);
            if (!authorized) {
                return res.status(403).json({ error: "You are not assigned to this class" });
            }
        }

        // Check if session already exists
        const subjectCondition = subject_id ? "AND subject_id = ?" : "AND (subject_id IS NULL OR subject_id = 0)";
        const checkParams = [class_id, attendance_date, period];
        if (subject_id) checkParams.push(subject_id);

        const [[existing]] = await pool.execute(
            `SELECT id FROM attendance_sessions
             WHERE  class_id = ? AND attendance_date = ? AND period = ? ${subjectCondition}
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

        // Insert new session — include school_id
        const [result] = await pool.execute(
            `INSERT INTO attendance_sessions
             (school_id, class_id, subject_id, teacher_id, term_id, academic_year_id, attendance_date, period, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [schoolId, class_id, subject_id || null, teacher_id, term_id, academic_year_id, attendance_date, period, notes]
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
 * Scoped to school. Staff see only their own sessions (or their assigned classes).
 */
const getSessions = async (req, res) => {
    const {
        class_id, classId,
        teacher_id, teacherId,
        term_id, termId,
        academic_year_id, yearId,
        from_date, fromDate,
        to_date, toDate
    } = req.query;

    const schoolId = getSchoolId(req);
    const role = req.user.role;
    const userId = req.user.sub || req.user.id;

    const targetClass = class_id || classId;
    const targetTeacher = teacher_id || teacherId;
    const targetTerm = term_id || termId;
    const targetYear = academic_year_id || yearId;
    const targetFrom = from_date || fromDate;
    const targetTo = to_date || toDate;

    const filters = ["s.school_id = ?"];
    const values = [schoolId];

    if (targetClass) { filters.push("s.class_id = ?"); values.push(targetClass); }

    // Staff: restrict to classes they are assigned to
    if (role === "staff") {
        if (targetTeacher && String(targetTeacher) !== String(userId)) {
            // Staff cannot query other teachers' sessions
            return res.status(403).json({ error: "Access denied" });
        }
        // Scope to classes where this teacher is assigned
        filters.push(`(s.teacher_id = ? OR s.class_id IN (
            SELECT DISTINCT ts.class_id FROM teacher_subjects ts WHERE ts.teacher_id = ?
            UNION SELECT c2.id FROM classes c2 WHERE c2.class_teacher_id = ?
        ))`);
        values.push(userId, userId, userId);
    } else if (targetTeacher) {
        filters.push("s.teacher_id = ?");
        values.push(targetTeacher);
    }

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
        console.error("getSessionById error:", err.message);
        res.status(500).json({ error: "Failed to load session details" });
    }
};

/**
 * PUT /api/attendance/sessions/:id
 * Updates session metadata.
 */
const updateSession = async (req, res) => {
    const { id } = req.params;
    const { attendance_date, period, notes, subject_id } = req.body;

    try {
        const [[existing]] = await pool.execute(
            "SELECT id FROM attendance_sessions WHERE id = ?",
            [id]
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
    const { id } = req.params;

    try {
        const [result] = await pool.execute(
            "DELETE FROM attendance_sessions WHERE id = ?",
            [id]
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

    // Confirm session exists
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
 * Role: user = only own student record; staff = any student in their assigned classes; admin = all.
 */
const getStudentAttendance = async (req, res) => {
    const { studentId } = req.params;
    const { term_id, academic_year_id, from_date, to_date } = req.query;
    const schoolId = getSchoolId(req);
    const role = req.user.role;
    const userId = req.user.sub || req.user.id;

    try {
        // IDOR: if role is 'user', they can only view their own student record
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
            "SELECT id, first_name, last_name, admission_number FROM students WHERE id = ? AND school_id = ?",
            [studentId, schoolId]
        );
        if (!student) return res.status(404).json({ error: "Student not found" });

        const filters = ["ar.student_id = ?"];
        const values = [studentId];

        if (term_id) { filters.push("sess.term_id = ?"); values.push(term_id); }
        if (academic_year_id) { filters.push("sess.academic_year_id = ?"); values.push(academic_year_id); }
        if (from_date) { filters.push("sess.attendance_date >= ?"); values.push(from_date); }
        if (to_date) { filters.push("sess.attendance_date <= ?"); values.push(to_date); }

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
             WHERE  s.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 8 WEEK)
             GROUP BY s.attendance_date
             ORDER BY s.attendance_date`
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