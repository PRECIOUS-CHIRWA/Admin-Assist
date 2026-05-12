const mysql = require('mysql2/promise');
require('dotenv').config({ quiet: true });

const getEnv = (key) => process.env[key] && process.env[key].trim();

// Create database connection pool
const pool = mysql.createPool({
    host: getEnv('DB_HOST'),
    user: getEnv('DB_USER'),
    password: getEnv('DB_PASSWORD'),
    database: getEnv('DB_NAME'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection().then((conn) => {
    console.log(`Successfully connected to database "${getEnv('DB_NAME')}"`);
    conn.release();
}).catch((err) => {
    console.error('Error connecting to database:', err.message || err.code);
});

module.exports = pool;
