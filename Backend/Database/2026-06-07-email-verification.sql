USE admin_assist_db;

ALTER TABLE users
  ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active,
  ADD COLUMN email_verified_at DATETIME DEFAULT NULL AFTER email_verified,
  ADD INDEX idx_email_verified (email_verified);

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
