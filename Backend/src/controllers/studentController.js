const crypto = require("crypto");
const { promisify } = require("util");
const pool = require("../config/db");
const { sendNotification } = require("./notificationController");
const { sendNewAccountEmail } = require("../services/emailService");

const scrypt = promisify(crypto.scrypt);

const _hashPassword = async (password) => {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await scrypt(password, salt, 64);
    return `scrypt$${salt}$${hash.toString("hex")}`;
};

const _generateTempPassword = () => {
    return crypto.randomBytes(9).toString("base64url").slice(0, 12);
};

// ─── Audit logging helper ─────────────────────────────────────────────────────
const _auditLog = async (actorId, action, entityType, entityId, details = {}) => {
    try {
        await pool.execute(
            `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
             VALUES (?, ?, ?, ?, ?)`,
            [actorId, action, entityType, entityId, JSON.stringify(details)]
        );
    } catch (err) {
        // Silently skip if audit_log table hasn't been migrated yet
        if (err.code !== "ER_NO_SUCH_TABLE") {
            console.error("auditLog write error:", err.message);
        }
    }
};

// ─── Translators ─────────────────────────────────────────────────────────────
const formatDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().split("T")[0];
};

const toApiShape = (row) => {
    let accountStatus = "Not Created";
    if (row.status === "Archived") {
        accountStatus = "Archived";
    } else if (row.user_id && (row.user_email || row.account_email)) {
        accountStatus = (row.user_is_active === 0) ? "Disabled" : "Active";
    } else if (row.user_id) {
        accountStatus = (row.user_is_active === 0) ? "Disabled" : "Active";
    }

    return {
        id: row.id,
        school_id: row.school_id,
        user_id: row.user_id || null,
        account_status: accountStatus,
        account_email: row.user_email || row.account_email || row.email || null,
        account_is_active: row.user_is_active !== undefined ? Number(row.user_is_active) : (row.user_id ? 1 : 0),
        admissionNumber: row.admission_number,
        admission_number: row.admission_number,
        firstName: row.first_name,
        first_name: row.first_name,
        lastName: row.last_name,
        last_name: row.last_name,
        dateOfBirth: formatDate(row.date_of_birth),
        date_of_birth: formatDate(row.date_of_birth),
        gender: row.gender,
        nrcNumber: row.nrc_number,
        nrc_number: row.nrc_number,
        homeAddress: row.home_address,
        home_address: row.home_address,
        district: row.district,
        province: row.province,
        grade: row.grade,
        section: row.section,
        class_id: row.class_id || null,
        class_name: row.class_name || (row.grade ? `${row.grade} ${row.section || ''}`.trim() : '—'),
        enrollmentDate: formatDate(row.enrollment_date),
        enrollment_date: formatDate(row.enrollment_date),
        previousSchool: row.previous_school,
        previous_school: row.previous_school,
        parentGuardianName: row.parent_guardian_name,
        parent_guardian_name: row.parent_guardian_name,
        guardian_name: row.parent_guardian_name,
        relationship: row.relationship,
        guardian_relationship: row.relationship,
        phoneNumber: row.phone_number,
        phone_number: row.phone_number,
        guardian_phone: row.phone_number,
        email: row.email,
        guardian_email: row.email,
        status: row.status || 'Active',
        createdAt: row.created_at,
        created_at: row.created_at,
    };
};

const REQUIRED_FIELDS = [
    "admissionNumber", "firstName", "lastName", "dateOfBirth", "gender",
    "province", "grade", "section", "enrollmentDate",
    "parentGuardianName", "relationship", "phoneNumber",
];

const PHONE_PATTERN = /^\+260\d{9}$/;

// ─── List students ────────────────────────────────────────────────────────────
const listStudents = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
        const offset = (page - 1) * limit;
        const search = String(req.query.search || "").trim();
        const grade = String(req.query.grade || "").trim();
        const status = String(req.query.status || "").trim();
        const classId = req.query.class_id || req.query.classId;
        const includeArchived = req.query.include_archived === "true" || req.query.include_archived === "1";

        const conditions = ["s.school_id = ?"];
        const params = [schoolId];

        // Role restriction: Unified Student/Parent ('user') can ONLY see their own record
        if (req.user?.role === "user") {
            conditions.push("s.user_id = ?");
            params.push(req.user.sub);
        }

        if (search) {
            const term = `%${search}%`;
            conditions.push("(s.first_name LIKE ? OR s.last_name LIKE ? OR s.admission_number LIKE ? OR s.grade LIKE ?)");
            params.push(term, term, term, term);
        }
        if (grade) { conditions.push("s.grade = ?"); params.push(grade); }
        if (classId) { conditions.push("s.class_id = ?"); params.push(classId); }

        if (status) {
            conditions.push("s.status = ?");
            params.push(status);
        } else if (!includeArchived) {
            // By default, hide archived students from normal active lists
            conditions.push("s.status != 'Archived'");
        }

        const where = `WHERE ${conditions.join(" AND ")}`;

        const [countRows] = await pool.execute(
            `SELECT COUNT(*) AS total FROM students s ${where}`, params
        );
        const total = countRows[0].total;

        const [rows] = await pool.execute(
            `SELECT s.*,
                    u.email AS user_email,
                    u.is_active AS user_is_active,
                    CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name
             FROM students s
             LEFT JOIN classes c ON c.id = s.class_id
             LEFT JOIN users u ON u.id = s.user_id
             ${where}
             ORDER BY s.id DESC LIMIT ${limit} OFFSET ${offset}`,
            params
        );

        res.json({ students: rows.map(toApiShape), total, page, limit });
    } catch (err) {
        console.error("listStudents error:", err.message);
        res.status(500).json({ error: "Something went wrong while fetching students" });
    }
};

// ─── Get by ID ────────────────────────────────────────────────────────────────
const getStudentById = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const [rows] = await pool.execute(
            `SELECT s.*,
                    u.email AS user_email,
                    u.is_active AS user_is_active,
                    CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name
             FROM students s
             LEFT JOIN classes c ON c.id = s.class_id
             LEFT JOIN users u ON u.id = s.user_id
             WHERE s.id = ? AND s.school_id = ?
             LIMIT 1`,
            [req.params.id, schoolId]
        );
        if (!rows[0]) return res.status(404).json({ error: "Student not found" });

        // IDOR Protection: If student/parent role, verify ownership
        if (req.user?.role === "user" && rows[0].user_id !== req.user.sub) {
            return res.status(403).json({ error: "You do not have permission to view this student record" });
        }

        res.json(toApiShape(rows[0]));
    } catch (err) {
        console.error("getStudentById error:", err.message);
        res.status(500).json({ error: "Something went wrong while fetching the student" });
    }
};

// ─── Auto-generate Admission Number ──────────────────────────────────────────
// Format: ADM-[YEAR]-[CLASS_CODE]-[SEQUENCE]
// e.g. ADM-2026-8A-0001 or ADM-2026-10B-0001
const generateAdmissionNumber = async ({ year, classId, grade, stream }) => {
    const yr = parseInt(year, 10) || new Date().getFullYear();

    let gradeLevel = grade || "";
    let streamCode = stream || "";

    if (classId) {
        const [[cls]] = await pool.execute(
            "SELECT grade_level, stream FROM classes WHERE id = ?",
            [classId]
        );
        if (cls) {
            gradeLevel = cls.grade_level || gradeLevel;
            streamCode = cls.stream || streamCode;
        }
    }

    // Extract grade digit(s): e.g. "Grade 8" -> "8", "Grade 10" -> "10"
    const gradeNum = String(gradeLevel).replace(/[^0-9]/g, "") || "8";
    // Clean stream letter/code: e.g. "A" -> "A", "Science" -> "SCI"
    let streamClean = String(streamCode).trim().toUpperCase();
    if (streamClean.length > 3) streamClean = streamClean.slice(0, 3);

    const classCode = `${gradeNum}${streamClean}`;
    const prefix = `ADM-${yr}-${classCode}-`;

    // Find highest existing sequence for this prefix
    const [rows] = await pool.execute(
        "SELECT admission_number FROM students WHERE admission_number LIKE ? ORDER BY admission_number DESC LIMIT 50",
        [`${prefix}%`]
    );

    let maxSeq = 0;
    for (const r of rows) {
        const parts = r.admission_number.split("-");
        const lastPart = parts[parts.length - 1];
        const num = parseInt(lastPart, 10);
        if (!isNaN(num) && num > maxSeq) {
            maxSeq = num;
        }
    }

    let nextSeq = maxSeq + 1;
    let candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;

    // Safety check: ensure absolute uniqueness in DB
    while (true) {
        const [[exists]] = await pool.execute(
            "SELECT id FROM students WHERE admission_number = ? LIMIT 1",
            [candidate]
        );
        if (!exists) break;
        nextSeq++;
        candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
    }

    return candidate;
};

const getNextAdmissionNumber = async (req, res) => {
    try {
        const { year, class_id, grade, stream } = req.query;
        const adm = await generateAdmissionNumber({
            year,
            classId: class_id,
            grade,
            stream,
        });
        res.json({ admission_number: adm, admissionNumber: adm });
    } catch (err) {
        console.error("getNextAdmissionNumber error:", err.message);
        res.status(500).json({ error: "Failed to generate admission number" });
    }
};

// ─── Create student / Enroll ──────────────────────────────────────────────────
const createStudent = async (req, res) => {
    try {
        const body = req.body || {};

        // Normalize input from both camelCase and snake_case (enroll-student.js payload)
        let admissionNumber = String(body.admissionNumber || body.admission_number || "").trim();
        const firstName = String(body.firstName || body.first_name || "").trim();
        const lastName = String(body.lastName || body.last_name || "").trim();
        const dateOfBirth = formatDate(body.dateOfBirth || body.date_of_birth);
        const gender = String(body.gender || "").trim();
        const nrcNumber = String(body.nrcNumber || body.nrc_number || "").trim() || null;
        const homeAddress = String(body.homeAddress || body.home_address || "").trim() || null;
        const district = String(body.district || "").trim() || null;
        const province = String(body.province || "").trim();
        const classId = body.classId || body.class_id || null;
        const enrollmentDate = formatDate(body.enrollmentDate || body.enrollment_date) || formatDate(new Date());
        const previousSchool = String(body.previousSchool || body.previous_school || "").trim() || null;
        const parentGuardianName = String(body.parentGuardianName || body.guardian_name || body.parent_guardian_name || "").trim();
        const relationship = String(body.relationship || body.guardian_relationship || "").trim();
        let phoneNumber = String(body.phoneNumber || body.guardian_phone || body.phone_number || "").trim();
        const email = String(body.email || body.guardian_email || "").trim() || null;
        const status = String(body.status || "Active").trim();

        // Check required fields (admissionNumber is auto-generated if omitted)
        const missing = [];
        if (!firstName) missing.push("firstName");
        if (!lastName) missing.push("lastName");
        if (!dateOfBirth) missing.push("dateOfBirth");
        if (!gender) missing.push("gender");
        if (!province) missing.push("province");
        if (!classId) missing.push("classId");
        if (!parentGuardianName) missing.push("parentGuardianName");
        if (!relationship) missing.push("relationship");
        if (!phoneNumber) missing.push("phoneNumber");

        if (missing.length) {
            return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
        }

        // Look the class up rather than trusting free-typed grade/section text.
        const [[classRow]] = await pool.execute(
            "SELECT id, grade_level, stream FROM classes WHERE id = ?",
            [classId]
        );
        if (!classRow) {
            return res.status(400).json({ error: "Selected class was not found. Refresh and pick a class again." });
        }
        const grade = classRow.grade_level;
        const section = classRow.stream || "";

        // Automatically generate admission number if not provided
        if (!admissionNumber) {
            const enrollYear = enrollmentDate ? new Date(enrollmentDate).getFullYear() : new Date().getFullYear();
            admissionNumber = await generateAdmissionNumber({
                year: enrollYear,
                classId,
                grade,
                stream: section,
            });
        }

        // Auto-format local Zambian numbers (e.g. 0971234567 -> +260971234567)
        if (/^0\d{9}$/.test(phoneNumber)) {
            phoneNumber = "+260" + phoneNumber.slice(1);
        }

        if (!PHONE_PATTERN.test(phoneNumber)) {
            return res.status(400).json({ error: "Phone number must be in format +260XXXXXXXXX (e.g. +260971234567)" });
        }

        // Age validation
        const dob = new Date(dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        if (age < 10) {
            return res.status(400).json({ error: "Student must be at least 10 years old" });
        }

        // Normalize ENUM fields
        const normalizedGender = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
        let normalizedRelationship = relationship.charAt(0).toUpperCase() + relationship.slice(1).toLowerCase();
        if (!["Father", "Mother", "Guardian"].includes(normalizedRelationship)) {
            normalizedRelationship = "Guardian";
        }

        const schoolId = req.user?.school_id || 1;

        // ── Unified Student / Parent User Account Association ────────────────
        // A single unified account (role 'user') is associated with the student record.
        // If an account email is provided or guardian email is provided, we use it;
        // otherwise, generate a standard student portal email.
        const cleanStudentName = `${firstName} ${lastName}`.trim();
        const accountEmail = (email && email.trim()) 
            ? email.trim().toLowerCase() 
            : `${admissionNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}@student.school.local`;

        let userId = null;
        const [existingUsers] = await pool.execute(
            "SELECT id FROM users WHERE email = ? LIMIT 1",
            [accountEmail]
        );

        if (existingUsers.length > 0) {
            userId = existingUsers[0].id;
        } else {
            // Default password 'Student@123' for student/parent initial access
            const defaultPassword = "Student@123";
            const passwordHash = await _hashPassword(defaultPassword);
            const [newUserRes] = await pool.execute(
                `INSERT INTO users (school_id, name, email, password_hash, role, is_active, email_verified)
                 VALUES (?, ?, ?, ?, 'user', 1, 1)`,
                [schoolId, cleanStudentName, accountEmail, passwordHash]
            );
            userId = newUserRes.insertId;
        }

        const [result] = await pool.execute(
            `INSERT INTO students (
                school_id, user_id, admission_number, first_name, last_name, date_of_birth, gender,
                nrc_number, home_address, district, province, grade, section, class_id,
                enrollment_date, previous_school, parent_guardian_name, relationship,
                phone_number, email, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                schoolId, userId, admissionNumber, firstName, lastName,
                dateOfBirth, normalizedGender,
                nrcNumber, homeAddress,
                district, province,
                grade, section, classId, enrollmentDate,
                previousSchool, parentGuardianName,
                normalizedRelationship, phoneNumber, email || accountEmail,
                status,
            ]
        );

        // Audit log
        await _auditLog(
            req.user.sub,
            `Enrolled student ${firstName} ${lastName} (${admissionNumber}) with unified account`,
            "student", result.insertId,
            { admissionNumber, userId }
        );

        // Notify the enrolling admin/staff that the enrollment succeeded
        try {
            await sendNotification({
                userId: req.user.sub,
                type: "enrollment",
                title: "Student Enrolled",
                description: `${firstName} ${lastName} (${admissionNumber}) has been enrolled successfully.`,
                entityType: "student",
                entityId: result.insertId,
            });
        } catch { /* non-fatal — enrollment must not fail if notification fails */ }

        res.status(201).json({
            message: "Student enrolled successfully",
            id: result.insertId,
            admissionNumber,
            admission_number: admissionNumber,
            firstName,
            lastName,
            createdAt: new Date().toISOString(),
        });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "A student with this admission number already exists" });
        }
        console.error("createStudent error:", err.message);
        res.status(500).json({ error: "Something went wrong while creating the student" });
    }
};

// ─── Update student ───────────────────────────────────────────────────────────
const updateStudent = async (req, res) => {
    try {
        const body = req.body;
        const id = req.params.id;

        // Partial update: only touch fields that were actually sent. The old
        // version required the ENTIRE record (REQUIRED_FIELDS) on every save,
        // which broke the moment any lighter-weight form — like the students
        // list's quick-edit modal, which only shows name/admission#/DOB/class/
        // guardian/status — tried to save just those fields. Every other
        // required field would come back as "missing" even though the user
        // never had a box to fill it in.
        //
        // Also accepts both camelCase (admissionNumber) and snake_case
        // (admission_number) keys per field, since different callers in this
        // codebase send different conventions (e.g. students.js's edit modal
        // sends snake_case) — previously only camelCase was read here, so a
        // snake_case payload would look completely empty to this function.
        const map = {
            admissionNumber: ["admissionNumber", "admission_number"],
            firstName: ["firstName", "first_name"],
            lastName: ["lastName", "last_name"],
            dateOfBirth: ["dateOfBirth", "date_of_birth"],
            gender: ["gender"],
            nrcNumber: ["nrcNumber", "nrc_number"],
            homeAddress: ["homeAddress", "home_address"],
            district: ["district"],
            province: ["province"],
            enrollmentDate: ["enrollmentDate", "enrollment_date"],
            previousSchool: ["previousSchool", "previous_school"],
            parentGuardianName: ["parentGuardianName", "parent_guardian_name", "guardian_name"],
            relationship: ["relationship", "guardian_relationship"],
            phoneNumber: ["phoneNumber", "phone_number", "guardian_phone"],
            email: ["email", "guardian_email"],
            status: ["status"],
        };
        const pick = (keys) => {
            for (const k of keys) {
                if (body[k] !== undefined) return body[k];
            }
            return undefined;
        };

        const columns = {
            admissionNumber: "admission_number", firstName: "first_name", lastName: "last_name",
            dateOfBirth: "date_of_birth", gender: "gender", nrcNumber: "nrc_number",
            homeAddress: "home_address", district: "district", province: "province",
            enrollmentDate: "enrollment_date", previousSchool: "previous_school",
            parentGuardianName: "parent_guardian_name", relationship: "relationship",
            phoneNumber: "phone_number", email: "email", status: "status",
        };

        const fields = [];
        const values = [];

        for (const [key, aliases] of Object.entries(map)) {
            const value = pick(aliases);
            if (value === undefined) continue;

            if (key === "phoneNumber") {
                let phone = String(value).trim();
                if (/^0\d{9}$/.test(phone)) phone = "+260" + phone.slice(1);
                if (!PHONE_PATTERN.test(phone)) {
                    return res.status(400).json({ error: "Phone number must be in format +260XXXXXXXXX" });
                }
                fields.push(`${columns[key]} = ?`);
                values.push(phone);
                continue;
            }

            fields.push(`${columns[key]} = ?`);
            values.push(value === "" ? null : value);
        }

        // classId, when provided, is the source of truth for grade/section —
        // same reasoning as createStudent: a class dropdown can't drift out of
        // sync with the classes table the way free-typed text could, and that
        // drift is exactly what made attendance registers come up empty for
        // students who were, in fact, enrolled in the class being taken.
        const classId = body.classId !== undefined ? body.classId : body.class_id;
        if (classId !== undefined) {
            if (classId === null || classId === "") {
                fields.push("class_id = ?", "grade = grade", "section = section");
                values.push(null);
            } else {
                const [[classRow]] = await pool.execute(
                    "SELECT grade_level, stream FROM classes WHERE id = ?",
                    [classId]
                );
                if (!classRow) {
                    return res.status(400).json({ error: "Selected class was not found." });
                }
                fields.push("class_id = ?", "grade = ?", "section = ?");
                values.push(classId, classRow.grade_level, classRow.stream || "");
            }
        }

        if (!fields.length) {
            return res.status(400).json({ error: "No fields provided to update" });
        }

        const schoolId = req.user?.school_id || 1;
        values.push(id, schoolId);
        const [result] = await pool.execute(
            `UPDATE students SET ${fields.join(", ")} WHERE id = ? AND school_id = ?`,
            values
        );

        if (result.affectedRows === 0) {
            const [[exists]] = await pool.execute("SELECT id FROM students WHERE id = ? AND school_id = ?", [id, schoolId]);
            if (!exists) return res.status(404).json({ error: "Student not found" });
            // affectedRows is 0 when the new values match the old ones — not an error
        }

        await _auditLog(req.user.sub, `Updated student record`, "student", id, Object.keys(req.body));

        const [rows] = await pool.execute(
            "SELECT * FROM students WHERE id = ? AND school_id = ? LIMIT 1", [id, schoolId]
        );
        res.json({ message: "Student updated successfully", student: toApiShape(rows[0]) });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "A student with this admission number already exists" });
        }
        console.error("updateStudent error:", err.message);
        res.status(500).json({ error: "Something went wrong while updating the student" });
    }
};

// ─── Delete (soft) ────────────────────────────────────────────────────────────
const deleteStudent = async (req, res) => {
    try {
        const schoolId = req.user?.school_id || 1;
        const [result] = await pool.execute(
            "UPDATE students SET status = 'Inactive' WHERE id = ? AND school_id = ?", [req.params.id, schoolId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Student not found" });
        }
        await _auditLog(req.user.sub, `Deactivated student record`, "student", req.params.id, {});
        res.json({ message: "Student record deactivated successfully" });
    } catch (err) {
        console.error("deleteStudent error:", err.message);
        res.status(500).json({ error: "Something went wrong while deleting the student" });
    }
};

// ─── Create or Reset Parent/Student User Account (Admin / Headmaster) ─────────
const createStudentAccount = async (req, res) => {
    const studentId = req.params.id;
    const schoolId = req.user?.school_id || 1;
    const customEmail = req.body.email ? req.body.email.trim().toLowerCase() : null;

    try {
        const [[student]] = await pool.execute(
            `SELECT s.*, u.email as user_email
             FROM students s
             LEFT JOIN users u ON u.id = s.user_id
             WHERE s.id = ? AND s.school_id = ? LIMIT 1`,
            [studentId, schoolId]
        );
        if (!student) return res.status(404).json({ error: "Student not found" });

        const recipientEmail = customEmail || (student.email && student.email.trim()) || (student.user_email) ||
            `${student.admission_number.toLowerCase().replace(/[^a-z0-9]/g, '')}@student.school.local`;
        const studentFullName = `${student.first_name} ${student.last_name}`.trim();

        const tempPassword = _generateTempPassword();
        const passwordHash = await _hashPassword(tempPassword);

        let userId = student.user_id;

        if (userId) {
            // Update existing user password and email
            await pool.execute(
                `UPDATE users SET email = ?, password_hash = ?, is_active = 1 WHERE id = ?`,
                [recipientEmail, passwordHash, userId]
            );
        } else {
            // Check if user with this email exists
            const [[existingUser]] = await pool.execute(
                "SELECT id FROM users WHERE email = ? LIMIT 1",
                [recipientEmail]
            );
            if (existingUser) {
                userId = existingUser.id;
                await pool.execute(
                    `UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?`,
                    [passwordHash, userId]
                );
            } else {
                const [newUser] = await pool.execute(
                    `INSERT INTO users (school_id, name, email, password_hash, role, is_active, email_verified)
                     VALUES (?, ?, ?, ?, 'user', 1, 1)`,
                    [schoolId, studentFullName, recipientEmail, passwordHash]
                );
                userId = newUser.insertId;
            }
            await pool.execute("UPDATE students SET user_id = ? WHERE id = ?", [userId, studentId]);
        }

        const loginUrl = (process.env.PUBLIC_APP_URL && process.env.PUBLIC_APP_URL.includes("Admin-Assist"))
            ? `${process.env.PUBLIC_APP_URL.replace(/\/$/, "")}/login.html`
            : "https://precious-chirwa.github.io/Admin-Assist/Frontend/Src/login.html";

        let emailSent = false;
        try {
            await sendNewAccountEmail({
                to: { name: student.parent_guardian_name || studentFullName, email: recipientEmail },
                tempPassword,
                loginUrl,
            });
            emailSent = true;
        } catch (mailErr) {
            console.warn("createStudentAccount email send note:", mailErr.message);
        }

        await _auditLog(req.user.sub, "CREATE_STUDENT_ACCOUNT", "student", studentId, {
            email: recipientEmail,
            userId,
            emailSent,
        });

        res.json({
            message: emailSent 
                ? "Parent/Student account created and login details sent via email."
                : "Parent/Student account created successfully.",
            userId,
            email: recipientEmail,
            tempPassword,
            emailSent,
        });
    } catch (err) {
        console.error("createStudentAccount error:", err.message);
        res.status(500).json({ error: "Failed to create student/parent account" });
    }
};

module.exports = {
    listStudents,
    getStudentById,
    getNextAdmissionNumber,
    generateAdmissionNumber,
    createStudent,
    updateStudent,
    deleteStudent,
    createStudentAccount,
};