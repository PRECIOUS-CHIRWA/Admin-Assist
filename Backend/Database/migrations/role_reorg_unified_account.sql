-- ═══════════════════════════════════════════════════════════════════════════════
-- Admin Assist — Role-Based Reorganization & Unified Student/Parent Migration
-- Safe to re-run: idempotent checks for column existence and index additions.
-- ═══════════════════════════════════════════════════════════════════════════════

USE admin_assist_db;

-- 1. Ensure students table has user_id referencing users(id) for unified accounts
SET @dbname = DATABASE();
SET @tablename = "students";
SET @columnname = "user_id";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE students ADD COLUMN user_id INT UNSIGNED DEFAULT NULL AFTER school_id, ADD CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Ensure index on students(user_id)
SET @indexname = "idx_student_user";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND INDEX_NAME = @indexname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE students ADD UNIQUE INDEX idx_student_user (user_id);"
));
PREPARE addIndexIfNotExists FROM @preparedStatement;
EXECUTE addIndexIfNotExists;
DEALLOCATE PREPARE addIndexIfNotExists;

-- 2. Ensure results table has school_id column for multi-school isolation
SET @tablename = "results";
SET @columnname = "school_id";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE results ADD COLUMN school_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id, ADD FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;"
));
PREPARE alterResultsSchool FROM @preparedStatement;
EXECUTE alterResultsSchool;
DEALLOCATE PREPARE alterResultsSchool;

-- 3. Backfill unified accounts for existing students who do not have a linked user account
-- Creates a user record with role 'user' and associates it with the student.
INSERT INTO users (school_id, name, email, password_hash, role, is_active, email_verified)
SELECT s.school_id,
       CONCAT(s.first_name, ' ', s.last_name),
       COALESCE(NULLIF(s.email, ''), CONCAT(LOWER(REPLACE(s.admission_number, '-', '')), '@student.school.local')),
       -- default scrypt hash for 'Student@123'
       'scrypt$d8285514b8ba07353f81e3a6c1e11409$86d4fa817812822a106f2df6b9148d88dfaa6b3c2c52402425032b4b4556fa39f5068cfcb9e57813636ae526210ea2a014909f187a55c2763f01b12b5093557e',
       'user',
       1,
       1
FROM students s
WHERE s.user_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM users u
      WHERE u.email = COALESCE(NULLIF(s.email, ''), CONCAT(LOWER(REPLACE(s.admission_number, '-', '')), '@student.school.local'))
  );

-- Link student to created user
UPDATE students s
JOIN users u ON u.email = COALESCE(NULLIF(s.email, ''), CONCAT(LOWER(REPLACE(s.admission_number, '-', '')), '@student.school.local'))
SET s.user_id = u.id
WHERE s.user_id IS NULL;

SELECT 'Role Reorganization & Unified Account Migration Completed.' AS status;
