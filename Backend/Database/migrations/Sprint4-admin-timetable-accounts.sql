-- ═══════════════════════════════════════════════════════════════════════════════
-- Admin Assist — Sprint 4: Enhanced Admin Management, Timetables & Unified Accounts
-- Safe to re-run: idempotent checks for column existence and index additions.
-- ═══════════════════════════════════════════════════════════════════════════════

USE defaultdb;

-- 1. Departments table
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

INSERT INTO departments (school_id, name, code)
SELECT * FROM (
    SELECT 1 AS s, 'Mathematics' AS n, 'MATH' AS c UNION ALL
    SELECT 1, 'Science', 'SCI' UNION ALL
    SELECT 1, 'Languages', 'LANG' UNION ALL
    SELECT 1, 'Social Sciences', 'SOC' UNION ALL
    SELECT 1, 'Business Studies', 'BUS' UNION ALL
    SELECT 1, 'Information & Communication Technology', 'ICT' UNION ALL
    SELECT 1, 'Practical Arts & Physical Education', 'PAPE'
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM departments LIMIT 1);

-- 2. Staff position & department on users table
SET @dbname = DATABASE();
SET @tablename = "users";

SET @columnname = "school_position";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE users ADD COLUMN school_position VARCHAR(100) NOT NULL DEFAULT 'Teacher' AFTER role;"
));
PREPARE stmt FROM @preparedStatement; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @columnname = "department";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE users ADD COLUMN department VARCHAR(100) DEFAULT NULL AFTER school_position;"
));
PREPARE stmt FROM @preparedStatement; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Support 'Archived' status on students table
ALTER TABLE students MODIFY COLUMN status ENUM('Active','Inactive','Suspended','Archived') NOT NULL DEFAULT 'Active';

-- 4. Ensure class_teacher_id and core_focus on classes table
SET @tablename = "classes";

SET @columnname = "class_teacher_id";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE classes ADD COLUMN class_teacher_id INT UNSIGNED DEFAULT NULL AFTER stream, ADD CONSTRAINT fk_classes_teacher FOREIGN KEY (class_teacher_id) REFERENCES users(id) ON DELETE SET NULL;"
));
PREPARE stmt FROM @preparedStatement; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @columnname = "core_focus";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @columnname) > 0,
  "SELECT 1",
  "ALTER TABLE classes ADD COLUMN core_focus VARCHAR(100) DEFAULT NULL AFTER capacity;"
));
PREPARE stmt FROM @preparedStatement; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. Timetables table
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

SELECT 'Sprint 4 database schema applied successfully.' AS status;
