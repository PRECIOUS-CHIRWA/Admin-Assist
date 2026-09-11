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

    // 4. Add missing columns to results
    await addColumnIfNotExists('results', 'school_id', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER id');

    // 5. Add missing columns to attendance_sessions
    await addColumnIfNotExists('attendance_sessions', 'school_id', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER id');

    // 6. Add missing columns to terms
    await addColumnIfNotExists('terms', 'school_id', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER id');

    // 7. Add missing columns to classes
    await addColumnIfNotExists('classes', 'school_id', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER id');

    // 8. Add missing columns to academic_years
    await addColumnIfNotExists('academic_years', 'school_id', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER id');

    // 9. Add missing columns to subjects
    await addColumnIfNotExists('subjects', 'school_id', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER id');

    // 10. Update existing rows where school_id is 0 or NULL
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

    // 11. Backfill unified student accounts for any student lacking user_id
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
