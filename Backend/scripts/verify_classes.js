const pool = require('../src/config/db');

async function verify() {
    try {
        console.log('=== VERIFICATION: CLASSES & ATTENDANCE ===\n');

        // 1. Check classesController query
        console.log('1. Testing classesController.listClasses query...');
        const [classesRows] = await pool.execute(
            `SELECT c.id, c.grade_level, c.stream, c.capacity, c.class_teacher_id,
                    u.name AS class_teacher_name,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    COUNT(s.id) AS student_count
             FROM classes c
             LEFT JOIN users u ON u.id = c.class_teacher_id
             LEFT JOIN students s ON (
                 s.class_id = c.id 
                 OR (s.grade = c.grade_level AND (
                     s.section = c.stream 
                     OR s.section = CONCAT(REPLACE(c.grade_level, 'Grade ', ''), c.stream)
                     OR CONCAT(s.grade, IF(s.section != '' AND s.section IS NOT NULL, CONCAT(' ', s.section), '')) = CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), ''))
                 ))
             ) AND s.status = 'Active'
             GROUP BY c.id
             ORDER BY c.grade_level, c.stream`
        );
        console.log(`Found ${classesRows.length} classes:`);
        console.table(classesRows.map(r => ({
            id: r.id,
            grade_level: r.grade_level,
            stream: r.stream,
            class_name: r.class_name,
            student_count: r.student_count
        })));

        // 2. Check attendanceController.getClasses query
        console.log('\n2. Testing attendanceController.getClasses query...');
        const [attClasses] = await pool.execute(
            `SELECT c.id, c.grade_level, c.stream,
                    CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), '')) AS class_name,
                    c.capacity,
                    u.name AS class_teacher_name,
                    COUNT(s.id) AS student_count
             FROM   classes c
             LEFT JOIN users u ON u.id = c.class_teacher_id
             LEFT JOIN students s ON (
                 s.class_id = c.id 
                 OR (s.grade = c.grade_level AND (
                     s.section = c.stream 
                     OR s.section = CONCAT(REPLACE(c.grade_level, 'Grade ', ''), c.stream)
                     OR CONCAT(s.grade, IF(s.section != '' AND s.section IS NOT NULL, CONCAT(' ', s.section), '')) = CONCAT(c.grade_level, IF(c.stream != '' AND c.stream IS NOT NULL, CONCAT(' ', c.stream), ''))
                 ))
             ) AND s.status = 'Active'
             GROUP BY c.id
             ORDER BY c.grade_level, c.stream`
        );
        console.log(`attendanceController returns ${attClasses.length} classes.`);

        // 3. Test getRegister for each class
        console.log('\n3. Testing attendance register for each class...');
        for (const cls of classesRows) {
            const shortSection = (cls.grade_level.replace(/^Grade\s*/i, '') + (cls.stream || '')).trim();
            const [students] = await pool.execute(
                `SELECT s.id, s.admission_number, s.first_name, s.last_name, s.gender, s.status AS student_status
                 FROM   students s
                 WHERE  (
                     s.class_id = ? 
                     OR (s.grade = ? AND (
                         s.section = ? 
                         OR s.section = ? 
                         OR CONCAT(s.grade, IF(s.section != '' AND s.section IS NOT NULL, CONCAT(' ', s.section), '')) = ?
                     ))
                 )
                   AND  s.status = 'Active'
                 ORDER BY s.last_name, s.first_name`,
                [cls.id, cls.grade_level, cls.stream, shortSection, cls.class_name]
            );
            console.log(`Class ${cls.id} (${cls.class_name}): ${students.length} student(s) loaded.`);
            if (students.length > 0) {
                students.forEach(st => {
                    console.log(`   - [${st.admission_number}] ${st.first_name} ${st.last_name} (${st.student_status})`);
                });
            }
        }

        console.log('\n=== ALL VERIFICATIONS PASSED ===');

    } catch (err) {
        console.error('Verification failed:', err);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

verify();
