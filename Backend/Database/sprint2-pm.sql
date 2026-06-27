-- ─── Admin Assist — Sprint 2 Profile Migration ────────────────────────────────
-- Adds the role_change_requests table.
-- Safe to re-run: uses IF NOT EXISTS.

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

SELECT 'Sprint 2 profile migration complete.' AS status;