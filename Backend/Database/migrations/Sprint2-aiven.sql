-- ─── Admin Assist — Sprint 2 Migration for Aiven ──────────────────────────────
-- Safe to re-run: all statements use IF NOT EXISTS.
-- Run in Aiven's Query Editor or via a MySQL client connected to defaultdb.

-- ─── Ensure core Sprint 1 tables exist (idempotent) ──────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id               INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    name             VARCHAR(100)     NOT NULL,
    email            VARCHAR(255)     NOT NULL,
    password_hash    VARCHAR(255)     NOT NULL,
    role             ENUM('admin','staff','user','headmaster') NOT NULL DEFAULT 'user',
    is_active        TINYINT(1)       NOT NULL DEFAULT 1,
    email_verified   TINYINT(1)       NOT NULL DEFAULT 1,
    email_verified_at DATETIME                DEFAULT NULL,
    failed_attempts  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until     DATETIME                 DEFAULT NULL,
    last_login_at    DATETIME                 DEFAULT NULL,
    created_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY users_email_unique (email),
    INDEX idx_role           (role),
    INDEX idx_active         (is_active),
    INDEX idx_email_verified (email_verified)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     INT UNSIGNED NOT NULL,
    token_hash  VARCHAR(255) NOT NULL,
    expires_at  DATETIME     NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_token_hash (token_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id)
);

-- ─── Students ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
    id                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
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
    INDEX idx_grade  (grade),
    INDEX idx_status (status),
    INDEX idx_name   (last_name, first_name)
);

-- ─── Sprint 2: Audit Log ──────────────────────────────────────────────────────
-- Records every significant action for the Recent Activity feed on the dashboard.
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
    INDEX idx_actor     (actor_id),
    INDEX idx_created   (created_at),
    INDEX idx_entity    (entity_type, entity_id)
);

-- ─── Sprint 2: Grading Scale ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grading_scales (
    id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    grade    CHAR(2)      NOT NULL,
    min_mark TINYINT UNSIGNED NOT NULL,
    max_mark TINYINT UNSIGNED NOT NULL,
    label    VARCHAR(50)       DEFAULT NULL,
    points   DECIMAL(3,1)      DEFAULT NULL,
    PRIMARY KEY (id)
);

-- Seed default Zambian ECZ grading scale (only if table is empty)
INSERT INTO grading_scales (grade, min_mark, max_mark, label, points)
SELECT * FROM (
    SELECT 'A', 80, 100, 'Distinction',    6.0 UNION ALL
    SELECT 'B', 70,  79, 'Merit',          5.0 UNION ALL
    SELECT 'C', 60,  69, 'Credit',         4.0 UNION ALL
    SELECT 'D', 50,  59, 'Satisfactory',   3.0 UNION ALL
    SELECT 'E', 40,  49, 'Pass',           2.0 UNION ALL
    SELECT 'F',  0,  39, 'Fail',           1.0
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM grading_scales LIMIT 1);

-- ─── Sprint 2: Moderation Checklist ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS moderation_checklists (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    item        TEXT         NOT NULL,
    is_required TINYINT(1)   DEFAULT 1,
    term        ENUM('Term 1','Term 2','Term 3') NOT NULL DEFAULT 'Term 1',
    PRIMARY KEY (id)
);

INSERT INTO moderation_checklists (item, is_required, term)
SELECT * FROM (
    SELECT 'Verify all students on the class list have scores recorded',              1, 'Term 1' UNION ALL
    SELECT 'Check that no score exceeds the maximum allowed for each component',      1, 'Term 1' UNION ALL
    SELECT 'Confirm department head has reviewed and initialled the gradebook',       1, 'Term 1' UNION ALL
    SELECT 'Ensure absent learners are marked with an approved absence code',         1, 'Term 1' UNION ALL
    SELECT 'Remove any entries for transferred or withdrawn students',                1, 'Term 1'
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM moderation_checklists LIMIT 1);

-- ─── Sprint 2: Teacher Notes ─────────────────────────────────────────────────
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

-- ─── Done ─────────────────────────────────────────────────────────────────────
SELECT 'Sprint 2 migration complete.' AS status;