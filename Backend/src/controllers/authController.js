const crypto     = require("crypto");
const { promisify } = require("util");
const jwt        = require("jsonwebtoken");
const pool       = require("../config/db");
const { sendVerificationEmail } = require("../services/emailService");

const scrypt = promisify(crypto.scrypt);
const EMAIL_PATTERN  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES  = new Set(["admin", "staff", "user", "headmaster"]);
const DEFAULT_ROLE   = "user";
const ACCESS_TTL     = "15m";
const REFRESH_TTL    = "7d";
const MAX_ATTEMPTS   = 5;
const LOCKOUT_MS     = 15 * 60 * 1000;   // 15 minutes
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const normalizeEmail  = (email) => String(email || "").trim().toLowerCase();
const isValidPassword = (pw)    => typeof pw === "string" && pw.length >= 8;

// ─── Password helpers ──────────────
const hashPassword = async (password) => {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await scrypt(password, salt, 64);
    return `scrypt$${salt}$${hash.toString("hex")}`;
};

const verifyPassword = async (password, stored) => {
    if (!stored || !stored.startsWith("scrypt$")) return false;
    const [, salt, original] = stored.split("$");
    const originalBuf  = Buffer.from(original, "hex");
    const suppliedBuf  = await scrypt(password, salt, originalBuf.length);
    return crypto.timingSafeEqual(originalBuf, suppliedBuf);
};

// ─── Token helpers ───────────────
const createTokens = (user) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET environment variable is not set");

    const payload      = { sub: user.id, email: user.email, role: user.role };
    const accessToken  = jwt.sign(payload, secret, { expiresIn: ACCESS_TTL });
    const refreshToken = jwt.sign({ sub: user.id }, secret, { expiresIn: REFRESH_TTL });

    return { accessToken, refreshToken };
};

// Store a SHA-256 hash of the refresh token — never the raw value
const hashToken = (token) =>
    crypto.createHash("sha256").update(token).digest("hex");

const publicAppUrl = () =>
    String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || "http://localhost:5500")
        .trim()
        .replace(/\/+$/, "");

const buildVerificationUrl = (email, token) => {
    const params = new URLSearchParams({ email, token });
    return `${publicAppUrl()}/verify-email.html?${params.toString()}`;
};

const createVerificationToken = async (userId) => {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

    await pool.execute("DELETE FROM email_verification_tokens WHERE user_id = ?", [userId]);
    await pool.execute(
        "INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
        [userId, tokenHash, expiresAt]
    );

    return token;
};

const sendAccountVerification = async (user) => {
    const token = await createVerificationToken(user.id);
    await sendVerificationEmail({
        to: { email: user.email, name: user.name },
        verificationUrl: buildVerificationUrl(user.email, token),
    });
};

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
        const role = String(req.body.role || DEFAULT_ROLE).trim().toLowerCase();

        if (!name || !email || !password)
            return res.status(400).json({ error: "Name, email, and password are required" });
        if (!EMAIL_PATTERN.test(email))
            return res.status(400).json({ error: "Please provide a valid email address" });
        if (!isValidPassword(password))
            return res.status(400).json({ error: "Password must be at least 8 characters long" });
        if (!ALLOWED_ROLES.has(role))
            return res.status(400).json({ error: "Invalid user role" });

        const [existing] = await pool.execute(
            "SELECT id FROM users WHERE email = ? LIMIT 1", [email]
        );
        if (existing.length > 0)
            return res.status(409).json({ error: "A user with this email already exists" });

        const passwordHash = await hashPassword(password);
        const [result] = await pool.execute(
            "INSERT INTO users (name, email, password_hash, role, email_verified) VALUES (?, ?, ?, ?, 0)",
            [name, email, passwordHash, role]
        );
        const user = { id: result.insertId, name, email, role };

        let verificationEmailSent = false;
        try {
            await sendAccountVerification(user);
            verificationEmailSent = true;
        } catch (emailErr) {
            console.error("Verification email error:", emailErr.message);
        }

        res.status(201).json({
            message: verificationEmailSent
                ? "Account created. Check your email to verify your account before logging in."
                : "Account created, but the verification email could not be sent. Please request a new verification link.",
            verificationRequired: true,
            verificationEmailSent,
            user,
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
                    is_active, email_verified, failed_attempts, locked_until
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

        if (!user.email_verified)
            return res.status(403).json({ error: "Please verify your email address before logging in." });

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
            const attempts    = user.failed_attempts + 1;
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
            message:     "User logged in successfully",
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
            "SELECT id, name, email, role, email_verified, created_at FROM users WHERE id = ? LIMIT 1",
            [req.user.sub]
        );
        if (!rows[0]) return res.status(404).json({ error: "User not found" });
        res.json({ user: rows[0] });
    } catch (err) {
        console.error("getMe error:", err.message);
        res.status(500).json({ error: "Something went wrong" });
    }
};

// ─── Verify Email ─────────────────
const verifyEmail = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const token = String(req.body.token || "").trim();

        if (!email || !token)
            return res.status(400).json({ error: "Email and verification token are required" });

        const [rows] = await pool.execute(
            `SELECT evt.id, evt.user_id, evt.expires_at, u.email_verified
             FROM email_verification_tokens evt
             INNER JOIN users u ON u.id = evt.user_id
             WHERE u.email = ? AND evt.token_hash = ?
             LIMIT 1`,
            [email, hashToken(token)]
        );

        const verification = rows[0];
        if (!verification)
            return res.status(400).json({ error: "Invalid verification link" });

        if (new Date(verification.expires_at) <= new Date()) {
            await pool.execute("DELETE FROM email_verification_tokens WHERE id = ?", [verification.id]);
            return res.status(410).json({ error: "Verification link expired. Please request a new one." });
        }

        if (!verification.email_verified) {
            await pool.execute(
                "UPDATE users SET email_verified = 1, email_verified_at = NOW() WHERE id = ?",
                [verification.user_id]
            );
        }
        await pool.execute("DELETE FROM email_verification_tokens WHERE user_id = ?", [verification.user_id]);

        res.json({ message: "Email verified successfully. You can now log in." });
    } catch (err) {
        console.error("Verify email error:", err.message);
        res.status(500).json({ error: "Something went wrong during email verification" });
    }
};

// ─── Resend Verification ──────────
const resendVerification = async (req, res) => {
    const genericMessage = "If that account exists and still needs verification, a new link has been sent.";

    try {
        const email = normalizeEmail(req.body.email);
        if (!email || !EMAIL_PATTERN.test(email))
            return res.status(400).json({ error: "Please provide a valid email address" });

        const [users] = await pool.execute(
            "SELECT id, name, email, email_verified FROM users WHERE email = ? LIMIT 1",
            [email]
        );

        const user = users[0];
        if (!user || user.email_verified) {
            return res.json({ message: genericMessage });
        }

        await sendAccountVerification(user);
        res.json({ message: genericMessage });
    } catch (err) {
        console.error("Resend verification error:", err.message);
        res.status(500).json({ error: "Something went wrong while resending verification email" });
    }
};

// ─── Logout ───────────────────────
const logout = async (req, res) => {
    try {
        const userId = req.user?.sub;  // From JWT token
        const raw = req.cookies?.refreshToken;

        // Option 1: Delete just this device's refresh token
        if (raw) {
            await pool.execute(
                "DELETE FROM refresh_tokens WHERE token_hash = ? AND user_id = ?",
                [hashToken(raw), userId]
            );
        }

        // Option 2 (more secure): Delete ALL refresh tokens for this user
        // (forces logout from all devices)
        // Uncomment to enable "logout from all devices":
        // if (userId) {
        //     await pool.execute("DELETE FROM refresh_tokens WHERE user_id = ?", [userId]);
        // }

        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production",
            sameSite: "strict",
        });

        res.json({ 
            message: "Logged out successfully",
            status: "ok"
        });
    } catch (err) {
        console.error("Logout error:", err.message);
        res.status(500).json({ error: "Something went wrong during logout" });
    }
};

module.exports = { signup, login, getMe, logout, verifyEmail, resendVerification };
