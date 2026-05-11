const mysql = require('mysql2/promise');
require('dotenv').config();

// Create database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection().then((conn) => {
    console.log('Successfully connected to the database as ');
    conn.release();
}).catch((err) => {
    console.error('Error connecting to database', err.message);
});

module.exports = pool;