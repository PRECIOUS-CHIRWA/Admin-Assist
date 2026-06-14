CREATE DATABASE IF NOT EXISTS admin_assist_db;
USE admin_assist_db;

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id               INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    name             VARCHAR(100)     NOT NULL,
    email            VARCHAR(255)     NOT NULL,
    password_hash    VARCHAR(255)     NOT NULL,

    -- CHANGED: ENUM instead of VARCHAR — invalid roles are rejected by the DB itself
    role             ENUM('admin','staff','user','headmaster') NOT NULL DEFAULT 'user',

    -- NEW: soft-disable accounts without deleting them
    is_active        TINYINT(1)       NOT NULL DEFAULT 1,

    -- NEW: brute-force lockout columns
    failed_attempts  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until     DATETIME                  DEFAULT NULL,

    -- NEW: audit trail
    last_login_at    DATETIME                  DEFAULT NULL,

    created_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY users_email_unique (email),
    INDEX idx_role     (role),
    INDEX idx_active   (is_active)
);

-- ─── Refresh Tokens ───────────────────────────────────────────────────────────
-- Stores hashed refresh tokens so they can be revoked per-device or on logout.
-- The raw token is never stored — only its SHA-256 hash.
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
    INDEX idx_grade (grade),
    INDEX idx_status (status),
    INDEX idx_name (last_name, first_name)
);
-- ─── Alter existing table (run only if users table already exists) ────────────
-- If you already have a users table from the old schema, run these ALTER
-- statements individually instead of the CREATE TABLE above:
--
-- ALTER TABLE users
--   MODIFY COLUMN role ENUM('admin','staff','user','headmaster') NOT NULL DEFAULT 'user',
--   ADD COLUMN is_active       TINYINT(1)       NOT NULL DEFAULT 1       AFTER role,
--   ADD COLUMN failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0       AFTER is_active,
--   ADD COLUMN locked_until    DATETIME                  DEFAULT NULL     AFTER failed_attempts,
--   ADD COLUMN last_login_at   DATETIME                  DEFAULT NULL     AFTER locked_until,
--   ADD INDEX  idx_role   (role),
--   ADD INDEX  idx_active (is_active);