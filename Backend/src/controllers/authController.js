const crypto = require("crypto");
const { promisify } = require("util");
const jwt = require("jsonwebtoken");          // NEW
const pool = require("../config/db");

const scrypt = promisify(crypto.scrypt);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = new Set(["admin", "staff", "user", "headmaster"]);
const DEFAULT_ROLE = "user";

// NEW: Short-lived access token + longer refresh token
const ACCESS_TTL  = "15m";
const REFRESH_TTL = "7d";

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const isValidPassword = (password) =>
    typeof password === "string" && password.length >= 8;

const hashPassword = async (password) => {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await scrypt(password, salt, 64);
    return `scrypt$${salt}$${hash.toString("hex")}`;
};

const verifyPassword = async (password, storedPasswordHash) => {
    if (!storedPasswordHash || !storedPasswordHash.startsWith("scrypt$")) {
        return false;
    }
    const [, salt, originalHash] = storedPasswordHash.split("$");
    const originalHashBuffer = Buffer.from(originalHash, "hex");
    const suppliedHashBuffer = await scrypt(password, salt, originalHashBuffer.length);
    return crypto.timingSafeEqual(originalHashBuffer, suppliedHashBuffer);
};

// NEW: Returns both an access token and a refresh token
const createTokens = (user) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET environment variable is not set");

    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken  = jwt.sign(payload, secret, { expiresIn: ACCESS_TTL });
    const refreshToken = jwt.sign({ sub: user.id }, secret, { expiresIn: REFRESH_TTL });

    return { accessToken, refreshToken };
};

// Signup handler
const signup = async (req, res) => {
    try {
        const name     = String(req.body.name || "").trim();
        const email    = normalizeEmail(req.body.email);
        const password = req.body.password;
        const role     = String(req.body.role || DEFAULT_ROLE).trim().toLowerCase();

        if (!name || !email || !password) {
            return res.status(400).json({ error: "Name, email, and password are required" });
        }
        if (!EMAIL_PATTERN.test(email)) {
            return res.status(400).json({ error: "Please provide a valid email address" });
        }
        if (!isValidPassword(password)) {
            return res.status(400).json({ error: "Password must be at least 8 characters long" });
        }
        if (!ALLOWED_ROLES.has(role)) {
            return res.status(400).json({ error: "Invalid user role" });
        }

        const [existingUsers] = await pool.execute(
            "SELECT id FROM users WHERE email = ? LIMIT 1",
            [email]
        );
        if (existingUsers.length > 0) {
            return res.status(409).json({ error: "A user with this email already exists" });
        }

        const passwordHash = await hashPassword(password);
        const [result] = await pool.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
            [name, email, passwordHash, role]
        );

        res.status(201).json({
            message: "User signed up successfully",
            user: { id: result.insertId, name, email, role }
        });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "A user with this email already exists" });
        }
        console.error("Signup error:", error.message);
        res.status(500).json({ error: "Something went wrong during signup" });
    }
};

// Login handler
const login = async (req, res) => {
    try {
        const email    = normalizeEmail(req.body.email);
        const password = req.body.password;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const [users] = await pool.execute(
            "SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1",
            [email]
        );

        const user = users[0];

        if (!user || !(await verifyPassword(password, user.password_hash))) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        // NEW: Issue both tokens
        const { accessToken, refreshToken } = createTokens(user);

        // NEW: Refresh token goes in an httpOnly cookie — JS on the page can't read it
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge:   7 * 24 * 60 * 60 * 1000   // 7 days in ms
        });

        res.status(200).json({
            message:     "User logged in successfully",
            accessToken,                          // Frontend stores this in memory
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error("Login error:", error.message);
        res.status(500).json({ error: "Something went wrong during login" });
    }
};

// NEW: Return current user from token
const getMe = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            "SELECT id, name, email, role, created_at FROM users WHERE id = ? LIMIT 1",
            [req.user.sub]
        );
        if (!rows[0]) return res.status(404).json({ error: "User not found" });
        res.json({ user: rows[0] });
    } catch (error) {
        console.error("getMe error:", error.message);
        res.status(500).json({ error: "Something went wrong" });
    }
};

// NEW: Clear the refresh token cookie on logout
const logout = (req, res) => {
    res.clearCookie("refreshToken", {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: "strict",
    });
    res.json({ message: "Logged out successfully" });
};

module.exports = { signup, login, getMe, logout };