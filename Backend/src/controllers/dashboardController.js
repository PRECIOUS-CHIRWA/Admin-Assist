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

            return res.json({
                role: "staff",
                assignedClassesCount: assignedClassesList.length,
                assignedSubjectsCount: assignedSubjectsList.length,
                studentsCount: totalStudentsInClasses,
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

        // ── 3. ADMIN / HEADMASTER DASHBOARD STATS ──────────────────────────────
        const [[{ totalStudents }]] = await pool.execute(
            "SELECT COUNT(*) AS totalStudents FROM students WHERE school_id = ? AND status != 'Inactive'",
            [schoolId]
        );

        const [[{ totalTeachers }]] = await pool.execute(
            "SELECT COUNT(*) AS totalTeachers FROM users WHERE school_id = ? AND role IN ('staff', 'headmaster') AND is_active = 1",
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

        res.json({
            role: "admin",
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

        const activities = rows.map((row) => ({
            id: row.id,
            action: row.action,
            entityType: row.entity_type,
            entityId: row.entity_id,
            details: row.details,
            actorName: row.actorName || "System",
            actorRole: row.actorRole || "User",
            createdAt: row.created_at,
            description: _buildDescription(row),
        }));

        res.json(activities);
    } catch (err) {
        console.error("getRecentActivity error:", err.message);
        res.status(500).json({ error: "Failed to load recent activity" });
    }
};

function _buildDescription(row) {
    const entity = row.entity_type || "Record";
    switch (row.action) {
        case "CREATE": return `${entity} created`;
        case "UPDATE": return `${entity} updated`;
        case "DELETE": return `${entity} deleted`;
        case "LOGIN": return `Logged in`;
        case "LOGOUT": return `Logged out`;
        case "ASSIGN": return `${entity} assigned`;
        case "REVOKE": return `${entity} revoked`;
        case "SUSPEND": return `${entity} suspended`;
        case "RESTORE": return `${entity} restored`;
        default: return `${entity} ${String(row.action).toLowerCase()}`;
    }
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

module.exports = { getDashboardStats, getRecentActivity, getEnrollmentStats };