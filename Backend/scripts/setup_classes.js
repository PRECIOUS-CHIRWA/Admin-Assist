const pool = require('../src/config/db');

const TARGET_CLASSES = [
    { grade_level: 'Grade 8',  stream: 'A', capacity: 40 },
    { grade_level: 'Grade 8',  stream: 'B', capacity: 40 },
    { grade_level: 'Grade 10', stream: 'A', capacity: 40 },
    { grade_level: 'Grade 10', stream: 'B', capacity: 40 },
    { grade_level: 'Grade 11', stream: 'A', capacity: 40 },
    { grade_level: 'Grade 11', stream: 'B', capacity: 40 },
    { grade_level: 'Grade 12', stream: 'A', capacity: 40 },
    { grade_level: 'Grade 12', stream: 'B', capacity: 40 },
];

async function setupClasses() {
    try {
        console.log('[Setup] Starting class alignment...');

        // 1. Fetch current classes
        const [existingClasses] = await pool.query('SELECT * FROM classes');
        console.log(`[Setup] Found ${existingClasses.length} existing classes.`);

        // 2. Ensure each target class exists
        for (const target of TARGET_CLASSES) {
            const match = existingClasses.find(
                c => c.grade_level === target.grade_level && String(c.stream).toUpperCase() === target.stream.toUpperCase()
            );

            if (!match) {
                // Check if there is an existing class for this grade that can be updated (e.g. empty stream or old stream name)
                // For instance:
                // Grade 8 with stream '' -> update to stream 'A'
                // Grade 10 with stream '' -> update to stream 'A'
                // Grade 11 with stream 'Science' -> update to stream 'A'
                // Grade 11 with stream 'Arts' -> update to stream 'B'
                // Grade 12 with stream 'Science' -> update to stream 'A'
                // Grade 12 with stream 'Arts' -> update to stream 'B'
                let candidateToUpdate = null;

                if (target.grade_level === 'Grade 8' && target.stream === 'A') {
                    candidateToUpdate = existingClasses.find(c => c.grade_level === 'Grade 8' && !c.stream);
                } else if (target.grade_level === 'Grade 10' && target.stream === 'A') {
                    candidateToUpdate = existingClasses.find(c => c.grade_level === 'Grade 10' && !c.stream);
                } else if (target.grade_level === 'Grade 11' && target.stream === 'A') {
                    candidateToUpdate = existingClasses.find(c => c.grade_level === 'Grade 11' && c.stream === 'Science');
                } else if (target.grade_level === 'Grade 11' && target.stream === 'B') {
                    candidateToUpdate = existingClasses.find(c => c.grade_level === 'Grade 11' && c.stream === 'Arts');
                } else if (target.grade_level === 'Grade 12' && target.stream === 'A') {
                    candidateToUpdate = existingClasses.find(c => c.grade_level === 'Grade 12' && c.stream === 'Science');
                } else if (target.grade_level === 'Grade 12' && target.stream === 'B') {
                    candidateToUpdate = existingClasses.find(c => c.grade_level === 'Grade 12' && c.stream === 'Arts');
                }

                if (candidateToUpdate) {
                    await pool.execute(
                        'UPDATE classes SET stream = ?, capacity = ? WHERE id = ?',
                        [target.stream, target.capacity, candidateToUpdate.id]
                    );
                    candidateToUpdate.stream = target.stream;
                    console.log(`[Setup] Updated class id ${candidateToUpdate.id} to ${target.grade_level} Stream ${target.stream}`);
                } else {
                    const [res] = await pool.execute(
                        'INSERT INTO classes (grade_level, stream, capacity) VALUES (?, ?, ?)',
                        [target.grade_level, target.stream, target.capacity]
                    );
                    existingClasses.push({ id: res.insertId, grade_level: target.grade_level, stream: target.stream, capacity: target.capacity });
                    console.log(`[Setup] Created class id ${res.insertId}: ${target.grade_level} Stream ${target.stream}`);
                }
            }
        }

        // 3. Remove obsolete classes not in target list (if safe)
        const [updatedClasses] = await pool.query('SELECT * FROM classes');
        for (const cls of updatedClasses) {
            const isTarget = TARGET_CLASSES.some(
                t => t.grade_level === cls.grade_level && t.stream.toUpperCase() === String(cls.stream).toUpperCase()
            );

            if (!isTarget) {
                // Check if any results or sessions reference this class before deleting
                const [[sess]] = await pool.query('SELECT COUNT(*) AS count FROM attendance_sessions WHERE class_id = ?', [cls.id]);
                const [[res]] = await pool.query('SELECT COUNT(*) AS count FROM results WHERE class_id = ?', [cls.id]);
                const [[ts]] = await pool.query('SELECT COUNT(*) AS count FROM teacher_subjects WHERE class_id = ?', [cls.id]);

                if (sess.count === 0 && res.count === 0 && ts.count === 0) {
                    await pool.execute('DELETE FROM classes WHERE id = ?', [cls.id]);
                    console.log(`[Setup] Cleaned up obsolete class id ${cls.id} (${cls.grade_level} ${cls.stream})`);
                } else {
                    console.log(`[Setup] Retained class id ${cls.id} (${cls.grade_level} ${cls.stream}) due to active references`);
                }
            }
        }

        // 4. Backfill student class_id and normalize grade/section
        const [allClasses] = await pool.query('SELECT * FROM classes');
        console.log('[Setup] Final classes list:');
        console.table(allClasses);

        const [students] = await pool.query('SELECT id, admission_number, first_name, last_name, grade, section, class_id FROM students');
        console.log(`[Setup] Processing ${students.length} students...`);

        for (const student of students) {
            const rawGrade = String(student.grade || '').trim();
            const rawSection = String(student.section || '').trim();

            // Extract grade number (e.g. "Grade 8" -> "8", "8" -> "8")
            const gradeNum = rawGrade.replace(/[^0-9]/g, '');
            // Extract stream letter (e.g. "8A" -> "A", "A" -> "A", "10B" -> "B")
            let streamLetter = rawSection.replace(/^[0-9]+/, '').trim().toUpperCase();
            if (!streamLetter) {
                // If section was just a number or empty, check if grade had it or default to 'A'
                streamLetter = 'A';
            }

            const standardGrade = `Grade ${gradeNum}`;

            // Find matching class
            const matchedClass = allClasses.find(
                c => c.grade_level === standardGrade && c.stream.toUpperCase() === streamLetter
            );

            if (matchedClass) {
                await pool.execute(
                    'UPDATE students SET class_id = ?, grade = ?, section = ? WHERE id = ?',
                    [matchedClass.id, standardGrade, streamLetter, student.id]
                );
                console.log(`[Setup] Linked Student ${student.id} (${student.first_name} ${student.last_name}) -> Class ${matchedClass.id} (${standardGrade} ${streamLetter})`);
            } else {
                console.warn(`[Setup] Could not match student ${student.id} (${rawGrade}, ${rawSection}) to any target class.`);
            }
        }

        console.log('[Setup] Class setup & student backfill completed successfully.');

    } catch (err) {
        console.error('[Setup] Error:', err);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

setupClasses();
