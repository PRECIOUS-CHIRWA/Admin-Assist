const pool = require("../config/db");

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

const toApiShape = (row) => ({
    id: row.id,
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
});

const REQUIRED_FIELDS = [
    "admissionNumber", "firstName", "lastName", "dateOfBirth", "gender",
    "province", "grade", "section", "enrollmentDate",
    "parentGuardianName", "relationship", "phoneNumber",
];

const PHONE_PATTERN = /^\+260\d{9}$/;

// ─── List students ────────────────────────────────────────────────────────────
const listStudents = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
        const offset = (page - 1) * limit;
        const search = String(req.query.search || "").trim();
        const grade = String(req.query.grade || "").trim();
        const status = String(req.query.status || "").trim();

        const conditions = [];
        const params = [];

        if (search) {
            const term = `%${search}%`;
            conditions.push("(first_name LIKE ? OR last_name LIKE ? OR admission_number LIKE ? OR grade LIKE ?)");
            params.push(term, term, term, term);
        }
        if (grade) { conditions.push("grade = ?"); params.push(grade); }
        if (status) { conditions.push("status = ?"); params.push(status); }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const [countRows] = await pool.execute(
            `SELECT COUNT(*) AS total FROM students ${where}`, params
        );
        const total = countRows[0].total;

        const [rows] = await pool.execute(
            `SELECT s.*,
                    CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) AS class_name
             FROM students s
             LEFT JOIN classes c ON c.id = s.class_id
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
        const [rows] = await pool.execute(
            "SELECT * FROM students WHERE id = ? LIMIT 1", [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: "Student not found" });
        res.json(toApiShape(rows[0]));
    } catch (err) {
        console.error("getStudentById error:", err.message);
        res.status(500).json({ error: "Something went wrong while fetching the student" });
    }
};

// ─── Create student / Enroll ──────────────────────────────────────────────────
const createStudent = async (req, res) => {
    try {
        const body = req.body || {};

        // Normalize input from both camelCase and snake_case (enroll-student.js payload)
        const admissionNumber = String(body.admissionNumber || body.admission_number || "").trim();
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

        // Check required fields
        const missing = [];
        if (!admissionNumber) missing.push("admissionNumber");
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
        // grade/section are still stored (existing search/filter/display code
        // reads them), but they're now always derived from a real class row,
        // so they can never drift out of sync with it the way they used to —
        // that drift is exactly what made attendance registers come up empty
        // for classes that genuinely had enrolled students.
        const [[classRow]] = await pool.execute(
            "SELECT id, grade_level, stream FROM classes WHERE id = ?",
            [classId]
        );
        if (!classRow) {
            return res.status(400).json({ error: "Selected class was not found. Refresh and pick a class again." });
        }
        const grade = classRow.grade_level;
        const section = classRow.stream || "";

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

        const [result] = await pool.execute(
            `INSERT INTO students (
                admission_number, first_name, last_name, date_of_birth, gender,
                nrc_number, home_address, district, province, grade, section, class_id,
                enrollment_date, previous_school, parent_guardian_name, relationship,
                phone_number, email, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                admissionNumber, firstName, lastName,
                dateOfBirth, normalizedGender,
                nrcNumber, homeAddress,
                district, province,
                grade, section, classId, enrollmentDate,
                previousSchool, parentGuardianName,
                normalizedRelationship, phoneNumber, email,
                status,
            ]
        );

        // Audit log
        await _auditLog(
            req.user.sub,
            `Enrolled student ${firstName} ${lastName} (${admissionNumber})`,
            "student", result.insertId,
            { admissionNumber }
        );

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

        values.push(id);
        const [result] = await pool.execute(
            `UPDATE students SET ${fields.join(", ")} WHERE id = ?`,
            values
        );

        if (result.affectedRows === 0) {
            const [[exists]] = await pool.execute("SELECT id FROM students WHERE id = ?", [id]);
            if (!exists) return res.status(404).json({ error: "Student not found" });
            // affectedRows is 0 when the new values match the old ones — not an error
        }

        await _auditLog(req.user.sub, `Updated student record`, "student", id, Object.keys(req.body));

        const [rows] = await pool.execute(
            "SELECT * FROM students WHERE id = ? LIMIT 1", [id]
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
        const [result] = await pool.execute(
            "UPDATE students SET status = 'Inactive' WHERE id = ?", [req.params.id]
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

module.exports = {
    listStudents, getStudentById, createStudent,
    updateStudent, deleteStudent,
};