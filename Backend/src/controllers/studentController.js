const pool = require("../config/db");

// ─── Translators: database snake_case ⇄ API camelCase ──────────────────────
const formatDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().split("T")[0];   // -> "2012-05-15"
};

const toApiShape = (row) => ({
    id: row.id,
    admissionNumber: row.admission_number,
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: formatDate(row.date_of_birth),
    gender: row.gender,
    nrcNumber: row.nrc_number,
    homeAddress: row.home_address,
    district: row.district,
    province: row.province,
    grade: row.grade,
    section: row.section,
    enrollmentDate: formatDate(row.enrollment_date),
    previousSchool: row.previous_school,
    parentGuardianName: row.parent_guardian_name,
    relationship: row.relationship,
    phoneNumber: row.phone_number,
    email: row.email,
    status: row.status,
    createdAt: row.created_at,
});

const REQUIRED_FIELDS = [
    "admissionNumber", "firstName", "lastName", "dateOfBirth", "gender",
    "province", "grade", "section", "enrollmentDate",
    "parentGuardianName", "relationship", "phoneNumber",
];

const PHONE_PATTERN = /^\+260\d{9}$/;

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

        const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const [countRows] = await pool.execute(
            `SELECT COUNT(*) AS total FROM students ${whereClause}`,
            params
        );
        const total = countRows[0].total;

        const [rows] = await pool.execute(
            `SELECT * FROM students ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.json({ students: rows.map(toApiShape), total, page, limit });
    } catch (err) {
        console.error("listStudents error:", err.message);
        res.status(500).json({ error: "Something went wrong while fetching students" });
    }
};

const getStudentById = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            "SELECT * FROM students WHERE id = ? LIMIT 1",
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: "Student not found" });

        res.json(toApiShape(rows[0]));
    } catch (err) {
        console.error("getStudentById error:", err.message);
        res.status(500).json({ error: "Something went wrong while fetching the student" });
    }
};

const createStudent = async (req, res) => {
    try {
        const body = req.body;

        const missing = REQUIRED_FIELDS.filter((field) => !body[field]);
        if (missing.length) {
            return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
        }

        if (!PHONE_PATTERN.test(body.phoneNumber)) {
            return res.status(400).json({ error: "Phone number must be in format +260XXXXXXXXX" });
        }

        const age = new Date().getFullYear() - new Date(body.dateOfBirth).getFullYear();
        if (age < 10) {
            return res.status(400).json({ error: "Student must be at least 10 years old" });
        }

        const [result] = await pool.execute(
            `INSERT INTO students (
                admission_number, first_name, last_name, date_of_birth, gender,
                nrc_number, home_address, district, province, grade, section,
                enrollment_date, previous_school, parent_guardian_name, relationship,
                phone_number, email, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                body.admissionNumber, body.firstName, body.lastName, body.dateOfBirth, body.gender,
                body.nrcNumber || null, body.homeAddress || null, body.district || null, body.province,
                body.grade, body.section, body.enrollmentDate, body.previousSchool || null,
                body.parentGuardianName, body.relationship, body.phoneNumber, body.email || null,
                body.status || "Active",
            ]
        );

        res.status(201).json({
            id: result.insertId,
            admissionNumber: body.admissionNumber,
            firstName: body.firstName,
            lastName: body.lastName,
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

const updateStudent = async (req, res) => {
    try {
        const body = req.body;

        const missing = REQUIRED_FIELDS.filter((field) => !body[field]);
        if (missing.length) {
            return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
        }

        if (!PHONE_PATTERN.test(body.phoneNumber)) {
            return res.status(400).json({ error: "Phone number must be in format +260XXXXXXXXX" });
        }

        const [result] = await pool.execute(
            `UPDATE students SET
                admission_number = ?, first_name = ?, last_name = ?, date_of_birth = ?, gender = ?,
                nrc_number = ?, home_address = ?, district = ?, province = ?, grade = ?, section = ?,
                enrollment_date = ?, previous_school = ?, parent_guardian_name = ?, relationship = ?,
                phone_number = ?, email = ?, status = ?
             WHERE id = ?`,
            [
                body.admissionNumber, body.firstName, body.lastName, body.dateOfBirth, body.gender,
                body.nrcNumber || null, body.homeAddress || null, body.district || null, body.province,
                body.grade, body.section, body.enrollmentDate, body.previousSchool || null,
                body.parentGuardianName, body.relationship, body.phoneNumber, body.email || null,
                body.status || "Active",
                req.params.id,
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Student not found" });
        }

        const [rows] = await pool.execute("SELECT * FROM students WHERE id = ? LIMIT 1", [req.params.id]);
        res.json({ message: "Student updated successfully", student: toApiShape(rows[0]) });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "A student with this admission number already exists" });
        }
        console.error("updateStudent error:", err.message);
        res.status(500).json({ error: "Something went wrong while updating the student" });
    }
};

const deleteStudent = async (req, res) => {
    try {
        const [result] = await pool.execute(
            "UPDATE students SET status = 'Inactive' WHERE id = ?",
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Student not found" });
        }

        res.json({ message: "Student marked as inactive" });
    } catch (err) {
        console.error("deleteStudent error:", err.message);
        res.status(500).json({ error: "Something went wrong while deleting the student" });
    }
};

module.exports = { listStudents, getStudentById, createStudent, updateStudent, deleteStudent };
