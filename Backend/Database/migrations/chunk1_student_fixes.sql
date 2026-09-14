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

SELECT 'Chunk 1 migration applied successfully.' AS status;
