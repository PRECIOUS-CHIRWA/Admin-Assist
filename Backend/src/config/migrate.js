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
