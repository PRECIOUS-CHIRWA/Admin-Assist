const crypto = require("crypto");
const { promisify } = require("util");
const pool = require("../config/db");

const scrypt = promisify(crypto.scrypt);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = new Set(["admin", "staff", "user"]);
const DEFAULT_ROLE = "user";
const TOKEN_TTL_SECONDS = 60 * 60 * 24;

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const isValidPassword = (password) => (
    typeof password === "string" && password.length >= 8
);

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

const createToken = (user) => {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        iat: now,
        exp: now + TOKEN_TTL_SECONDS
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const data = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto.createHmac("sha256", secret).update(data).digest("base64url");

    return `${data}.${signature}`;
};

const signup = async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const email = normalizeEmail(req.body.email);
        const password = req.body.password;
        const role = String(req.body.role || DEFAULT_ROLE).trim().toLowerCase();

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
            user: {
                id: result.insertId,
                name,
                email,
                role
            }
        });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "A user with this email already exists" });
        }

        console.error("Signup error:", error.message);
        res.status(500).json({ error: "Something went wrong during signup" });
    }
};

const login = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
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

        res.status(200).json({
            message: "User logged in successfully",
            token: createToken(user),
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error("Login error:", error.message);
        res.status(500).json({ error: "Something went wrong during login" });
    }
};

module.exports = {
    signup,
    login
};
