/**
 * create-admin.js - Admin Assist Bootstrap Admin Creator
 *
 * Usage:
 *   node Backend/scripts/create-admin.js --name "Full Name" --email "admin@school.zm" --password "yourpassword"
 *
 * Run once against a fresh database to create the first administrator account.
 * Uses identical scrypt algorithm as authController.js - the account can log in immediately.
 */
"use strict";
const crypto = require("crypto");
const { promisify } = require("util");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

const scrypt = promisify(crypto.scrypt);

const args = process.argv.slice(2);
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 && args[i+1] ? args[i+1] : null; }

const name     = getArg("--name");
const email    = getArg("--email");
const password = getArg("--password");
const role     = getArg("--role") || "admin";

if (!name || !email || !password) {
    console.error('Usage: node Backend/scripts/create-admin.js --name "Full Name" --email "admin@school.zm" --password "yourpassword"\nOptional: --role headmaster');
    process.exit(1);
}
if (!["admin","headmaster","staff","user"].includes(role)) {
    console.error("Invalid role. Must be: admin, headmaster, staff, or user"); process.exit(1);
}
if (password.length < 8) { console.error("Password must be at least 8 characters."); process.exit(1); }

const hashPassword = async (pw) => {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await scrypt(pw, salt, 64);
    return `scrypt$${salt}$${hash.toString("hex")}`;
};

async function main() {
    const pool = require(path.join(__dirname, "../src/config/db"));
    const [existing] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [email.trim().toLowerCase()]);
    if (existing.length > 0) { console.error(`Email '${email}' already exists (id: ${existing[0].id}).`); process.exit(1); }
    const passwordHash = await hashPassword(password);
    const [result] = await pool.execute(
        "INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)",
        [name.trim(), email.trim().toLowerCase(), passwordHash, role]
    );
    console.log(`\n✅ ${role} account created!\n   ID:    ${result.insertId}\n   Name:  ${name}\n   Email: ${email}\n   Role:  ${role}\n`);
    await pool.end();
    process.exit(0);
}

main().catch((err) => { console.error("Error:", err.message); process.exit(1); });
