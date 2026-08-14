-- ─── Admin Assist — Sprint 3 Attendance Migration ─────────────────────────────
-- Safe to re-run: all statements use IF NOT EXISTS or conditional checks.
-- Run in MySQL connected to admin_assist_db or defaultdb.

USE admin_assist_db;

-- ─── 1. Schools Table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schools (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name        VARCHAR(255) NOT NULL,
    code        VARCHAR(50)  DEFAULT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

INSERT INTO schools (id, name, code)
SELECT 1, 'Default School', 'SCH-001'
WHERE NOT EXISTS (SELECT 1 FROM schools LIMIT 1);

-- ─── 2. Ensure users table has school_id ──────────────────────────────────────
SET @dbname = DATABASE();
SET @tablename = "users";
SET @columnname = "school_id";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE users ADD COLUMN school_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id;"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- ─── 3. Academic Years ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_years (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    school_id        INT UNSIGNED NOT NULL DEFAULT 1,
    year_label       VARCHAR(20)  NOT NULL,
    start_date       DATE                  DEFAULT NULL,
    end_date         DATE                  DEFAULT NULL,
    is_current       TINYINT(1)   NOT NULL DEFAULT 0,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

INSERT INTO academic_years (id, school_id, year_label, start_date, end_date, is_current)
SELECT * FROM (
    SELECT 1 AS id, 1 AS school_id, '2026' AS year_label, '2026-01-01' AS start_date, '2026-12-31' AS end_date, 1 AS is_current UNION ALL
    SELECT 2 AS id, 1 AS school_id, '2025' AS year_label, '2025-01-01' AS start_date, '2025-12-31' AS end_date, 0 AS is_current
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM academic_years LIMIT 1);

-- ─── 4. Terms ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS terms (
    id               INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    school_id        INT UNSIGNED     NOT NULL DEFAULT 1,
    academic_year_id INT UNSIGNED     NOT NULL,
    term_number      TINYINT UNSIGNED NOT NULL,
    term_name        VARCHAR(50)      NOT NULL,
    start_date       DATE                      DEFAULT NULL,
    end_date         DATE                      DEFAULT NULL,
    is_current       TINYINT(1)       NOT NULL DEFAULT 0,
    created_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (school_id)        REFERENCES schools(id)         ON DELETE CASCADE,
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
);

INSERT INTO terms (id, school_id, academic_year_id, term_number, term_name, start_date, end_date, is_current)
SELECT * FROM (
    SELECT 1 AS id, 1 AS school_id, 1 AS academic_year_id, 1 AS term_number, 'Term 1' AS term_name, '2026-01-12' AS start_date, '2026-04-10' AS end_date, 1 AS is_current UNION ALL
    SELECT 2 AS id, 1 AS school_id, 1 AS academic_year_id, 2 AS term_number, 'Term 2' AS term_name, '2026-05-11' AS start_date, '2026-08-07' AS end_date, 0 AS is_current UNION ALL
    SELECT 3 AS id, 1 AS school_id, 1 AS academic_year_id, 3 AS term_number, 'Term 3' AS term_name, '2026-09-07' AS start_date, '2026-12-04' AS end_date, 0 AS is_current
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM terms LIMIT 1);

-- ─── 5. Classes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    school_id        INT UNSIGNED NOT NULL DEFAULT 1,
    grade_level      VARCHAR(20)  NOT NULL,
    stream           VARCHAR(20)           DEFAULT '',
    capacity         INT UNSIGNED          DEFAULT 40,
    class_teacher_id INT UNSIGNED          DEFAULT NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (school_id)        REFERENCES schools(id) ON DELETE CASCADE,
    FOREIGN KEY (class_teacher_id) REFERENCES users(id)   ON DELETE SET NULL
);

INSERT INTO classes (id, school_id, grade_level, stream, capacity)
SELECT * FROM (
    SELECT 1 AS id, 1 AS school_id, 'Grade 8' AS grade_level, 'A' AS stream, 40 AS capacity UNION ALL
    SELECT 2 AS id, 1 AS school_id, 'Grade 9' AS grade_level, 'A' AS stream, 40 AS capacity UNION ALL
    SELECT 3 AS id, 1 AS school_id, 'Grade 10' AS grade_level, 'A' AS stream, 40 AS capacity UNION ALL
    SELECT 4 AS id, 1 AS school_id, 'Grade 11' AS grade_level, 'A' AS stream, 40 AS capacity UNION ALL
    SELECT 5 AS id, 1 AS school_id, 'Grade 12' AS grade_level, 'A' AS stream, 40 AS capacity
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM classes LIMIT 1);

-- ─── 6. Ensure students table has school_id and class_id ──────────────────────
SET @columnname = "school_id";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = 'students'
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE students ADD COLUMN school_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id;"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = "class_id";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = 'students'
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE students ADD COLUMN class_id INT UNSIGNED DEFAULT NULL AFTER school_id;"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Backfill class_id based on grade & section matching classes table
UPDATE students s
JOIN classes c ON CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), '')) = CONCAT(s.grade, IF(s.section != '', CONCAT(' ', s.section), ''))
SET s.class_id = c.id
WHERE s.class_id IS NULL;

-- ─── 7. Subjects ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    school_id    INT UNSIGNED NOT NULL DEFAULT 1,
    subject_code VARCHAR(20)  NOT NULL,
    subject_name VARCHAR(100) NOT NULL,
    description  TEXT                  DEFAULT NULL,
    is_active    TINYINT(1)   NOT NULL DEFAULT 1,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

INSERT INTO subjects (id, school_id, subject_code, subject_name)
SELECT * FROM (
    SELECT 1 AS id, 1 AS school_id, 'MATH' AS subject_code, 'Mathematics' AS subject_name UNION ALL
    SELECT 2 AS id, 1 AS school_id, 'ENG'  AS subject_code, 'English Language' AS subject_name UNION ALL
    SELECT 3 AS id, 1 AS school_id, 'SCI'  AS subject_code, 'Integrated Science' AS subject_name UNION ALL
    SELECT 4 AS id, 1 AS school_id, 'SOC'  AS subject_code, 'Social Studies' AS subject_name
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM subjects LIMIT 1);

-- ─── 8. Teacher Subjects ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_subjects (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    teacher_id       INT UNSIGNED NOT NULL,
    subject_id       INT UNSIGNED NOT NULL,
    class_id         INT UNSIGNED NOT NULL,
    academic_year_id INT UNSIGNED NOT NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (teacher_id)       REFERENCES users(id)          ON DELETE CASCADE,
    FOREIGN KEY (subject_id)       REFERENCES subjects(id)       ON DELETE CASCADE,
    FOREIGN KEY (class_id)         REFERENCES classes(id)        ON DELETE CASCADE,
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
);

-- ─── 9. Attendance Sessions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_sessions (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    school_id        INT UNSIGNED NOT NULL DEFAULT 1,
    class_id         INT UNSIGNED NOT NULL,
    subject_id       INT UNSIGNED          DEFAULT NULL,
    teacher_id       INT UNSIGNED NOT NULL,
    term_id          INT UNSIGNED NOT NULL,
    academic_year_id INT UNSIGNED NOT NULL,
    attendance_date  DATE         NOT NULL,
    period           VARCHAR(50)           DEFAULT 'General',
    notes            TEXT                  DEFAULT NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (school_id)        REFERENCES schools(id)         ON DELETE CASCADE,
    FOREIGN KEY (class_id)         REFERENCES classes(id)         ON DELETE CASCADE,
    FOREIGN KEY (subject_id)       REFERENCES subjects(id)        ON DELETE SET NULL,
    FOREIGN KEY (teacher_id)       REFERENCES users(id)          ON DELETE CASCADE,
    FOREIGN KEY (term_id)          REFERENCES terms(id)           ON DELETE CASCADE,
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
);

-- ─── 10. Attendance Records ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_records (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id  INT UNSIGNED NOT NULL,
    student_id  INT UNSIGNED NOT NULL,
    status      ENUM('present','absent','late','excused') NOT NULL DEFAULT 'present',
    remarks     TEXT                  DEFAULT NULL,
    recorded_by INT UNSIGNED          DEFAULT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (session_id)  REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id)  REFERENCES students(id)            ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id)               ON DELETE SET NULL,
    UNIQUE KEY uq_session_student (session_id, student_id)
);

SELECT 'Sprint 3 Attendance Migration complete.' AS status;
