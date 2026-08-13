const crypto = require("crypto");
const { promisify } = require("util");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const { sendPasswordResetEmail } = require("../services/emailService");

const scrypt = promisify(crypto.scrypt);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = new Set(["admin", "staff", "user", "headmaster"]);
const DEFAULT_ROLE = "user";
const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;   // 15 minutes

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const isValidPassword = (pw) => typeof pw === "string" && pw.length >= 8;

// ─── Password helpers ──────────────
const hashPassword = async (password) => {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await scrypt(password, salt, 64);
    return `scrypt$${salt}$${hash.toString("hex")}`;
};

const verifyPassword = async (password, stored) => {
    if (!stored || !stored.startsWith("scrypt$")) return false;
    const [, salt, original] = stored.split("$");
    const originalBuf = Buffer.from(original, "hex");
    const suppliedBuf = await scrypt(password, salt, originalBuf.length);
    return crypto.timingSafeEqual(originalBuf, suppliedBuf);
};

// ─── Token helpers ───────────────
const createTokens = (user) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET environment variable is not set");

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = jwt.sign(payload, secret, { expiresIn: ACCESS_TTL });
    const refreshToken = jwt.sign({ sub: user.id }, secret, { expiresIn: REFRESH_TTL });

    return { accessToken, refreshToken };
};

// Store a SHA-256 hash of the refresh token — never the raw value
const hashToken = (token) =>
    crypto.createHash("sha256").update(token).digest("hex");

const cookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
});

// ─── Signup ─────────────────────
const signup = async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const email = normalizeEmail(req.body.email);
        const password = req.body.password;
        // Role is ALWAYS forced to DEFAULT_ROLE ('user') on self-registration.
        // Client-supplied role is intentionally ignored — privilege escalation via signup is not allowed.
        // Users who need staff/headmaster/admin access should request it via:
        //   POST /api/users/profile/role-request → admin review via GET/PUT /api/users/role-requests
        const role = DEFAULT_ROLE;

        if (!name || !email || !password)
            return res.status(400).json({ error: "Name, email, and password are required" });
        if (!EMAIL_PATTERN.test(email))
            return res.status(400).json({ error: "Please provide a valid email address" });
        if (!isValidPassword(password))
            return res.status(400).json({ error: "Password must be at least 8 characters long" });

        const [existing] = await pool.execute(
            "SELECT id FROM users WHERE email = ? LIMIT 1", [email]
        );
        if (existing.length > 0)
            return res.status(409).json({ error: "A user with this email already exists" });

        const passwordHash = await hashPassword(password);
        const [result] = await pool.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
            [name, email, passwordHash, role]
        );

        res.status(201).json({
            message: "User signed up successfully",
            user: { id: result.insertId, name, email, role },
        });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY")
            return res.status(409).json({ error: "A user with this email already exists" });
        console.error("Signup error:", err.message);
        res.status(500).json({ error: "Something went wrong during signup" });
    }
};

// ─── Login ──────────────────────
const login = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = req.body.password;

        if (!email || !password)
            return res.status(400).json({ error: "Email and password are required" });

        const [users] = await pool.execute(
            `SELECT id, name, email, password_hash, role,
                    is_active, failed_attempts, locked_until
             FROM users WHERE email = ? LIMIT 1`,
            [email]
        );

        const user = users[0];

        // Use the same error message whether the user exists or not
        // to avoid revealing which emails are registered (user enumeration)
        if (!user)
            return res.status(401).json({ error: "Invalid email or password" });

        //  Reject disabled accounts
        if (!user.is_active)
            return res.status(403).json({ error: "This account has been deactivated. Please contact an administrator." });

        //  Check lockout
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const minutesLeft = Math.ceil(
                (new Date(user.locked_until) - new Date()) / 60000
            );
            return res.status(423).json({
                error: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
            });
        }

        const passwordValid = await verifyPassword(password, user.password_hash);

        //  Wrong password — increment failed attempts, lock if threshold reached
        if (!passwordValid) {
            const attempts = user.failed_attempts + 1;
            const lockedUntil = attempts >= MAX_ATTEMPTS
                ? new Date(Date.now() + LOCKOUT_MS)
                : null;

            await pool.execute(
                "UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?",
                [attempts, lockedUntil, user.id]
            );

            if (lockedUntil) {
                return res.status(423).json({
                    error: `Too many failed attempts. Account locked for 15 minutes.`,
                });
            }
            return res.status(401).json({ error: "Invalid email or password" });
        }

        //  Successful login — reset lockout counters and record timestamp
        await pool.execute(
            "UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?",
            [user.id]
        );

        const { accessToken, refreshToken } = createTokens(user);

        //  Persist hashed refresh token so we can revoke it on logout
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await pool.execute(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
            [user.id, hashToken(refreshToken), expiresAt]
        );

        res.cookie("refreshToken", refreshToken, cookieOptions());

        res.status(200).json({
            message: "User logged in successfully",
            accessToken,
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
    } catch (err) {
        console.error("Login error:", err.message);
        res.status(500).json({ error: "Something went wrong during login" });
    }
};

// ─── Get current user ───────────────────
const getMe = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            "SELECT id, name as fullName, email, role, created_at FROM users WHERE id = ? LIMIT 1",
            [req.user.sub]
        );
        if (!rows[0]) return res.status(404).json({ error: "User not found" });
        res.json({ user: rows[0] });
    } catch (err) {
        console.error("getMe error:", err.message);
        res.status(500).json({ error: "Something went wrong" });
    }
};

// ─── Logout ───────────────────────
const logout = async (req, res) => {
    try {
        const raw = req.cookies?.refreshToken;

        if (raw) {
            const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
            await pool.execute(
                "DELETE FROM refresh_tokens WHERE token_hash = ?",
                [tokenHash]
            );
        }

        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
        });

        res.json({ message: "Logged out successfully" });
    } catch (err) {
        console.error("Logout error:", err.message);
        res.status(500).json({ error: "Something went wrong during logout" });
    }
};

// ─── Forgot Password ──────────────
// POST /api/auth/forgot-password  { email }
// Always responds 200 to prevent email enumeration.
const forgotPassword = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        if (!email) return res.status(400).json({ error: "Email is required" });

        const [[user]] = await pool.execute(
            "SELECT id, name, email FROM users WHERE email = ? AND is_active = 1 LIMIT 1",
            [email]
        );

        // Respond identically whether or not the email exists
        const safeReply = { message: "If that email is registered you will receive a reset link shortly" };

        if (!user) return res.json(safeReply);

        // Generate a secure token
        const rawToken  = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Invalidate any existing reset tokens for this user
        await pool.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", [user.id]);

        await pool.execute(
            "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
            [user.id, tokenHash, expiresAt]
        );

        const appUrl  = process.env.PUBLIC_APP_URL || "https://precious-chirwa.github.io/Admin-Assist/Frontend/Src";
        const resetUrl = `${appUrl}/reset-password.html?token=${rawToken}`;

        await sendPasswordResetEmail({ to: { name: user.name, email: user.email }, resetUrl }).catch(
            (err) => console.warn("sendPasswordResetEmail failed (non-fatal):", err.message)
        );

        res.json(safeReply);
    } catch (err) {
        console.error("forgotPassword error:", err.message);
        res.status(500).json({ error: "Something went wrong" });
    }
};

// ─── Reset Password ───────────────
// POST /api/auth/reset-password  { token, newPassword }
const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ error: "Token and new password are required" });
        if (!isValidPassword(newPassword)) return res.status(400).json({ error: "Password must be at least 8 characters" });

        const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");
        const [[row]] = await pool.execute(
            "SELECT * FROM password_reset_tokens WHERE token_hash = ? LIMIT 1",
            [tokenHash]
        );

        if (!row) return res.status(400).json({ error: "Invalid or expired reset link" });
        if (new Date(row.expires_at) < new Date()) {
            await pool.execute("DELETE FROM password_reset_tokens WHERE id = ?", [row.id]);
            return res.status(400).json({ error: "Reset link has expired — please request a new one" });
        }

        const passwordHash = await hashPassword(newPassword);
        await pool.execute("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, row.user_id]);
        await pool.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", [row.user_id]);
        // Also revoke all refresh tokens so hijacked sessions are invalidated
        await pool.execute("DELETE FROM refresh_tokens WHERE user_id = ?", [row.user_id]);

        res.json({ message: "Password reset successfully — you can now log in with your new password" });
    } catch (err) {
        console.error("resetPassword error:", err.message);
        res.status(500).json({ error: "Something went wrong" });
    }
};

module.exports = { signup, login, getMe, logout, forgotPassword, resetPassword };