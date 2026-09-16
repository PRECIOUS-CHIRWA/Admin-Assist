// Backend/src/controllers/dashboardController.js
"use strict";

const pool = require("../config/db");

/**
 * GET /api/dashboard/stats
 * Returns role-tailored dashboard statistics with strict school isolation.
 *   - admin/headmaster: School-wide statistics
 *   - staff: Teacher's assigned classes, subjects, students count, today's class attendance
 *   - user: Unified Student/Parent view (student profile, attendance rate, recent results, guardian info)
 */
const getDashboardStats = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const role = req.user?.role || "user";
        const userId = req.user?.sub;

        // ── 1. STAFF / TEACHER DASHBOARD STATS ─────────────────────────────────
        if (role === "staff") {
            // Get teacher's assigned classes and subjects
            const [assignedRows] = await pool.execute(
                `SELECT DISTINCT ts.class_id, ts.subject_id,
                        c.grade_level, c.stream,
                        CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name,
                        sub.subject_code, sub.subject_name
                 FROM teacher_subjects ts
                 JOIN classes c ON c.id = ts.class_id
                 JOIN subjects sub ON sub.id = ts.subject_id
                 WHERE ts.teacher_id = ? AND c.school_id = ?`,
                [userId, schoolId]
            );

            // Also check if teacher is assigned as class_teacher_id
            const [formClasses] = await pool.execute(
                `SELECT id AS class_id, grade_level, stream,
                        CONCAT(grade_level, IF(stream != '', CONCAT(' ', stream), '')) AS class_name
                 FROM classes
                 WHERE class_teacher_id = ? AND school_id = ?`,
                [userId, schoolId]
            );

            const classMap = new Map();
            assignedRows.forEach(r => classMap.set(r.class_id, { id: r.class_id, class_name: r.class_name, grade_level: r.grade_level, stream: r.stream }));
            formClasses.forEach(r => classMap.set(r.class_id, { id: r.class_id, class_name: r.class_name, grade_level: r.grade_level, stream: r.stream }));
            const assignedClassesList = Array.from(classMap.values());

            const subjectMap = new Map();
            assignedRows.forEach(r => subjectMap.set(r.subject_id, { id: r.subject_id, code: r.subject_code, name: r.subject_name }));
            const assignedSubjectsList = Array.from(subjectMap.values());

            const classIds = assignedClassesList.map(c => c.id);

            let totalStudentsInClasses = 0;
            let todayAttendance = { present: 0, absent: 0, late: 0, total: 0, rate: 0 };

            if (classIds.length > 0) {
                const placeholders = classIds.map(() => "?").join(",");
                const [[{ totalStudents }]] = await pool.execute(
                    `SELECT COUNT(DISTINCT s.id) AS totalStudents
                     FROM students s
                     WHERE s.school_id = ? AND s.status = 'Active' AND s.class_id IN (${placeholders})`,
                    [schoolId, ...classIds]
                );
                totalStudentsInClasses = Number(totalStudents) || 0;

                // Today's attendance for teacher's classes
                const [[attToday]] = await pool.execute(
                    `SELECT
                        COALESCE(SUM(ar.status = 'present'), 0) AS todayPresent,
                        COALESCE(SUM(ar.status = 'absent'),  0) AS todayAbsent,
                        COALESCE(SUM(ar.status = 'late'),    0) AS todayLate,
                        COUNT(ar.id)                            AS todayTotal
                     FROM attendance_records ar
                     JOIN attendance_sessions s ON s.id = ar.session_id
                     WHERE s.school_id = ? AND s.attendance_date = CURDATE() AND s.class_id IN (${placeholders})`,
                    [schoolId, ...classIds]
                );
                const attTot = Number(attToday.todayTotal) || 0;
                todayAttendance = {
                    present: Number(attToday.todayPresent) || 0,
                    absent: Number(attToday.todayAbsent) || 0,
                    late: Number(attToday.todayLate) || 0,
                    total: attTot,
                    rate: attTot > 0 ? Math.round((Number(attToday.todayPresent) / attTot) * 100) : 0,
                };
            }

            // Results entered by teacher
            const [[{ recentResultsCount }]] = await pool.execute(
                `SELECT COUNT(*) AS recentResultsCount
                 FROM results
                 WHERE teacher_id = ?`,
                [userId]
            );

            // Today's timetable periods for teacher
            let todayClassesCount = 0;
            let todayDayName = "Monday";
            try {
                const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lusaka", weekday: "long" });
                todayDayName = dayFormatter.format(new Date());

                // Lookup active academic year and term for the school if available
                let ttSql = `
                    SELECT COUNT(*) AS todayClassesCount
                    FROM timetables tt
                    WHERE tt.teacher_id = ? AND tt.school_id = ? AND tt.day_of_week = ? AND tt.is_active = 1
                `;
                const ttParams = [userId, schoolId, todayDayName];

                const [[currYear]] = await pool.execute(
                    `SELECT id FROM academic_years WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1`,
                    [schoolId]
                ).catch(() => [[null]]);

                const [[currTerm]] = await pool.execute(
                    `SELECT id FROM terms WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1`,
                    [schoolId]
                ).catch(() => [[null]]);

                if (currYear?.id) {
                    ttSql += ` AND (tt.academic_year_id = ? OR tt.academic_year_id IS NULL)`;
                    ttParams.push(currYear.id);
                }
                if (currTerm?.id) {
                    ttSql += ` AND (tt.term_id = ? OR tt.term_id IS NULL)`;
                    ttParams.push(currTerm.id);
                }

                const [[ttToday]] = await pool.execute(ttSql, ttParams);
                todayClassesCount = Number(ttToday?.todayClassesCount) || 0;
            } catch (ttErr) {
                console.warn("dashboard staff timetable query note:", ttErr.message);
            }

            return res.json({
                role: "staff",
                assignedClassesCount: assignedClassesList.length,
                assignedSubjectsCount: assignedSubjectsList.length,
                studentsCount: totalStudentsInClasses,
                todayClassesCount,
                todayDayName,
                assignedClasses: assignedClassesList,
                assignedSubjects: assignedSubjectsList,
                todayAttendance,
                recentResultsCount: Number(recentResultsCount) || 0,
            });
        }

        // ── 2. UNIFIED STUDENT / PARENT DASHBOARD STATS ('user') ──────────────
        if (role === "user") {
            const [[student]] = await pool.execute(
                `SELECT s.*,
                        CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name
                 FROM students s
                 LEFT JOIN classes c ON c.id = s.class_id
                 WHERE s.user_id = ? AND s.school_id = ?
                 LIMIT 1`,
                [userId, schoolId]
            );

            if (!student) {
                return res.json({
                    role: "user",
                    student: null,
                    attendance: { rate: 0, present: 0, absent: 0, total: 0 },
                    results: [],
                });
            }

            // Student attendance
            const [[attRow]] = await pool.execute(
                `SELECT
                    COALESCE(SUM(status = 'present'), 0) AS present,
                    COALESCE(SUM(status = 'absent'),  0) AS absent,
                    COALESCE(SUM(status = 'late'),    0) AS late,
                    COALESCE(SUM(status = 'excused'), 0) AS excused,
                    COUNT(id) AS total
                 FROM attendance_records
                 WHERE student_id = ?`,
                [student.id]
            );
            const totalAtt = Number(attRow.total) || 0;
            const attRate = totalAtt > 0 ? Math.round((Number(attRow.present) / totalAtt) * 100) : 0;

            // Student latest results
            const [results] = await pool.execute(
                `SELECT r.id, r.test_mark, r.assignment_mark, r.exam_mark, r.total_marks,
                        r.percentage, r.grade_code, r.grade_classification, r.remarks,
                        sub.subject_code, sub.subject_name, t.term_name, ay.year_label
                 FROM results r
                 JOIN subjects sub ON sub.id = r.subject_id
                 JOIN terms t ON t.id = r.term_id
                 JOIN academic_years ay ON ay.id = r.academic_year_id
                 WHERE r.student_id = ?
                 ORDER BY r.id DESC
                 LIMIT 10`,
                [student.id]
            );

            return res.json({
                role: "user",
                student: {
                    id: student.id,
                    admission_number: student.admission_number,
                    first_name: student.first_name,
                    last_name: student.last_name,
                    full_name: `${student.first_name} ${student.last_name}`,
                    grade: student.grade,
                    section: student.section,
                    class_name: student.class_name,
                    parent_guardian_name: student.parent_guardian_name,
                    relationship: student.relationship,
                    phone_number: student.phone_number,
                    email: student.email,
                    status: student.status,
                },
                attendance: {
                    present: Number(attRow.present) || 0,
                    absent: Number(attRow.absent) || 0,
                    late: Number(attRow.late) || 0,
                    excused: Number(attRow.excused) || 0,
                    total: totalAtt,
                    rate: attRate,
                },
                results,
            });
        }

        // ── 3. ADMIN & HEAD TEACHER FULL DASHBOARD STATS ─────────────────────
        const isHeadMaster = (role === "headmaster" || req.user?.school_position === "Head Teacher");

        const [[{ totalStudents }]] = await pool.execute(
            "SELECT COUNT(*) AS totalStudents FROM students WHERE school_id = ? AND status != 'Inactive'",
            [schoolId]
        );

        const [[{ totalTeachers }]] = await pool.execute(
            "SELECT COUNT(*) AS totalTeachers FROM users WHERE school_id = ? AND role IN ('staff', 'headmaster', 'admin') AND (school_position != 'Student' OR school_position IS NULL) AND is_active = 1",
            [schoolId]
        );

        const [[{ totalClasses }]] = await pool.execute(
            "SELECT COUNT(*) AS totalClasses FROM classes WHERE school_id = ?",
            [schoolId]
        );

        const [[{ pendingEnrollments }]] = await pool.execute(
            "SELECT COUNT(*) AS pendingEnrollments FROM students WHERE school_id = ? AND status = 'Suspended'",
            [schoolId]
        );

        const [[{ pendingApprovals }]] = await pool.execute(
            "SELECT COUNT(*) AS pendingApprovals FROM users WHERE school_id = ? AND is_active = 0",
            [schoolId]
        );

        // Today's school attendance overview
        const [[attendanceToday]] = await pool.execute(
            `SELECT
                COALESCE(SUM(ar.status = 'present'), 0) AS todayPresent,
                COALESCE(SUM(ar.status = 'absent'),  0) AS todayAbsent,
                COALESCE(SUM(ar.status = 'late'),    0) AS todayLate,
                COUNT(ar.id)                            AS todayTotal
             FROM attendance_records ar
             JOIN attendance_sessions s ON s.id = ar.session_id
             WHERE s.school_id = ? AND s.attendance_date = CURDATE()`,
            [schoolId]
        );

        const [[{ newAdmissions }]] = await pool.execute(
            `SELECT COUNT(*) AS newAdmissions FROM students
             WHERE school_id = ?
               AND MONTH(enrollment_date) = MONTH(CURDATE())
               AND YEAR(enrollment_date)  = YEAR(CURDATE())`,
            [schoolId]
        );

        const todayTotal = Number(attendanceToday.todayTotal) || 0;
        const attendanceRate = todayTotal > 0
            ? Math.round((attendanceToday.todayPresent / todayTotal) * 100)
            : 0;

        // Check if admin is also a teacher
        let isTeacher = false;
        let assignedClassesCount = 0;
        let assignedSubjectsCount = 0;
        try {
            const [tsRows] = await pool.execute(
                "SELECT DISTINCT class_id, subject_id FROM teacher_subjects WHERE teacher_id = ?",
                [userId]
            );
            const [ctRows] = await pool.execute(
                "SELECT id FROM classes WHERE class_teacher_id = ?",
                [userId]
            );
            isTeacher = tsRows.length > 0 || ctRows.length > 0 || (req.user?.school_position === 'Teacher');
            if (isTeacher) {
                const classSet = new Set([...tsRows.map(r => r.class_id), ...ctRows.map(r => r.id)]);
                const subjectSet = new Set(tsRows.map(r => r.subject_id));
                assignedClassesCount = classSet.size;
                assignedSubjectsCount = subjectSet.size;
            }
        } catch { /* non-fatal */ }

        res.json({
            role: isHeadMaster ? "headmaster" : "admin",
            totalStudents: Number(totalStudents) || 0,
            totalTeachers: Number(totalTeachers) || 0,
            totalClasses: Number(totalClasses) || 0,
            pendingEnrollments: Number(pendingEnrollments) || 0,
            pendingApprovals: Number(pendingApprovals) || 0,
            todayPresent: Number(attendanceToday.todayPresent) || 0,
            todayAbsent: Number(attendanceToday.todayAbsent) || 0,
            todayLate: Number(attendanceToday.todayLate) || 0,
            todayTotal,
            attendanceRate,
            newAdmissions: Number(newAdmissions) || 0,
            is_teacher: isTeacher,
            assignedClassesCount,
            assignedSubjectsCount
        });
    } catch (err) {
        console.error("getDashboardStats error:", err.message);
        res.status(500).json({ error: "Failed to load dashboard statistics" });
    }
};

/**
 * GET /api/dashboard/recent-activity
 * Returns recent activity scoped by role and school.
 */
const getRecentActivity = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const role = req.user?.role || "user";
        const userId = req.user?.sub;

        // Verify audit_log table exists
        const [tables] = await pool.execute(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_log'"
        );
        if (!tables.length) {
            return res.json([]);
        }

        let query = "";
        let params = [];

        if (role === "admin" || role === "headmaster") {
            query = `SELECT al.id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
                            u.name AS actorName, u.role AS actorRole
                     FROM audit_log al
                     LEFT JOIN users u ON u.id = al.actor_id
                     WHERE u.school_id = ?
                     ORDER BY al.created_at DESC
                     LIMIT 10`;
            params = [schoolId];
        } else if (role === "staff") {
            query = `SELECT al.id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
                            u.name AS actorName, u.role AS actorRole
                     FROM audit_log al
                     LEFT JOIN users u ON u.id = al.actor_id
                     WHERE al.actor_id = ?
                     ORDER BY al.created_at DESC
                     LIMIT 10`;
            params = [userId];
        } else {
            // Student / Parent: Show recent activity relevant to their student
            const [[student]] = await pool.execute(
                "SELECT id FROM students WHERE user_id = ? AND school_id = ? LIMIT 1",
                [userId, schoolId]
            );
            if (!student) return res.json([]);

            query = `SELECT al.id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
                            u.name AS actorName, u.role AS actorRole
                     FROM audit_log al
                     LEFT JOIN users u ON u.id = al.actor_id
                     WHERE (al.entity_type = 'student' AND al.entity_id = ?)
                        OR (al.entity_type = 'result' AND JSON_EXTRACT(al.details, '$.student_id') = ?)
                     ORDER BY al.created_at DESC
                     LIMIT 8`;
            params = [student.id, student.id];
        }

        const [rows] = await pool.execute(query, params);

        const activities = await Promise.all(rows.map(async (row) => ({
            id: row.id,
            action: row.action,
            entityType: row.entity_type,
            entityId: row.entity_id,
            details: row.details,
            actorName: row.actorName || "System",
            actorRole: row.actorRole || "User",
            createdAt: row.created_at,
            description: await buildHumanReadableDescription(row),
        })));

        res.json(activities);
    } catch (err) {
        console.error("getRecentActivity error:", err.message);
        res.status(500).json({ error: "Failed to load recent activity" });
    }
};

/**
 * Generates human-readable descriptions for audit log records.
 * Avoids exposing raw technical IDs like 'user create_teacher' or 'create_student'.
 */
async function buildHumanReadableDescription(row) {
    let details = {};
    if (row.details) {
        if (typeof row.details === "object") {
            details = row.details;
        } else if (typeof row.details === "string") {
            try {
                details = JSON.parse(row.details);
            } catch {
                details = {};
            }
        }
    }

    const action = String(row.action || "").toUpperCase();
    const entityType = String(row.entity_type || "").toLowerCase();

    // 1. TEACHER & STAFF ACCOUNT CREATION / UPDATES
    if (action === "CREATE_TEACHER" || (entityType === "user" && action.includes("TEACHER"))) {
        const teacherName = details.name || details.fullName || details.teacherName;
        if (teacherName) {
            return `Account created for ${teacherName}`;
        }
        if (row.entity_id) {
            const [[u]] = await pool.execute("SELECT name FROM users WHERE id = ? LIMIT 1", [row.entity_id]).catch(() => [[null]]);
            if (u?.name) return `Account created for ${u.name}`;
        }
        return `Teacher account created`;
    }

    // 2. STUDENT ACCOUNT CREATION
    if (action === "CREATE_STUDENT_ACCOUNT" || action === "STUDENT_ACCOUNT_CREATED") {
        const studentName = details.studentName || details.name || details.fullName;
        if (studentName) {
            return `Student account created for ${studentName}`;
        }
        if (row.entity_id) {
            const [[s]] = await pool.execute("SELECT CONCAT(first_name, ' ', last_name) as name FROM students WHERE id = ? LIMIT 1", [row.entity_id]).catch(() => [[null]]);
            if (s?.name) return `Student account created for ${s.name}`;
        }
        return `Student account created`;
    }

    // 3. STUDENT ENROLLMENT / RECORD CREATION
    if (action === "CREATE_STUDENT" || action === "ENROLL_STUDENT" || (entityType === "student" && (action === "CREATE" || action.includes("ENROLL")))) {
        const studentName = details.name || details.studentName || (details.firstName && details.lastName ? `${details.firstName} ${details.lastName}` : null);
        if (studentName) {
            return `Student enrolled: ${studentName}`;
        }
        if (row.entity_id) {
            const [[s]] = await pool.execute("SELECT CONCAT(first_name, ' ', last_name) as name FROM students WHERE id = ? LIMIT 1", [row.entity_id]).catch(() => [[null]]);
            if (s?.name) return `Student enrolled: ${s.name}`;
        }
        return `Student enrolled`;
    }

    // 4. STUDENT RECORD UPDATES / DEACTIVATIONS
    if (entityType === "student" && (action === "UPDATE" || action.includes("UPDATE"))) {
        const studentName = details.name || details.studentName || (details.firstName && details.lastName ? `${details.firstName} ${details.lastName}` : null);
        if (studentName) return `Student record updated for ${studentName}`;
        return `Student record updated`;
    }

    // 5. RESULTS SUBMISSIONS & UPDATES
    if (action.includes("RESULT") || entityType === "results" || entityType === "result") {
        let className = details.class_name;
        if (!className && details.class_id) {
            const [[c]] = await pool.execute("SELECT CONCAT(grade_level, IF(stream != '', CONCAT(' ', stream), '')) as name FROM classes WHERE id = ? LIMIT 1", [details.class_id]).catch(() => [[null]]);
            className = c?.name;
        }
        let subjectName = details.subject_name;
        if (!subjectName && details.subject_id) {
            const [[sub]] = await pool.execute("SELECT subject_name FROM subjects WHERE id = ? LIMIT 1", [details.subject_id]).catch(() => [[null]]);
            subjectName = sub?.subject_name;
        }
        if (className && subjectName) {
            return `Results updated for ${className} — ${subjectName}`;
        }
        if (className) {
            return `Results updated for ${className}`;
        }
        return `Academic results updated`;
    }

    // 6. ATTENDANCE SUBMISSIONS
    if (action.includes("ATTENDANCE") || entityType === "attendance") {
        let className = details.class_name;
        if (!className && details.class_id) {
            const [[c]] = await pool.execute("SELECT CONCAT(grade_level, IF(stream != '', CONCAT(' ', stream), '')) as name FROM classes WHERE id = ? LIMIT 1", [details.class_id]).catch(() => [[null]]);
            className = c?.name;
        }
        if (className) {
            return `Attendance submitted for ${className}`;
        }
        return `Attendance submitted`;
    }

    // 7. TIMETABLE
    if (action.includes("TIMETABLE") || entityType === "timetable" || entityType === "timetables") {
        let className = details.class_name;
        if (!className && details.class_id) {
            const [[c]] = await pool.execute("SELECT CONCAT(grade_level, IF(stream != '', CONCAT(' ', stream), '')) as name FROM classes WHERE id = ? LIMIT 1", [details.class_id]).catch(() => [[null]]);
            className = c?.name;
        }
        if (className) {
            return `Timetable updated for ${className}`;
        }
        return `Timetable updated`;
    }

    // 8. SETTINGS
    if (action.includes("SETTING") || entityType === "settings" || entityType === "school_settings") {
        return `School settings updated`;
    }

    // 9. AUTH
    if (action === "LOGIN") return `Signed in`;
    if (action === "LOGOUT") return `Signed out`;

    // 10. CLEAN FALLBACK: Clean up any raw technical string
    const cleanAction = action
        .toLowerCase()
        .replace(/^user\s+/, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
    const cleanEntity = entityType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    return `${cleanAction} (${cleanEntity})`;
}

/**
 * GET /api/dashboard/enrollment-stats
 */
const getEnrollmentStats = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const [[{ totalStudents }]] = await pool.execute(
            "SELECT COUNT(*) AS totalStudents FROM students WHERE school_id = ? AND status != 'Inactive'",
            [schoolId]
        );
        const [[{ newThisMonth }]] = await pool.execute(
            `SELECT COUNT(*) AS newThisMonth FROM students
             WHERE school_id = ?
               AND MONTH(enrollment_date) = MONTH(CURDATE())
               AND YEAR(enrollment_date)  = YEAR(CURDATE())`,
            [schoolId]
        );
        const [[{ totalClasses }]] = await pool.execute("SELECT COUNT(*) AS totalClasses FROM classes WHERE school_id = ?", [schoolId]);
        const [[{ activeStudents }]] = await pool.execute("SELECT COUNT(*) AS activeStudents FROM students WHERE school_id = ? AND status = 'Active'", [schoolId]);

        const [[{ maleStudents }]] = await pool.execute(
            "SELECT COUNT(*) AS maleStudents FROM students WHERE school_id = ? AND status != 'Inactive' AND (gender = 'Male' OR gender = 'M')",
            [schoolId]
        );
        const [[{ femaleStudents }]] = await pool.execute(
            "SELECT COUNT(*) AS femaleStudents FROM students WHERE school_id = ? AND status != 'Inactive' AND (gender = 'Female' OR gender = 'F')",
            [schoolId]
        );

        res.json({
            totalStudents: Number(totalStudents) || 0,
            activeStudents: Number(activeStudents) || 0,
            maleStudents: Number(maleStudents) || 0,
            femaleStudents: Number(femaleStudents) || 0,
            newThisMonth: Number(newThisMonth) || 0,
            totalClasses: Number(totalClasses) || 0,
            total: Number(totalStudents) || 0,
            new_this_month: Number(newThisMonth) || 0,
            thisMonth: Number(newThisMonth) || 0,
        });
    } catch (err) {
        console.error("getEnrollmentStats error:", err.message);
        res.status(500).json({ error: "Failed to load enrollment stats" });
    }
};

module.exports = { getDashboardStats, getRecentActivity, getEnrollmentStats, buildHumanReadableDescription };