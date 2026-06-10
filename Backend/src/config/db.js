const mysql = require('mysql2/promise');
require('dotenv').config({ quiet: true });

// ─── Startup validation ───────────────────────────────────────────────────────
// Crash early with a readable message rather than a cryptic pool error later.
const REQUIRED = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = REQUIRED.filter(k => !process.env[k] || !process.env[k].trim());
if (missing.length > 0) {
    console.error(`[db] FATAL: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
}

const getEnv = (key) => process.env[key] && process.env[key].trim();

// Treat any case variation of "production" as production
// (guards against NODE_ENV= Production  with leading space / wrong case)
const isProduction = (getEnv('NODE_ENV') || '').toLowerCase() === 'production';

const pool = mysql.createPool({
    host:             getEnv('DB_HOST'),
    port:             parseInt(getEnv('DB_PORT') || '3306', 10),
    user:             getEnv('DB_USER'),
    password:         getEnv('DB_PASSWORD'),
    database:         getEnv('DB_NAME'),
    waitForConnections: true,
    connectionLimit:  10,
    queueLimit:       0,
    connectTimeout:   10_000,   // 10 s — fail fast instead of hanging forever
    // Railway requires SSL from any host outside its private network
    ssl: isProduction ? { rejectUnauthorized: false } : false,
});

pool.getConnection()
    .then((conn) => {
        console.log(`[db] Connected to "${getEnv('DB_NAME')}" on ${getEnv('DB_HOST')}:${getEnv('DB_PORT')} (SSL: ${isProduction})`);
        conn.release();
    })
    .catch((err) => {
        console.error(`[db] Connection FAILED (${err.code || 'UNKNOWN'}): ${err.message}`);
        console.error(`[db] Host: ${getEnv('DB_HOST')}:${getEnv('DB_PORT')} | DB: ${getEnv('DB_NAME')}`);
    });

module.exports = pool;