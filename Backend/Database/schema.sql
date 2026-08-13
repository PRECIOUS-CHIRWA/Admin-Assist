-- ═══════════════════════════════════════════════════════════════════════════════
-- Admin Assist — Master Schema (Single-file fresh install)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Safe to re-run: all CREATE statements use IF NOT EXISTS.
-- Seed INSERTs guard themselves with WHERE NOT EXISTS checks.
--
-- HISTORY: Individual sprint migrations live in this directory as authoritative
-- history. This file is the single target for a fresh install or new environment.
-- If your Aiven instance has tables from prior migrations, run:
--   SHOW CREATE TABLE <name>;
-- and reconcile any column differences before using this file.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS admin_assist_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE admin_assist_db;

-- ─── 1. Schools ───────────────────────────────────────────────────────────────
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
);

INSERT INTO schools (id, name, code)
SELECT 1, 'Default School', 'SCH-001'
WHERE NOT EXISTS (SELECT 1 FROM schools LIMIT 1);

-- ─── 2. Users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    school_id         INT UNSIGNED     NOT NULL DEFAULT 1,
    name              VARCHAR(100)     NOT NULL,
    email             VARCHAR(255)     NOT NULL,
    password_hash     VARCHAR(255)     NOT NULL,
    role              ENUM('admin','staff','user','headmaster') NOT NULL DEFAULT 'user',
    is_active         TINYINT(1)       NOT NULL DEFAULT 1,
    email_verified    TINYINT(1)       NOT NULL DEFAULT 1,
    email_verified_at DATETIME                  DEFAULT NULL,
    failed_attempts   TINYINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until      DATETIME                  DEFAULT NULL,
    last_login_at     DATETIME                  DEFAULT NULL,
    created_at        TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_email (email),
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
    INDEX idx_role           (role),
    INDEX idx_active         (is_active),
    INDEX idx_email_verified (email_verified),
    INDEX idx_school         (school_id)
);

-- ─── 3. Refresh Tokens ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    INT UNSIGNED NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME     NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_token_hash (token_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user    (user_id),
    INDEX idx_expires (expires_at)
);

-- ─── 4. Email Verification Tokens ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    INT UNSIGNED NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME     NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_evt_hash (token_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_evt_user    (user_id),
    INDEX idx_evt_expires (expires_at)
);

-- ─── 5. Password Reset Tokens ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    INT UNSIGNED NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME     NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_prt_hash (token_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_prt_user    (user_id),
    INDEX idx_prt_expires (expires_at)
);

-- ─── 6. Students ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
    id                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    school_id            INT UNSIGNED  NOT NULL DEFAULT 1,
    class_id             INT UNSIGNED           DEFAULT NULL,
    admission_number     VARCHAR(20)   NOT NULL,
    first_name           VARCHAR(100)  NOT NULL,
    last_name            VARCHAR(100)  NOT NULL,
    date_of_birth        DATE          NOT NULL,
    gender               ENUM('Male','Female') NOT NULL,
    nrc_number           VARCHAR(30)            DEFAULT NULL,
    home_address         TEXT                   DEFAULT NULL,
    district             VARCHAR(100)           DEFAULT NULL,
    province             VARCHAR(50)   NOT NULL,
    grade                VARCHAR(20)   NOT NULL,
    section              VARCHAR(20)   NOT NULL,
    enrollment_date      DATE          NOT NULL,
    previous_school      VARCHAR(255)           DEFAULT NULL,
    parent_guardian_name VARCHAR(150)  NOT NULL,
    relationship         ENUM('Father','Mother','Guardian') NOT NULL,
    phone_number         VARCHAR(20)   NOT NULL,
    email                VARCHAR(255)           DEFAULT NULL,
    status               ENUM('Active','Inactive','Suspended') NOT NULL DEFAULT 'Active',
    created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admission_number (admission_number),
    FOREIGN KEY (school_id) REFERENCES schools(id)  ON DELETE CASCADE,
    -- class_id FK added after classes table is created (see near end of file)
    INDEX idx_grade   (grade),
    INDEX idx_status  (status),
    INDEX idx_name    (last_name, first_name),
    INDEX idx_school  (school_id),
    INDEX idx_class   (class_id)
);

-- ─── 7. Audit Log ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    actor_id    INT UNSIGNED  NOT NULL,
    action      VARCHAR(255)  NOT NULL,
    entity_type VARCHAR(50)            DEFAULT NULL,
    entity_id   INT                    DEFAULT NULL,
    details     JSON                   DEFAULT NULL,
    created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_actor   (actor_id),
    INDEX idx_created (created_at),
    INDEX idx_entity  (entity_type, entity_id)
);

-- ─── 8. Grading Scales (Zambian ECZ) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grading_scales (
    id       INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    grade    CHAR(2)          NOT NULL,
    min_mark TINYINT UNSIGNED NOT NULL,
    max_mark TINYINT UNSIGNED NOT NULL,
    label    VARCHAR(50)               DEFAULT NULL,
    points   DECIMAL(3,1)              DEFAULT NULL,
    PRIMARY KEY (id)
);

INSERT INTO grading_scales (grade, min_mark, max_mark, label, points)
SELECT * FROM (
    SELECT 'A',  80, 100, 'Distinction', 6.0 UNION ALL
    SELECT 'B',  70,  79, 'Merit',       5.0 UNION ALL
    SELECT 'C',  60,  69, 'Credit',      4.0 UNION ALL
    SELECT 'D',  50,  59, 'Satisfactory',3.0 UNION ALL
    SELECT 'E',  40,  49, 'Pass',        2.0 UNION ALL
    SELECT 'F',   0,  39, 'Fail',        1.0
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM grading_scales LIMIT 1);

-- ─── 9. Moderation Checklists ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS moderation_checklists (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    item        TEXT         NOT NULL,
    is_required TINYINT(1)            DEFAULT 1,
    term        ENUM('Term 1','Term 2','Term 3') NOT NULL DEFAULT 'Term 1',
    PRIMARY KEY (id)
);

INSERT INTO moderation_checklists (item, is_required, term)
SELECT * FROM (
    SELECT 'Verify all students on the class list have scores recorded',         1, 'Term 1' UNION ALL
    SELECT 'Check that no score exceeds the maximum allowed for each component', 1, 'Term 1' UNION ALL
    SELECT 'Confirm department head has reviewed and initialled the gradebook',  1, 'Term 1' UNION ALL
    SELECT 'Ensure absent learners are marked with an approved absence code',    1, 'Term 1' UNION ALL
    SELECT 'Remove any entries for transferred or withdrawn students',           1, 'Term 1'
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM moderation_checklists LIMIT 1);

-- ─── 10. Teacher Notes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_notes (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    author_id  INT UNSIGNED NOT NULL,
    student_id INT UNSIGNED          DEFAULT NULL,
    content    TEXT         NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (author_id)  REFERENCES users(id)    ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
    INDEX idx_author  (author_id),
    INDEX idx_student (student_id)
);

-- ─── 11. Role Change Requests ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_change_requests (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id        INT UNSIGNED NOT NULL,
    current_role   ENUM('admin','staff','user','headmaster') NOT NULL,
    requested_role ENUM('admin','staff','user','headmaster') NOT NULL,
    reason         TEXT                                      DEFAULT NULL,
    status         ENUM('Pending','Approved','Rejected')     NOT NULL DEFAULT 'Pending',
    requested_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_by    INT UNSIGNED                              DEFAULT NULL,
    approved_at    DATETIME                                  DEFAULT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id   (user_id),
    INDEX idx_status    (status),
    INDEX idx_requested (requested_at)
);

-- ─── 12. Academic Years ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_years (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    school_id  INT UNSIGNED NOT NULL DEFAULT 1,
    year_label VARCHAR(20)  NOT NULL,
    start_date DATE                  DEFAULT NULL,
    end_date   DATE                  DEFAULT NULL,
    is_current TINYINT(1)   NOT NULL DEFAULT 0,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

INSERT INTO academic_years (id, school_id, year_label, start_date, end_date, is_current)
SELECT * FROM (
    SELECT 1, 1, '2026', '2026-01-01', '2026-12-31', 1 UNION ALL
    SELECT 2, 1, '2025', '2025-01-01', '2025-12-31', 0
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM academic_years LIMIT 1);

-- ─── 13. Terms ────────────────────────────────────────────────────────────────
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
    FOREIGN KEY (school_id)        REFERENCES schools(id)        ON DELETE CASCADE,
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
);

INSERT INTO terms (id, school_id, academic_year_id, term_number, term_name, start_date, end_date, is_current)
SELECT * FROM (
    SELECT 1, 1, 1, 1, 'Term 1', '2026-01-12', '2026-04-10', 1 UNION ALL
    SELECT 2, 1, 1, 2, 'Term 2', '2026-05-11', '2026-08-07', 0 UNION ALL
    SELECT 3, 1, 1, 3, 'Term 3', '2026-09-07', '2026-12-04', 0
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM terms LIMIT 1);

-- ─── 14. Classes ──────────────────────────────────────────────────────────────
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
    SELECT 1, 1, 'Grade 8',  'A', 40 UNION ALL
    SELECT 2, 1, 'Grade 9',  'A', 40 UNION ALL
    SELECT 3, 1, 'Grade 10', 'A', 40 UNION ALL
    SELECT 4, 1, 'Grade 11', 'A', 40 UNION ALL
    SELECT 5, 1, 'Grade 12', 'A', 40
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM classes LIMIT 1);

-- Add FK from students.class_id → classes.id (safe: ALTER IGNORE if already exists)
-- Using a stored procedure trick to make it idempotent without INFORMATION_SCHEMA checks
SET @dbname = DATABASE();
SET @fk = (SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
           WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'students'
             AND COLUMN_NAME = 'class_id' AND REFERENCED_TABLE_NAME = 'classes' LIMIT 1);
SET @stmt = IF(@fk IS NULL,
    'ALTER TABLE students ADD CONSTRAINT fk_students_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL',
    'SELECT ''FK already exists''');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Backfill class_id for existing students where grade/section matches a class
UPDATE students s
JOIN classes c ON CONCAT(c.grade_level, IF(c.stream != '', CONCAT(' ', c.stream), ''))
               = CONCAT(s.grade, IF(s.section != '', CONCAT(' ', s.section), ''))
SET s.class_id = c.id
WHERE s.class_id IS NULL;

-- ─── 15. Subjects ─────────────────────────────────────────────────────────────
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
    SELECT  1, 1, 'MATH', 'Mathematics'         UNION ALL
    SELECT  2, 1, 'ENG',  'English Language'    UNION ALL
    SELECT  3, 1, 'SCI',  'Integrated Science'  UNION ALL
    SELECT  4, 1, 'SOC',  'Social Studies'      UNION ALL
    SELECT  5, 1, 'CRE',  'Christian Religious Education' UNION ALL
    SELECT  6, 1, 'HIST', 'History'             UNION ALL
    SELECT  7, 1, 'GEO',  'Geography'           UNION ALL
    SELECT  8, 1, 'CIV',  'Civic Education'     UNION ALL
    SELECT  9, 1, 'BIO',  'Biology'             UNION ALL
    SELECT 10, 1, 'CHEM', 'Chemistry'           UNION ALL
    SELECT 11, 1, 'PHY',  'Physics'             UNION ALL
    SELECT 12, 1, 'COMP', 'Computer Studies'    UNION ALL
    SELECT 13, 1, 'ART',  'Art & Design'        UNION ALL
    SELECT 14, 1, 'MUS',  'Music'               UNION ALL
    SELECT 15, 1, 'PE',   'Physical Education'
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM subjects LIMIT 1);

-- ─── 16. Teacher Subjects (Assignments) ──────────────────────────────────────
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
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
    UNIQUE KEY uq_assignment (teacher_id, subject_id, class_id, academic_year_id)
);

-- ─── 17. Attendance Sessions ──────────────────────────────────────────────────
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
    FOREIGN KEY (teacher_id)       REFERENCES users(id)           ON DELETE CASCADE,
    FOREIGN KEY (term_id)          REFERENCES terms(id)           ON DELETE CASCADE,
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)  ON DELETE CASCADE
);

-- ─── 18. Attendance Records ───────────────────────────────────────────────────
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

-- ─── 19. Results ──────────────────────────────────────────────────────────────
-- Derived from resultsController.js query column references (no prior SQL file existed).
-- ECZ grading: grade_code 1-9 maps to Distinction/Merit/Credit/Satisfactory/Fail.
CREATE TABLE IF NOT EXISTS results (
    id                  INT UNSIGNED       NOT NULL AUTO_INCREMENT,
    student_id          INT UNSIGNED       NOT NULL,
    subject_id          INT UNSIGNED       NOT NULL,
    teacher_id          INT UNSIGNED       NOT NULL,
    class_id            INT UNSIGNED       NOT NULL,
    term_id             INT UNSIGNED       NOT NULL,
    academic_year_id    INT UNSIGNED       NOT NULL,
    test_mark           DECIMAL(5,2)       NOT NULL DEFAULT 0,
    assignment_mark     DECIMAL(5,2)       NOT NULL DEFAULT 0,
    exam_mark           DECIMAL(5,2)       NOT NULL DEFAULT 0,
    total_marks         DECIMAL(6,2)       NOT NULL DEFAULT 0,
    percentage          DECIMAL(5,2)       NOT NULL DEFAULT 0,
    grade_code          TINYINT UNSIGNED   NOT NULL DEFAULT 9,   -- ECZ 1-9
    grade_classification VARCHAR(50)                DEFAULT NULL, -- e.g. 'Distinction 1'
    remarks             VARCHAR(100)                DEFAULT NULL, -- e.g. 'Outstanding'
    teacher_comment     TEXT                        DEFAULT NULL,
    position            SMALLINT UNSIGNED           DEFAULT NULL, -- class rank for this subject/term
    created_at          TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (student_id)       REFERENCES students(id)       ON DELETE CASCADE,
    FOREIGN KEY (subject_id)       REFERENCES subjects(id)       ON DELETE CASCADE,
    FOREIGN KEY (teacher_id)       REFERENCES users(id)          ON DELETE CASCADE,
    FOREIGN KEY (class_id)         REFERENCES classes(id)        ON DELETE CASCADE,
    FOREIGN KEY (term_id)          REFERENCES terms(id)          ON DELETE CASCADE,
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
    UNIQUE KEY uq_result (student_id, subject_id, term_id, academic_year_id),
    INDEX idx_result_class   (class_id),
    INDEX idx_result_subject (subject_id),
    INDEX idx_result_term    (term_id)
);

-- ─── 20. School Settings (single-row config) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS school_settings (
    id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    school_id           INT UNSIGNED NOT NULL DEFAULT 1,
    school_name         VARCHAR(255)          DEFAULT 'Admin Assist School',
    school_code         VARCHAR(50)           DEFAULT NULL,
    academic_year_label VARCHAR(20)           DEFAULT NULL,
    address             TEXT                  DEFAULT NULL,
    phone               VARCHAR(30)           DEFAULT NULL,
    email               VARCHAR(255)          DEFAULT NULL,
    logo_url            VARCHAR(500)          DEFAULT NULL,
    timezone            VARCHAR(100)          DEFAULT 'Africa/Lusaka',
    date_format         VARCHAR(30)           DEFAULT 'DD/MM/YYYY',
    max_students_per_class INT UNSIGNED       DEFAULT 40,
    grading_system      VARCHAR(20)           DEFAULT 'ECZ',
    notify_on_enrollment TINYINT(1)           DEFAULT 1,
    notify_on_attendance TINYINT(1)           DEFAULT 1,
    notify_on_results    TINYINT(1)           DEFAULT 1,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

INSERT INTO school_settings (school_id, school_name, timezone, grading_system)
SELECT 1, 'Admin Assist School', 'Africa/Lusaka', 'ECZ'
WHERE NOT EXISTS (SELECT 1 FROM school_settings LIMIT 1);

-- ─── 21. Notifications ────────────────────────────────────────────────────────
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

SELECT 'Admin Assist schema applied successfully.' AS status;
