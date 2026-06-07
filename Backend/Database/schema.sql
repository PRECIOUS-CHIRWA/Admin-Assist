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
    email_verified   TINYINT(1)       NOT NULL DEFAULT 1,
    email_verified_at DATETIME                 DEFAULT NULL,

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
    INDEX idx_active   (is_active),
    INDEX idx_email_verified (email_verified)
);

-- ─── Email Verification Tokens ───────────────────────────────────────────────
-- Stores hashes of one-time verification links. Raw email tokens are never saved.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     INT UNSIGNED NOT NULL,
    token_hash  VARCHAR(255) NOT NULL,
    expires_at  DATETIME     NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_email_verification_token_hash (token_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_email_verification_user (user_id),
    INDEX idx_email_verification_expires (expires_at)
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

-- ─── Alter existing table (run only if users table already exists) ────────────
-- If you already have a users table from the old schema, run these ALTER
-- statements individually instead of the CREATE TABLE above:
--
-- ALTER TABLE users
--   MODIFY COLUMN role ENUM('admin','staff','user','headmaster') NOT NULL DEFAULT 'user',
--   ADD COLUMN is_active       TINYINT(1)       NOT NULL DEFAULT 1       AFTER role,
--   ADD COLUMN email_verified  TINYINT(1)       NOT NULL DEFAULT 1       AFTER is_active,
--   ADD COLUMN email_verified_at DATETIME                DEFAULT NULL     AFTER email_verified,
--   ADD COLUMN failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0       AFTER email_verified_at,
--   ADD COLUMN locked_until    DATETIME                  DEFAULT NULL     AFTER failed_attempts,
--   ADD COLUMN last_login_at   DATETIME                  DEFAULT NULL     AFTER locked_until,
--   ADD INDEX  idx_role   (role),
--   ADD INDEX  idx_active (is_active),
--   ADD INDEX  idx_email_verified (email_verified);
