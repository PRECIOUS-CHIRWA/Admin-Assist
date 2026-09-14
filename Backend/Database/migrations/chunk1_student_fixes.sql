-- ═══════════════════════════════════════════════════════════════════════════════
-- Admin Assist — Chunk 1 Migration
-- chunk1_student_fixes.sql
--
-- Safe to re-run (idempotent ALTER TABLE in MySQL modifies the column
-- definition each time but leaves existing data intact as long as all
-- existing values are in the new enum list).
--
-- Changes:
--   1. Add 'Archived' to students.status ENUM
--   2. Clear stale user_id links on students whose linked users no longer
--      exist (defensive cleanup — should be rare but prevents FK ghosts).
-- ═══════════════════════════════════════════════════════════════════════════════

USE admin_assist_db;

-- ─── 1. Add 'Archived' to students.status ENUM ────────────────────────────────
-- The archiveStudent controller sets status = 'Archived'. Without this value
-- in the ENUM the row update silently fails (data-truncated warning) or errors
-- depending on sql_mode. This makes it explicit and correct.
ALTER TABLE students
    MODIFY COLUMN status
        ENUM('Active','Inactive','Suspended','Archived') NOT NULL DEFAULT 'Active';

-- ─── 2. Defensive: clear stale user_id FK links ───────────────────────────────
-- Prior to Chunk 1, the enrollment flow auto-created a users row and set
-- user_id immediately. If any of those auto-generated users have since been
-- deleted (or the user row never truly existed), clear the dangling FK so
-- the account-existence check works correctly.
UPDATE students s
LEFT JOIN users u ON u.id = s.user_id
SET s.user_id = NULL
WHERE s.user_id IS NOT NULL AND u.id IS NULL;



-- ─── 3. Add school_position column to users if missing ────────────────────────
-- This column was introduced in Sprint4 migration but is absent from the base
-- schema.sql. The controller uses it to tag student accounts. Adding it here
-- ensures the column exists on any DB that skipped Sprint4.
SET @dbname = DATABASE();
SET @stmt = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'users' AND COLUMN_NAME = 'school_position') > 0,
    'SELECT 1',
    "ALTER TABLE users ADD COLUMN school_position VARCHAR(100) NOT NULL DEFAULT 'Student' AFTER role"
));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ─── 4. Add department column to users if missing ────────────────────────────
SET @stmt = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'users' AND COLUMN_NAME = 'department') > 0,
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN department VARCHAR(100) DEFAULT NULL AFTER school_position'
));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ─── 5. Create notifications table if missing ───────────────────────────────────
-- The original schema.sql was missing the closing ); on this table definition,
-- so it was never created on the live database. This fixes the recurring
-- "Table 'defaultdb.notifications' doesn't exist" backend error.
CREATE TABLE IF NOT EXISTS notifications (
    id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id     INT UNSIGNED  NOT NULL,
    type        VARCHAR(50)   NOT NULL DEFAULT 'system',
    title       VARCHAR(255)  NOT NULL,
    description TEXT                   DEFAULT NULL,
    entity_type VARCHAR(50)            DEFAULT NULL,
    entity_id   INT UNSIGNED           DEFAULT NULL,
    is_read     TINYINT(1)    NOT NULL DEFAULT 0,
    created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_notif_user    (user_id),
    INDEX idx_notif_read    (user_id, is_read),
    INDEX idx_notif_created (created_at)
);

SELECT 'Chunk 1 migration applied successfully.' AS status;

