-- ─── Admin Assist — Railway Schema Apply Script ───────────────────────────────
-- Run this against the Railway MySQL database (named "railway").
-- All statements are idempotent (IF NOT EXISTS) — safe to re-run.
-- Generated: 2026-06-10

USE railway;

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id               INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    name             VARCHAR(100)     NOT NULL,
    email            VARCHAR(255)     NOT NULL,
    password_hash    VARCHAR(255)     NOT NULL,
    role             ENUM('admin','staff','user','headmaster') NOT NULL DEFAULT 'user',
    is_active        TINYINT(1)       NOT NULL DEFAULT 1,
    email_verified   TINYINT(1)       NOT NULL DEFAULT 0,
    email_verified_at DATETIME                 DEFAULT NULL,
    failed_attempts  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until     DATETIME                  DEFAULT NULL,
    last_login_at    DATETIME                  DEFAULT NULL,
    created_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY users_email_unique (email),
    INDEX idx_role           (role),
    INDEX idx_active         (is_active),
    INDEX idx_email_verified (email_verified)
);

-- ─── Email Verification Tokens ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     INT UNSIGNED NOT NULL,
    token_hash  VARCHAR(255) NOT NULL,
    expires_at  DATETIME     NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_email_verification_token_hash (token_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_email_verification_user    (user_id),
    INDEX idx_email_verification_expires (expires_at)
);

-- ─── Refresh Tokens ───────────────────────────────────────────────────────────
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
