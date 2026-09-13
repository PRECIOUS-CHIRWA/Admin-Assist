const pool = require('../config/db');

async function columnExists(table, column) {
    const [rows] = await pool.query(
        `SELECT COUNT(*) as cnt 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = ? 
           AND COLUMN_NAME = ?`,
        [table, column]
    );
    return rows[0].cnt > 0;
}

async function addColumnIfNotExists(table, column, definition) {
    const exists = await columnExists(table, column);
    if (!exists) {
        console.log(`[Migration] Adding column ${column} to ${table}...`);
        await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
        console.log(`[Migration] Added column ${column} to ${table}.`);
    } else {
        console.log(`[Migration] Column ${column} already exists on ${table}.`);
    }
}

async function runMigration() {
    console.log('[Migration] Starting database migration & schema alignment...');

    // 1. Ensure schools table exists
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schools (
            id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
            name       VARCHAR(255) NOT NULL,
            code       VARCHAR(50)           DEFAULT NULL,
            address    TEXT                  DEFAULT NULL,
            phone      VARCHAR(30)           DEFAULT NULL,
            email      VARCHAR(255)          DEFAULT NULL,
            created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
        INSERT INTO schools (id, name, code)
        SELECT 1, 'Default School', 'SCH-001'
        WHERE NOT EXISTS (SELECT 1 FROM schools WHERE id = 1);
    `);
    console.log('[Migration] Ensured schools table and default school record.');

    // 2. Add missing columns to users
    await addColumnIfNotExists('users', 'school_id', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER id');
    await addColumnIfNotExists('users', 'email_verified', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active');
    await addColumnIfNotExists('users', 'email_verified_at', 'DATETIME DEFAULT NULL AFTER email_verified');

    // 3. Add missing columns to students
    await addColumnIfNotExists('students', 'school_id', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER id');
    await addColumnIfNotExists('students', 'user_id', 'INT UNSIGNED DEFAULT NULL AFTER school_id');

    // 4. Add assessment policy columns to school_settings
    await addColumnIfNotExists('school_settings', 'assessment_model', "VARCHAR(50) NOT NULL DEFAULT 'MID_TERM_FINAL'");
    await addColumnIfNotExists('school_settings', 'mid_term_weight', "DECIMAL(5,2) NOT NULL DEFAULT 20.00");
    await addColumnIfNotExists('school_settings', 'final_term_weight', "DECIMAL(5,2) NOT NULL DEFAULT 80.00");
    await addColumnIfNotExists('school_settings', 'continuous_assessment_enabled', "TINYINT(1) NOT NULL DEFAULT 0");
    await addColumnIfNotExists('school_settings', 'continuous_assessment_weight', "DECIMAL(5,2) NOT NULL DEFAULT 0.00");
    await addColumnIfNotExists('school_settings', 'grading_scheme', "VARCHAR(50) NOT NULL DEFAULT 'ADMIN_ASSIST_ECZ'");

    // 5. Add assessment columns to results
    await addColumnIfNotExists('results', 'school_id', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER id');
    await addColumnIfNotExists('results', 'mid_term_score', 'DECIMAL(5,2) DEFAULT NULL AFTER academic_year_id');
    await addColumnIfNotExists('results', 'final_term_score', 'DECIMAL(5,2) DEFAULT NULL AFTER mid_term_score');
    await addColumnIfNotExists('results', 'continuous_assessment_score', 'DECIMAL(5,2) DEFAULT NULL AFTER final_term_score');
    await addColumnIfNotExists('results', 'final_mark', 'DECIMAL(5,2) DEFAULT NULL AFTER continuous_assessment_score');
    await addColumnIfNotExists('results', 'status', "VARCHAR(30) NOT NULL DEFAULT 'INCOMPLETE' AFTER remarks");
    await addColumnIfNotExists('results', 'assessment_policy_snapshot', 'TEXT DEFAULT NULL AFTER status');

    // 6. Add missing columns to attendance_sessions
    await addColumnIfNotExists('attendance_sessions', 'school_id', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER id');

    // 7. Add missing columns to terms
    await addColumnIfNotExists('terms', 'school_id', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER id');

    // 8. Add missing columns to classes
    await addColumnIfNotExists('classes', 'school_id', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER id');

    // 9. Add missing columns to academic_years
    await addColumnIfNotExists('academic_years', 'school_id', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER id');

    // 10. Add missing columns to subjects
    await addColumnIfNotExists('subjects', 'school_id', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER id');

    // 11. Update system year to 2026 across academic_years, terms, and settings
    try {
        await pool.query(`
            UPDATE academic_years 
            SET year_label = '2026', 
                start_date = '2026-01-12', 
                end_date = '2026-12-04', 
                is_current = 1 
            WHERE id = 1 OR year_label = '2025'
        `);
        await pool.query(`
            UPDATE terms 
            SET start_date = '2026-01-12', end_date = '2026-04-10', is_current = 1 
            WHERE id = 1
        `);
        await pool.query(`
            UPDATE terms 
            SET start_date = '2026-05-11', end_date = '2026-08-07', is_current = 0 
            WHERE id = 2
        `);
        await pool.query(`
            UPDATE terms 
            SET start_date = '2026-09-07', end_date = '2026-12-04', is_current = 0 
            WHERE id = 3
        `);
        await pool.query(`
            UPDATE school_settings 
            SET academic_year_label = '2026' 
            WHERE school_id = 1
        `);
        console.log('[Migration] System academic year synchronized to 2026.');
    } catch (err) {
        console.warn('[Migration] Academic year 2026 update notice:', err.message);
    }

    // 12. Backfill existing results table records to populate mid_term_score and final_term_score
    try {
        await pool.query(`
            UPDATE results 
            SET mid_term_score = test_mark,
                final_term_score = exam_mark,
                final_mark = total_marks,
                status = 'COMPLETE'
            WHERE mid_term_score IS NULL AND (test_mark > 0 OR exam_mark > 0 OR total_marks > 0)
        `);
    } catch (err) {
        console.warn('[Migration] Results backfill notice:', err.message);
    }

    // 13. Update existing rows where school_id is 0 or NULL
    const tablesToBackfill = [
        'users', 'students', 'results', 'attendance_sessions',
        'terms', 'classes', 'academic_years', 'subjects'
    ];
    for (const tbl of tablesToBackfill) {
        try {
            await pool.query(`UPDATE \`${tbl}\` SET school_id = 1 WHERE school_id IS NULL OR school_id = 0`);
        } catch (err) {
            console.warn(`[Migration] Backfill school_id on ${tbl}:`, err.message);
        }
    }

    // 14. Backfill unified student accounts for any student lacking user_id
    try {
        const [unlinked] = await pool.query(
            `SELECT s.id, s.admission_number, s.first_name, s.last_name, s.email, s.school_id
             FROM students s
             WHERE s.user_id IS NULL`
        );

        for (const st of unlinked) {
            const rawEmail = st.email && st.email.trim()
                ? st.email.trim()
                : `${(st.admission_number || `std${st.id}`).toLowerCase().replace(/[^a-z0-9]/g, '')}@student.school.local`;

            const [found] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [rawEmail]);
            let uId;
            if (found.length > 0) {
                uId = found[0].id;
            } else {
                const name = `${st.first_name} ${st.last_name}`.trim();
                const defHash = 'scrypt$d8285514b8ba07353f81e3a6c1e11409$86d4fa817812822a106f2df6b9148d88dfaa6b3c2c52402425032b4b4556fa39f5068cfcb9e57813636ae526210ea2a014909f187a55c2763f01b12b5093557e';
                const [ins] = await pool.query(
                    `INSERT INTO users (school_id, name, email, password_hash, role, is_active, email_verified)
                     VALUES (?, ?, ?, ?, 'user', 1, 1)`,
                    [st.school_id || 1, name, rawEmail, defHash]
                );
                uId = ins.insertId;
            }

            await pool.query('UPDATE students SET user_id = ? WHERE id = ?', [uId, st.id]);
        }
        console.log(`[Migration] Backfilled unified accounts for ${unlinked.length} students.`);
    } catch (err) {
        console.warn('[Migration] Unified account backfill note:', err.message);
    }

    // 15. Create timetables table and seed initial entries
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS timetables (
                id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
                school_id        INT UNSIGNED NOT NULL DEFAULT 1,
                academic_year_id INT UNSIGNED NOT NULL DEFAULT 1,
                term_id          INT UNSIGNED DEFAULT NULL,
                teacher_id       INT UNSIGNED NOT NULL,
                class_id         INT UNSIGNED NOT NULL,
                subject_id       INT UNSIGNED NOT NULL,
                day_of_week      ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
                start_time       TIME NOT NULL,
                end_time         TIME NOT NULL,
                room             VARCHAR(50) DEFAULT NULL,
                is_active        TINYINT(1) NOT NULL DEFAULT 1,
                created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
                FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
                FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE SET NULL,
                FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
                FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
                INDEX idx_tt_school (school_id),
                INDEX idx_tt_teacher (teacher_id),
                INDEX idx_tt_class (class_id),
                INDEX idx_tt_subject (subject_id),
                INDEX idx_tt_day (day_of_week),
                INDEX idx_tt_times (day_of_week, start_time, end_time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('[Migration] Ensured timetables table exists.');

        // Seed sample timetable entries if none exist
        const [ttCount] = await pool.query('SELECT COUNT(*) as cnt FROM timetables');
        if (ttCount[0].cnt === 0) {
            const [assignments] = await pool.query(`
                SELECT ts.teacher_id, ts.class_id, ts.subject_id, ts.academic_year_id,
                       u.school_id
                FROM teacher_subjects ts
                JOIN users u ON u.id = ts.teacher_id
                LIMIT 10
            `);

            if (assignments.length > 0) {
                const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                const slots = [
                    { start: '08:00:00', end: '08:50:00', room: 'Room 1' },
                    { start: '09:00:00', end: '09:50:00', room: 'Room 2' },
                    { start: '10:20:00', end: '11:10:00', room: 'Lab 1' },
                    { start: '11:20:00', end: '12:10:00', room: 'Room 3' },
                    { start: '13:00:00', end: '13:50:00', room: 'Room 4' }
                ];

                for (let i = 0; i < assignments.length; i++) {
                    const asgn = assignments[i];
                    // Spread across days
                    const day1 = days[i % days.length];
                    const day2 = days[(i + 2) % days.length];
                    const slot = slots[i % slots.length];
                    const slot2 = slots[(i + 1) % slots.length];

                    await pool.query(`
                        INSERT INTO timetables (school_id, academic_year_id, teacher_id, class_id, subject_id, day_of_week, start_time, end_time, room)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?),
                               (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        asgn.school_id || 1, asgn.academic_year_id || 1, asgn.teacher_id, asgn.class_id, asgn.subject_id, day1, slot.start, slot.end, slot.room,
                        asgn.school_id || 1, asgn.academic_year_id || 1, asgn.teacher_id, asgn.class_id, asgn.subject_id, day2, slot2.start, slot2.end, slot2.room
                    ]);
                }
                console.log('[Migration] Seeded baseline timetable entries for active teachers.');
            }
        }
    } catch (err) {
        console.warn('[Migration] Timetables table migration notice:', err.message);
    }

    // 16. Ensure departments table exists and seed defaults
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS departments (
                id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
                school_id  INT UNSIGNED NOT NULL DEFAULT 1,
                name       VARCHAR(100) NOT NULL,
                code       VARCHAR(20) DEFAULT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
                INDEX idx_dept_school (school_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        const [deptCount] = await pool.query('SELECT COUNT(*) as cnt FROM departments');
        if (deptCount[0].cnt === 0) {
            await pool.query(`
                INSERT INTO departments (school_id, name, code) VALUES
                (1, 'Mathematics', 'MATH'),
                (1, 'Science', 'SCI'),
                (1, 'Languages', 'LANG'),
                (1, 'Social Sciences', 'SOC'),
                (1, 'Business Studies', 'BUS'),
                (1, 'Information & Communication Technology', 'ICT'),
                (1, 'Practical Arts & Physical Education', 'PAPE')
            `);
            console.log('[Migration] Seeded default secondary school departments.');
        }
    } catch (err) {
        console.warn('[Migration] Departments migration notice:', err.message);
    }

    // 17. Add staff position and department to users table
    await addColumnIfNotExists('users', 'school_position', "VARCHAR(100) NOT NULL DEFAULT 'Teacher' AFTER role");
    await addColumnIfNotExists('users', 'department', "VARCHAR(100) DEFAULT NULL AFTER school_position");

    // 18. Allow 'Archived' status on students table
    try {
        await pool.query(`
            ALTER TABLE students
            MODIFY COLUMN status ENUM('Active','Inactive','Suspended','Archived') NOT NULL DEFAULT 'Active'
        `);
        console.log('[Migration] Updated students status column to support Archived.');
    } catch (err) {
        console.warn('[Migration] Students status column update notice:', err.message);
    }

    // 19. Ensure core_focus and class_teacher_id on classes table
    await addColumnIfNotExists('classes', 'class_teacher_id', "INT UNSIGNED DEFAULT NULL AFTER stream");
    await addColumnIfNotExists('classes', 'core_focus', "VARCHAR(100) DEFAULT NULL AFTER capacity");

    console.log('[Migration] Database migration completed successfully!');
}

if (require.main === module) {
    runMigration()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('[Migration] Failed:', err);
            process.exit(1);
        });
}

module.exports = runMigration;
