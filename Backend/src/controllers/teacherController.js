/**
 * teacherController.js
 * Full CRUD for teaching staff (role = ''staff'' or ''headmaster'').
 * Replaces the ad-hoc /api/search/users?role=teacher and inline GET /teachers.
 *
 * Routes (mounted at /api/teachers):
 *   GET    /            listTeachers      (admin, headmaster, staff)
 *   GET    /:id         getTeacherById    (admin, headmaster)
 *   POST   /            createTeacher     (admin, headmaster)
 *   PUT    /:id         updateTeacher     (admin, headmaster)
 *   PATCH  /:id/status  toggleStatus      (admin, headmaster)
 *   DELETE /:id         deleteTeacher     (admin)
 */

"use strict";

const crypto = require("crypto");
const { promisify } = require("util");
const pool = require("../config/db");
const { sendNewAccountEmail } = require("../services/emailService");

const scrypt = promisify(crypto.scrypt);

const _hashPassword = async (password) => {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await scrypt(password, salt, 64);
    return `scrypt$${salt}$${hash.toString("hex")}`;
};

const _generateTempPassword = () => {
    // 12 chars: letters + digits (no ambiguous chars)
    return crypto.randomBytes(9).toString("base64url").slice(0, 12);
};

const _writeAuditLog = async (actorId, action, entityType, entityId, details) => {
    try {
        await pool.execute(
            "INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)",
            [actorId, action, entityType, entityId, details ? JSON.stringify(details) : null]
        );
    } catch { /* non-fatal */ }
};

// ─── GET /api/teachers ────────────────────────────────────────────────────────
const listTeachers = async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page  || "1", 10));
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || "10", 10)));
        const offset = (page - 1) * limit;
        const search = req.query.search ? `%${req.query.search}%` : null;
        const status = req.query.status; // "active" | "inactive" | ""

        const conditions = ["u.role IN (''staff'', ''headmaster'')"];
        const params     = [];

        if (search) {
            conditions.push("(u.name LIKE ? OR u.email LIKE ?)");
            params.push(search, search);
        }
        if (status === "active")   { conditions.push("u.is_active = 1"); }
        if (status === "inactive") { conditions.push("u.is_active = 0"); }

        const where = "WHERE " + conditions.join(" AND ");

        const [[{ total }]] = await pool.execute(
            `SELECT COUNT(*) AS total FROM users u ${where}`,
            [...params]
        );

        const [teachers] = await pool.execute(
            `SELECT u.id, u.name, u.email, u.role, u.is_active, u.last_login_at, u.created_at,
                    GROUP_CONCAT(DISTINCT sub.subject_name ORDER BY sub.subject_name SEPARATOR '', '') AS subjects
             FROM users u
             LEFT JOIN teacher_subjects ts ON ts.teacher_id = u.id
             LEFT JOIN subjects sub ON sub.id = ts.subject_id
             ${where}
             GROUP BY u.id
             ORDER BY u.name ASC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.json({ teachers, total, page, limit });
    } catch (err) {
        console.error("listTeachers error:", err.message);
        res.status(500).json({ error: "Could not load teachers" });
    }
};

// ─── GET /api/teachers/:id ────────────────────────────────────────────────────
const getTeacherById = async (req, res) => {
    try {
        const [[teacher]] = await pool.execute(
            `SELECT id, name, email, role, is_active, last_login_at, created_at
             FROM users WHERE id = ? AND role IN (''staff'', ''headmaster'') LIMIT 1`,
            [req.params.id]
        );
        if (!teacher) return res.status(404).json({ error: "Teacher not found" });

        // Get subject assignments with class names
        const [assignments] = await pool.execute(
            `SELECT ts.id, ts.subject_id, sub.subject_code, sub.subject_name,
                    ts.class_id, CONCAT(c.grade_level, IF(c.stream != '''', CONCAT('' '', c.stream), '''')) AS class_name,
                    ts.academic_year_id, ay.year_label
             FROM teacher_subjects ts
             JOIN subjects sub ON sub.id = ts.subject_id
             JOIN classes   c   ON c.id  = ts.class_id
             JOIN academic_years ay ON ay.id = ts.academic_year_id
             WHERE ts.teacher_id = ?
             ORDER BY ay.year_label DESC, sub.subject_name ASC`,
            [req.params.id]
        );

        res.json({ teacher, assignments });
    } catch (err) {
        console.error("getTeacherById error:", err.message);
        res.status(500).json({ error: "Could not load teacher" });
    }
};

// ─── POST /api/teachers ───────────────────────────────────────────────────────
const createTeacher = async (req, res) => {
    const { name, email, role = "staff" } = req.body;

    if (!name || !email) return res.status(400).json({ error: "Name and email are required" });
    if (!["staff", "headmaster"].includes(role))
        return res.status(400).json({ error: "Role must be ''staff'' or ''headmaster''" });

    try {
        // Check duplicate email
        const [[existing]] = await pool.execute(
            "SELECT id FROM users WHERE email = ? LIMIT 1",
            [email.trim().toLowerCase()]
        );
        if (existing) return res.status(409).json({ error: "Email already registered" });

        const tempPassword   = _generateTempPassword();
        const passwordHash   = await _hashPassword(tempPassword);

        const [result] = await pool.execute(
            "INSERT INTO users (name, email, password_hash, role, is_active, email_verified) VALUES (?, ?, ?, ?, 1, 1)",
            [name.trim(), email.trim().toLowerCase(), passwordHash, role]
        );
        const newId = result.insertId;

        // Send welcome email (non-fatal — log but don''t fail the request)
        const loginUrl = process.env.PUBLIC_APP_URL
            ? `${process.env.PUBLIC_APP_URL}/login.html`
            : "https://precious-chirwa.github.io/Admin-Assist/Frontend/Src/login.html";

        try {
            await sendNewAccountEmail({ to: { name: name.trim(), email: email.trim().toLowerCase() }, tempPassword, loginUrl });
        } catch (emailErr) {
            console.warn("sendNewAccountEmail failed (non-fatal):", emailErr.message);
        }

        await _writeAuditLog(req.user.sub, "CREATE_TEACHER", "user", newId, { name, email, role });

        res.status(201).json({
            message: "Teacher account created successfully",
            teacher: { id: newId, name, email, role },
            tempPassword, // returned so admin can note it; email also sent
        });
    } catch (err) {
        console.error("createTeacher error:", err.message);
        res.status(500).json({ error: "Could not create teacher" });
    }
};

// ─── PUT /api/teachers/:id ────────────────────────────────────────────────────
const updateTeacher = async (req, res) => {
    const { id } = req.params;
    const { name, email, role } = req.body;

    try {
        const [[teacher]] = await pool.execute(
            "SELECT id FROM users WHERE id = ? AND role IN (''staff'', ''headmaster'') LIMIT 1",
            [id]
        );
        if (!teacher) return res.status(404).json({ error: "Teacher not found" });

        const fields = [];
        const values = [];

        if (name)  { fields.push("name = ?");  values.push(name.trim()); }
        if (email) { fields.push("email = ?"); values.push(email.trim().toLowerCase()); }
        if (role && ["staff", "headmaster"].includes(role)) {
            fields.push("role = ?"); values.push(role);
        }

        if (!fields.length) return res.status(400).json({ error: "No valid fields to update" });

        values.push(id);
        await pool.execute(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
        await _writeAuditLog(req.user.sub, "UPDATE_TEACHER", "user", Number(id), { name, email, role });

        res.json({ message: "Teacher updated successfully" });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY")
            return res.status(409).json({ error: "Email already in use by another account" });
        console.error("updateTeacher error:", err.message);
        res.status(500).json({ error: "Could not update teacher" });
    }
};

// ─── PATCH /api/teachers/:id/status ──────────────────────────────────────────
const toggleTeacherStatus = async (req, res) => {
    const { id } = req.params;

    try {
        const [[teacher]] = await pool.execute(
            "SELECT id, name, is_active FROM users WHERE id = ? AND role IN (''staff'', ''headmaster'') LIMIT 1",
            [id]
        );
        if (!teacher) return res.status(404).json({ error: "Teacher not found" });

        const newStatus = teacher.is_active ? 0 : 1;
        await pool.execute("UPDATE users SET is_active = ? WHERE id = ?", [newStatus, id]);
        await _writeAuditLog(req.user.sub,
            newStatus ? "ACTIVATE_TEACHER" : "DEACTIVATE_TEACHER",
            "user", Number(id), { name: teacher.name });

        res.json({
            message: `Teacher ${newStatus ? "activated" : "deactivated"} successfully`,
            is_active: newStatus,
        });
    } catch (err) {
        console.error("toggleTeacherStatus error:", err.message);
        res.status(500).json({ error: "Could not update teacher status" });
    }
};

// ─── DELETE /api/teachers/:id (soft delete) ───────────────────────────────────
const deleteTeacher = async (req, res) => {
    const { id } = req.params;

    try {
        const [[teacher]] = await pool.execute(
            "SELECT id, name FROM users WHERE id = ? AND role IN (''staff'', ''headmaster'') LIMIT 1",
            [id]
        );
        if (!teacher) return res.status(404).json({ error: "Teacher not found" });

        // Soft delete — set is_active = 0 (hard delete would break FK history)
        await pool.execute("UPDATE users SET is_active = 0 WHERE id = ?", [id]);
        await _writeAuditLog(req.user.sub, "DELETE_TEACHER", "user", Number(id), { name: teacher.name });

        res.json({ message: "Teacher deactivated successfully" });
    } catch (err) {
        console.error("deleteTeacher error:", err.message);
        res.status(500).json({ error: "Could not delete teacher" });
    }
};

module.exports = { listTeachers, getTeacherById, createTeacher, updateTeacher, toggleTeacherStatus, deleteTeacher };
