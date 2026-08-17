const pool = require('../src/config/db');

async function main() {
    try {
        const [sessions] = await pool.query(`SELECT * FROM attendance_sessions`);
        console.log('attendance_sessions:', sessions);
        const [ts] = await pool.query(`SELECT * FROM teacher_subjects`);
        console.log('teacher_subjects:', ts);
        const [res] = await pool.query(`SELECT * FROM results`);
        console.log('results:', res);
        const [students] = await pool.query(`SELECT id, admission_number, first_name, last_name, grade, section, class_id FROM students`);
        console.log('students:', students);
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

main();
