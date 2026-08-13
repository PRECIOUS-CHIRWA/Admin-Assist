const mysql = require('mysql2/promise');
const path = require('path');

// Guarantee .env is loaded from Backend root directory regardless of CWD
require('dotenv').config({
    path: path.resolve(__dirname, '../../.env'),
    quiet: true
});

const getEnv = (key) => process.env[key] ? process.env[key].trim() : '';

const dbHost = getEnv('DB_HOST');
const isAiven = dbHost && (dbHost.includes('aiven') || dbHost.includes('aivencloud.com'));
const useSsl = isAiven || getEnv('DB_SSL') === 'true' || getEnv('NODE_ENV') === 'production';

const pool = mysql.createPool({
    host: dbHost || 'localhost',
    port: parseInt(getEnv('DB_PORT') || '3306', 10),
    user: getEnv('DB_USER') || 'root',
    password: getEnv('DB_PASSWORD') || '',
    database: getEnv('DB_NAME') || 'defaultdb',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.getConnection().then((conn) => {
    console.log(`[Database] Successfully connected to "${getEnv('DB_NAME')}" on ${dbHost || 'localhost'} (SSL: ${useSsl})`);
    conn.release();
}).catch((err) => {
    console.error('[Database] Connection error:', err.message || err.code);
});

module.exports = pool;