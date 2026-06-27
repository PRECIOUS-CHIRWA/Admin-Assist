/**
 * userController.js
 * Handles user profile management and role change requests.
 * All mutations are scoped to the authenticated user's own record.
 * Admins additionally have access to role request review.
 */

const crypto = require("crypto");
const { promisify } = require("util");
const pool = require("../config/db");

const scrypt = promisify(crypto.scrypt);

// ─── Password helpers (same algorithm as authController) ─────────────────────
const _hashPassword = async (password) => {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await scrypt(password, salt, 64);
    return `scrypt$${salt}$${hash.toString("hex")}`;
};

const _verifyPassword = async (password, stored) => {
    if (!stored || !stored.startsWith("scrypt$")) return false;
    const [, salt, original] = stored.split("$");
    const originalBuf = Buffer.from(original, "hex");
    const suppliedBuf = await scrypt(password, salt, originalBuf.length);
    return crypto.timingSafeEqual(originalBuf, suppliedBuf);
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = new Set(["admin", "staff", "user", "headmaster"]);

// ─── GET /api/users/profile ───────────────────────────────────────────────────
/**
 * getProfile
 * Returns the authenticated user's full profile from the database.
 * Refreshes the frontend's stale localStorage user data.
 */
const getProfile = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id,
                    name,
                    name AS fullName,
                    email,
                    role,
                    is_active,
                    last_login_at,
                    created_at
             FROM users
             WHERE id = ? LIMIT 1`,
            [req.user.sub]
        );
        if (!rows[0]) return res.status(404).json({ error: "User not found" });

        res.json({ user: rows[0] });
    } catch (err) {
        console.error("getProfile error:", err.message);
        res.status(500).json({ error: "Could not load profile" });
    }
};

// ─── PUT /api/users/profile ───────────────────────────────────────────────────
/**
 * updateProfile
 * Updates name and email for the authenticated user.
 * Rejects if the email is already taken by another account.
 */
const updateProfile = async (req, res) => {
    try {
        const { name, email } = req.body;
        const userId = req.user.sub;

        if (!name || !String(name).trim()) {
            return res.status(400).json({ error: "Name is required" });
        }
        if (!email || !EMAIL_PATTERN.test(String(email).trim())) {
            return res.status(400).json({ error: "A valid email address is required" });
        }

        const cleanName = String(name).trim();
        const cleanEmail = String(email).trim().toLowerCase();

        // Ensure email is not already used by a different account
        const [existing] = await pool.execute(
            "SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1",
            [cleanEmail, userId]
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: "That email address is already in use by another account" });
        }

        await pool.execute(
            "UPDATE users SET name = ?, email = ? WHERE id = ?",
            [cleanName, cleanEmail, userId]
        );

        res.json({
            message: "Profile updated successfully",
            user: { name: cleanName, fullName: cleanName, email: cleanEmail },
        });
    } catch (err) {
        console.error("updateProfile error:", err.message);
        res.status(500).json({ error: "Could not update profile" });
    }
};

// ─── PUT /api/users/profile/password ─────────────────────────────────────────
/**
 * changePassword
 * Verifies the current password, then sets a new one.
 * New password must be different and at least 8 characters.
 */
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.sub;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: "Current password and new password are required" });
        }
        if (String(newPassword).length < 8) {
            return res.status(400).json({ error: "New password must be at least 8 characters long" });
        }
        if (currentPassword === newPassword) {
            return res.status(400).json({ error: "New password must be different from your current password" });
        }

        const [rows] = await pool.execute(
            "SELECT password_hash FROM users WHERE id = ? LIMIT 1",
            [userId]
        );
        if (!rows[0]) return res.status(404).json({ error: "User not found" });

        const valid = await _verifyPassword(currentPassword, rows[0].password_hash);
        if (!valid) {
            return res.status(401).json({ error: "Current password is incorrect" });
        }

        const newHash = await _hashPassword(newPassword);
        await pool.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            [newHash, userId]
        );

        res.json({ message: "Password changed successfully. Please log in again with your new password." });
    } catch (err) {
        console.error("changePassword error:", err.message);
        res.status(500).json({ error: "Could not change password" });
    }
};

// ─── POST /api/users/profile/role-request ────────────────────────────────────
/**
 * requestRoleChange
 * Submits a role change request for admin approval.
 * Only one pending request is allowed at a time per user.
 */
const requestRoleChange = async (req, res) => {
    try {
        const { requestedRole, reason } = req.body;
        const userId = req.user.sub;

        if (!requestedRole || !VALID_ROLES.has(requestedRole)) {
            return res.status(400).json({ error: "Please select a valid role to request" });
        }

        // Get the user's current role
        const [rows] = await pool.execute(
            "SELECT role FROM users WHERE id = ? LIMIT 1", [userId]
        );
        if (!rows[0]) return res.status(404).json({ error: "User not found" });

        if (rows[0].role === requestedRole) {
            return res.status(400).json({ error: `You already have the ${requestedRole} role` });
        }

        // Block if a pending request already exists
        const [pending] = await pool.execute(
            `SELECT id FROM role_change_requests
             WHERE user_id = ? AND status = 'Pending' LIMIT 1`,
            [userId]
        );
        if (pending.length > 0) {
            return res.status(409).json({
                error: "You already have a pending role change request. Please wait for it to be reviewed before submitting another."
            });
        }

        await pool.execute(
            `INSERT INTO role_change_requests
                (user_id, current_role, requested_role, reason, status)
             VALUES (?, ?, ?, ?, 'Pending')`,
            [userId, rows[0].role, requestedRole, reason || null]
        );

        res.status(201).json({
            message: "Your role change request has been submitted. An administrator will review it shortly."
        });
    } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
            return res.status(503).json({
                error: "Role change requests are not yet configured on this server. Please contact an administrator directly."
            });
        }
        console.error("requestRoleChange error:", err.message);
        res.status(500).json({ error: "Could not submit role change request" });
    }
};

// ─── GET /api/users/profile/role-request ─────────────────────────────────────
/**
 * getMyRoleRequest
 * Returns the authenticated user's most recent role change request.
 */
const getMyRoleRequest = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, current_role, requested_role, reason,
                    status, requested_at, approved_at
             FROM role_change_requests
             WHERE user_id = ?
             ORDER BY requested_at DESC
             LIMIT 1`,
            [req.user.sub]
        );
        res.json(rows[0] || null);
    } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") return res.json(null);
        console.error("getMyRoleRequest error:", err.message);
        res.status(500).json({ error: "Could not load role request" });
    }
};

// ─── GET /api/users/role-requests (admin only) ────────────────────────────────
/**
 * getRoleRequests
 * Lists all role change requests for admin review.
 */
const getRoleRequests = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
                r.id,
                r.current_role,
                r.requested_role,
                r.reason,
                r.status,
                r.requested_at,
                r.approved_at,
                u.name  AS userName,
                u.email AS userEmail,
                a.name  AS reviewedByName
             FROM role_change_requests r
             JOIN  users u ON u.id = r.user_id
             LEFT JOIN users a ON a.id = r.approved_by
             ORDER BY
                FIELD(r.status, 'Pending', 'Approved', 'Rejected'),
                r.requested_at DESC`
        );
        res.json(rows);
    } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") return res.json([]);
        console.error("getRoleRequests error:", err.message);
        res.status(500).json({ error: "Could not load role requests" });
    }
};

// ─── PUT /api/users/role-requests/:id (admin only) ───────────────────────────
/**
 * reviewRoleRequest
 * Approve or reject a role change request.
 * On approval, the user's role is immediately updated.
 */
const reviewRoleRequest = async (req, res) => {
    try {
        const { action } = req.body;   // 'approve' | 'reject'
        const requestId = req.params.id;
        const adminId = req.user.sub;

        if (!["approve", "reject"].includes(action)) {
            return res.status(400).json({ error: "Action must be 'approve' or 'reject'" });
        }

        const [requests] = await pool.execute(
            `SELECT * FROM role_change_requests
             WHERE id = ? AND status = 'Pending' LIMIT 1`,
            [requestId]
        );
        if (!requests[0]) {
            return res.status(404).json({ error: "Request not found or already reviewed" });
        }

        const request = requests[0];
        const status = action === "approve" ? "Approved" : "Rejected";

        await pool.execute(
            `UPDATE role_change_requests
             SET status = ?, approved_by = ?, approved_at = NOW()
             WHERE id = ?`,
            [status, adminId, requestId]
        );

        if (action === "approve") {
            await pool.execute(
                "UPDATE users SET role = ? WHERE id = ?",
                [request.requested_role, request.user_id]
            );
        }

        res.json({ message: `Role change request ${status.toLowerCase()} successfully` });
    } catch (err) {
        console.error("reviewRoleRequest error:", err.message);
        res.status(500).json({ error: "Could not process role change request" });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    changePassword,
    requestRoleChange,
    getMyRoleRequest,
    getRoleRequests,
    reviewRoleRequest,
};