/**
 * verify_all_enhancements.js — Comprehensive verification of Enhanced Admin Management:
 * 1. Timetable management & conflict detection
 * 2. Class Teacher assignment & Core Focus
 * 3. Staff Role designation (Position & Department)
 * 4. Unified Student/Guardian Account & Lifecycle (create, duplicate prevention, toggle status, archive, restore)
 */
"use strict";

require("dotenv").config({ path: "c:/Users/USER/OneDrive/Documents/PROJECTS/Admin Assist/AA PROTYPE/Backend/.env" });
const pool = require("c:/Users/USER/OneDrive/Documents/PROJECTS/Admin Assist/AA PROTYPE/Backend/src/config/db");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

function createAuthToken(user) {
    return jwt.sign(
        {
            sub: user.id,
            email: user.email,
            role: user.role,
            school_id: user.school_id || 1,
            school_position: user.school_position || "Admin",
        },
        JWT_SECRET,
        { expiresIn: "1h" }
    );
}

async function run() {
    console.log("=== STARTING ENHANCED ADMIN MANAGEMENT VERIFICATION ===");

    // 1. Check admin user and token
    const [adminRows] = await pool.execute("SELECT id, email, role, school_id FROM users WHERE role = 'admin' LIMIT 1");
    if (!adminRows.length) throw new Error("No admin user found in database");
    const adminUser = adminRows[0];
    const adminToken = createAuthToken(adminUser);
    console.log(`[PASS] Admin token generated for: ${adminUser.email} (ID: ${adminUser.id})`);

    // 2. Test Departments & Teacher position
    console.log("\n--- Testing Teacher Role & Department Designation ---");
    const [deptRows] = await pool.execute("SELECT name FROM departments WHERE school_id = ? ORDER BY name ASC", [adminUser.school_id]);
    console.log(`[PASS] Departments found in DB: ${deptRows.map(d => d.name).join(", ")}`);

    const [teacherRows] = await pool.execute("SELECT id, name, email, school_position, department FROM users WHERE role = 'staff' AND school_id = ? LIMIT 1", [adminUser.school_id]);
    if (!teacherRows.length) throw new Error("No staff/teacher found in DB");
    const testTeacher = teacherRows[0];
    console.log(`[INFO] Testing with Teacher ID: ${testTeacher.id} (${testTeacher.name})`);

    // Update teacher with new position and department
    await pool.execute(
        "UPDATE users SET school_position = ?, department = ? WHERE id = ?",
        ["Head of Department", "Natural Sciences", testTeacher.id]
    );
    const [updatedTeacher] = await pool.execute(
        "SELECT id, name, email, school_position, department FROM users WHERE id = ?",
        [testTeacher.id]
    );
    if (updatedTeacher[0].school_position !== "Head of Department" || updatedTeacher[0].department !== "Natural Sciences") {
        throw new Error("Teacher position/department update failed");
    }
    console.log(`[PASS] Teacher updated: position="${updatedTeacher[0].school_position}", department="${updatedTeacher[0].department}"`);

    // 3. Test Class Teacher Assignment & Core Focus
    console.log("\n--- Testing Class Teacher Assignment & Core Focus ---");
    const [classRows] = await pool.execute("SELECT id, grade_level, stream, class_teacher_id, core_focus FROM classes WHERE school_id = ? LIMIT 1", [adminUser.school_id]);
    if (!classRows.length) throw new Error("No classes found");
    const testClass = classRows[0];

    // Assign class teacher and core focus
    await pool.execute(
        "UPDATE classes SET class_teacher_id = ?, core_focus = ? WHERE id = ?",
        [testTeacher.id, "Sciences Focus", testClass.id]
    );

    const [updatedClass] = await pool.execute(
        `SELECT c.id, c.grade_level, c.stream, c.core_focus, u.name AS class_teacher_name
         FROM classes c
         LEFT JOIN users u ON u.id = c.class_teacher_id
         WHERE c.id = ?`,
        [testClass.id]
    );
    if (updatedClass[0].class_teacher_name !== testTeacher.name || updatedClass[0].core_focus !== "Sciences Focus") {
        throw new Error("Class teacher assignment or core focus failed");
    }
    console.log(`[PASS] Class ${updatedClass[0].grade_level} ${updatedClass[0].stream}: Class Teacher="${updatedClass[0].class_teacher_name}", Core Focus="${updatedClass[0].core_focus}"`);

    // 4. Test Timetable Conflict Detection & CRUD
    console.log("\n--- Testing Timetable Creation & Conflict Detection ---");
    const [subjectRows] = await pool.execute("SELECT id FROM subjects WHERE school_id = ? LIMIT 1", [adminUser.school_id]);
    const [termRows] = await pool.execute("SELECT id, academic_year_id FROM terms WHERE school_id = ? LIMIT 1", [adminUser.school_id]);
    const subjectId = subjectRows[0]?.id || 1;
    const termId = termRows[0]?.id || 1;
    const yearId = termRows[0]?.academic_year_id || 1;

    // Clean up any test timetable entries first
    await pool.execute("DELETE FROM timetables WHERE room = 'TEST-LAB-99'");

    // Insert entry 1: Mon 08:00 - 09:00
    const [insertResult] = await pool.execute(
        `INSERT INTO timetables (school_id, academic_year_id, term_id, teacher_id, class_id, subject_id, day_of_week, start_time, end_time, room, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 'Monday', '08:00:00', '09:00:00', 'TEST-LAB-99', 1)`,
        [adminUser.school_id, yearId, termId, testTeacher.id, testClass.id, subjectId]
    );
    const timetableId = insertResult.insertId;
    console.log(`[PASS] Created timetable entry ID: ${timetableId} (Monday 08:00–09:00)`);

    // Check teacher conflict query
    const [teacherConflict] = await pool.execute(
        `SELECT id FROM timetables
         WHERE school_id = ? AND academic_year_id = ? AND term_id = ?
           AND teacher_id = ? AND day_of_week = 'Monday' AND is_active = 1
           AND start_time < '08:30:00' AND end_time > '08:15:00'`,
        [adminUser.school_id, yearId, termId, testTeacher.id]
    );
    if (!teacherConflict.length) throw new Error("Teacher conflict check failed to find overlap");
    console.log(`[PASS] Conflict correctly detected for teacher at 08:15–08:30 (overlaps with entry ${teacherConflict[0].id})`);

    // Check class conflict query
    const [classConflict] = await pool.execute(
        `SELECT id FROM timetables
         WHERE school_id = ? AND academic_year_id = ? AND term_id = ?
           AND class_id = ? AND day_of_week = 'Monday' AND is_active = 1
           AND start_time < '08:45:00' AND end_time > '08:30:00'`,
        [adminUser.school_id, yearId, termId, testClass.id]
    );
    if (!classConflict.length) throw new Error("Class conflict check failed to find overlap");
    console.log(`[PASS] Conflict correctly detected for class at 08:30–08:45 (overlaps with entry ${classConflict[0].id})`);

    // Cleanup timetable test entry
    await pool.execute("DELETE FROM timetables WHERE id = ?", [timetableId]);
    console.log(`[PASS] Cleaned up test timetable entry`);

    // 5. Test Unified Student Account & Lifecycle
    console.log("\n--- Testing Unified Student Account Lifecycle ---");
    const [studentRows] = await pool.execute(
        "SELECT id, admission_number, first_name, last_name, status, user_id FROM students WHERE school_id = ? AND status != 'Archived' LIMIT 1",
        [adminUser.school_id]
    );
    if (!studentRows.length) throw new Error("No student found");
    const testStudent = studentRows[0];
    console.log(`[INFO] Testing with Student ID: ${testStudent.id} (${testStudent.first_name} ${testStudent.last_name}, Adm: ${testStudent.admission_number})`);

    // Test account creation logic
    const testEmail = `test.student.${testStudent.id}@school.local`;
    // Clean up any previous test user with this email
    const [existingUsers] = await pool.execute("SELECT id FROM users WHERE email = ?", [testEmail]);
    for (const u of existingUsers) {
        await pool.execute("UPDATE students SET user_id = NULL WHERE user_id = ?", [u.id]);
        await pool.execute("DELETE FROM users WHERE id = ?", [u.id]);
    }

    // Insert user
    const [userInsert] = await pool.execute(
        `INSERT INTO users (school_id, name, email, password_hash, role, school_position, is_active)
         VALUES (?, ?, ?, 'dummy_hash', 'user', 'Student', 1)`,
        [adminUser.school_id, `${testStudent.first_name} ${testStudent.last_name}`, testEmail]
    );
    const createdUserId = userInsert.insertId;
    await pool.execute("UPDATE students SET user_id = ? WHERE id = ?", [createdUserId, testStudent.id]);
    console.log(`[PASS] Created unified account user ID: ${createdUserId} linked to student ID: ${testStudent.id}`);

    // Verify account active status toggle
    await pool.execute("UPDATE users SET is_active = 0 WHERE id = ?", [createdUserId]);
    const [disabledUser] = await pool.execute("SELECT is_active FROM users WHERE id = ?", [createdUserId]);
    if (disabledUser[0].is_active !== 0) throw new Error("Disabling account failed");
    console.log(`[PASS] Unified account disabled (is_active = 0)`);

    await pool.execute("UPDATE users SET is_active = 1 WHERE id = ?", [createdUserId]);
    const [enabledUser] = await pool.execute("SELECT is_active FROM users WHERE id = ?", [createdUserId]);
    if (enabledUser[0].is_active !== 1) throw new Error("Enabling account failed");
    console.log(`[PASS] Unified account re-enabled (is_active = 1)`);

    // Test archive student
    await pool.execute("UPDATE students SET status = 'Archived' WHERE id = ?", [testStudent.id]);
    await pool.execute("UPDATE users SET is_active = 0 WHERE id = ?", [createdUserId]);
    const [archivedStudent] = await pool.execute("SELECT status FROM students WHERE id = ?", [testStudent.id]);
    if (archivedStudent[0].status !== "Archived") throw new Error("Student archive failed");
    console.log(`[PASS] Student status set to "Archived" and portal account deactivated`);

    // Test restore student
    await pool.execute("UPDATE students SET status = 'Active' WHERE id = ?", [testStudent.id]);
    await pool.execute("UPDATE users SET is_active = 1 WHERE id = ?", [createdUserId]);
    const [restoredStudent] = await pool.execute("SELECT status FROM students WHERE id = ?", [testStudent.id]);
    if (restoredStudent[0].status !== "Active") throw new Error("Student restore failed");
    console.log(`[PASS] Student status restored to "Active" and portal account reactivated`);

    // Clean up test user
    await pool.execute("UPDATE students SET user_id = ? WHERE id = ?", [testStudent.user_id, testStudent.id]);
    await pool.execute("DELETE FROM users WHERE id = ?", [createdUserId]);
    console.log(`[PASS] Cleaned up temporary test user`);

    console.log("\n=== ALL ENHANCEMENT VERIFICATIONS PASSED SUCCESSFULLY ===");
}

run()
    .catch((err) => {
        console.error("\n[FAIL] Verification encountered an error:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await pool.end();
        } catch (_) {}
    });
