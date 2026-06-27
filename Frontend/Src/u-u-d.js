/**
 * update-user-details.js
 * Profile management page logic.
 *
 * Handles:
 *  1. Load and display the authenticated user's profile from GET /api/users/profile
 *  2. Update name and email via PUT /api/users/profile
 *  3. Change password via PUT /api/users/profile/password
 *  4. Load any existing role change request
 *  5. Submit a role change request via POST /api/users/profile/role-request
 *  6. Password field visibility toggles
 *  7. Sign-out from this page
 *
 * Load order: auth.js → auth-guard.js → navigation.js → THIS FILE
 */

/* === Sprint 2: User Profile Management === */

document.addEventListener("DOMContentLoaded", () => {

    // ── Auth guard ─────────────────────────────────────────────────────────────
    requireAuth();

    // ── Bootstrap ─────────────────────────────────────────────────────────────
    _loadProfile();
    _loadRoleRequest();
    _wirePasswordToggles();
    _wireProfileForm();
    _wirePasswordForm();
    _wireRoleRequestForm();
    _wireSignOut();
});

// ─── Load profile ─────────────────────────────────────────────────────────────

async function _loadProfile() {
    try {
        const res = await authFetch(`${API_BASE}/users/profile`);
        if (!res || !res.ok) throw new Error("Could not load profile");

        const { user } = await res.json();

        const fullName = user.fullName || user.name || "User";
        const role = user.role || "user";

        // ── Large avatar at top of page ───────────────────────────────────────
        const pageAvatar = document.getElementById("pageAvatar");
        if (pageAvatar) pageAvatar.textContent = _getInitials(fullName);

        const pageName = document.getElementById("pageName");
        if (pageName) pageName.textContent = fullName;

        const pageRole = document.getElementById("pageRole");
        if (pageRole) pageRole.textContent = _formatRole(role);

        const pageEmail = document.getElementById("pageEmail");
        if (pageEmail) pageEmail.textContent = user.email || "";

        // ── Pre-fill editable form fields ─────────────────────────────────────
        const nameInput = document.getElementById("profileName");
        const emailInput = document.getElementById("profileEmail");
        if (nameInput) nameInput.value = fullName;
        if (emailInput) emailInput.value = user.email || "";

        // ── Read-only fields ──────────────────────────────────────────────────
        _setText("profileCurrentRole", _formatRole(role));
        _setText("profileCreatedAt",
            user.created_at
                ? new Date(user.created_at).toLocaleDateString(undefined, {
                    day: "numeric", month: "long", year: "numeric"
                })
                : "—"
        );
        _setText("profileLastLogin",
            user.last_login_at
                ? new Date(user.last_login_at).toLocaleString()
                : "No login recorded"
        );

        // Remove the current role from the role request dropdown
        const roleSelect = document.getElementById("requestedRole");
        if (roleSelect) {
            Array.from(roleSelect.options).forEach(opt => {
                if (opt.value === role) opt.remove();
            });
        }

    } catch (err) {
        _showBanner("Could not load profile: " + err.message, "error");
    }
}

// ─── Load existing role request ───────────────────────────────────────────────

async function _loadRoleRequest() {
    try {
        const res = await authFetch(`${API_BASE}/users/profile/role-request`);
        if (!res || !res.ok) return;

        const request = await res.json();
        if (!request) return;

        const box = document.getElementById("pendingRequestBox");
        const detail = document.getElementById("pendingRequestDetail");
        if (!box || !detail) return;

        box.style.display = "";

        const statusClass = {
            Pending: "status-pending",
            Approved: "status-approved",
            Rejected: "status-rejected",
        }[request.status] || "";

        detail.innerHTML =
            `Requesting: <strong>${_formatRole(request.requested_role)}</strong> &nbsp;` +
            `<span class="request-status ${statusClass}">${request.status}</span>` +
            `<br><small>Submitted: ${new Date(request.requested_at).toLocaleString()}</small>`;

        // If there's a pending request, disable the role request form
        if (request.status === "Pending") {
            const form = document.getElementById("roleRequestForm");
            if (form) {
                form.querySelectorAll("input, select, textarea, button").forEach(el => {
                    el.disabled = true;
                });
            }
        }
    } catch {
        // Silently ignore — role request history is non-critical
    }
}

// ─── Profile form (name + email) ─────────────────────────────────────────────

function _wireProfileForm() {
    const form = document.getElementById("profileForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        _clearErrors();
        _hideBanner();

        const name = document.getElementById("profileName")?.value.trim() || "";
        const email = document.getElementById("profileEmail")?.value.trim() || "";

        let valid = true;
        if (!name) {
            _showError("err-profileName", "Full name is required");
            valid = false;
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            _showError("err-profileEmail", "A valid email address is required");
            valid = false;
        }
        if (!valid) return;

        const btn = document.getElementById("saveProfileBtn");
        _setLoading(btn, "Saving…");

        try {
            const res = await authFetch(`${API_BASE}/users/profile`, {
                method: "PUT",
                body: JSON.stringify({ name, email }),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Update failed");

            // Update the header and sidebar immediately
            if (typeof loadCurrentUser === "function") loadCurrentUser();

            // Update the page header display
            const fullName = name;
            _setText("pageAvatar", _getInitials(fullName));
            _setText("pageName", fullName);
            _setText("pageEmail", email);

            _showBanner("Profile updated successfully.", "success");

        } catch (err) {
            _showBanner(err.message, "error");
        } finally {
            _setLoading(btn, "Save Changes", false);
        }
    });
}

// ─── Password form ────────────────────────────────────────────────────────────

function _wirePasswordForm() {
    const form = document.getElementById("passwordForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        _clearErrors();
        _hideBanner();

        const currentPassword = document.getElementById("currentPassword")?.value || "";
        const newPassword = document.getElementById("newPassword")?.value || "";
        const confirmPassword = document.getElementById("confirmPassword")?.value || "";

        let valid = true;

        if (!currentPassword) {
            _showError("err-currentPassword", "Current password is required");
            valid = false;
        }
        if (!newPassword || newPassword.length < 8) {
            _showError("err-newPassword", "New password must be at least 8 characters");
            valid = false;
        }
        if (newPassword !== confirmPassword) {
            _showError("err-confirmPassword", "Passwords do not match");
            valid = false;
        }
        if (currentPassword && newPassword && currentPassword === newPassword) {
            _showError("err-newPassword", "New password must differ from the current one");
            valid = false;
        }
        if (!valid) return;

        const btn = document.getElementById("changePasswordBtn");
        _setLoading(btn, "Updating…");

        try {
            const res = await authFetch(`${API_BASE}/users/profile/password`, {
                method: "PUT",
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Password change failed");

            form.reset();
            _showBanner(
                "Password changed successfully. You will be signed out in 3 seconds.",
                "success"
            );

            // Sign out after 3 s so the user logs back in with the new password
            setTimeout(async () => {
                try { await authFetch(`${API_BASE}/auth/logout`, { method: "POST" }); } catch { }
                clearSession();
                window.location.href = "login.html";
            }, 3000);

        } catch (err) {
            _showBanner(err.message, "error");
        } finally {
            _setLoading(btn, "Update Password", false);
        }
    });
}

// ─── Role request form ────────────────────────────────────────────────────────

function _wireRoleRequestForm() {
    const form = document.getElementById("roleRequestForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        _clearErrors();
        _hideBanner();

        const requestedRole = document.getElementById("requestedRole")?.value || "";
        const reason = document.getElementById("roleReason")?.value.trim() || "";

        if (!requestedRole) {
            _showError("err-requestedRole", "Please select a role to request");
            return;
        }

        const btn = document.getElementById("submitRoleRequestBtn");
        _setLoading(btn, "Submitting…");

        try {
            const res = await authFetch(`${API_BASE}/users/profile/role-request`, {
                method: "POST",
                body: JSON.stringify({ requestedRole, reason }),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || "Request failed");

            form.reset();
            _showBanner(data.message, "success");

            // Reload to show the pending request status box
            setTimeout(() => _loadRoleRequest(), 800);

        } catch (err) {
            _showBanner(err.message, "error");
        } finally {
            _setLoading(btn, "Submit Request", false);
        }
    });
}

// ─── Password visibility toggles ─────────────────────────────────────────────

function _wirePasswordToggles() {
    document.querySelectorAll(".pw-toggle-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;

            const isHidden = input.type === "password";
            input.type = isHidden ? "text" : "password";
            btn.textContent = isHidden ? "🙈" : "👁";
            btn.setAttribute("aria-label",
                isHidden ? `Hide ${targetId} password` : `Show ${targetId} password`
            );
        });
    });
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

function _wireSignOut() {
    const btn = document.getElementById("profileSignOutBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        try { await authFetch(`${API_BASE}/auth/logout`, { method: "POST" }); } catch { }
        clearSession();
        window.location.href = "login.html";
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function _showError(spanId, message) {
    const span = document.getElementById(spanId);
    if (span) { span.textContent = message; span.style.display = "block"; }
}

function _clearErrors() {
    document.querySelectorAll(".field-error").forEach(el => {
        el.textContent = ""; el.style.display = "none";
    });
}

function _showBanner(message, type = "info") {
    const banner = document.getElementById("profileBanner");
    if (!banner) return;
    banner.textContent = message;
    banner.className = `profile-banner profile-banner--${type} profile-banner--visible`;
    // Auto-hide success banners after 5 s
    if (type === "success") {
        setTimeout(_hideBanner, 5000);
    }
}

function _hideBanner() {
    const banner = document.getElementById("profileBanner");
    if (banner) { banner.className = "profile-banner"; banner.textContent = ""; }
}

function _setLoading(btn, label, loading = true) {
    if (!btn) return;
    btn.textContent = label;
    btn.disabled = loading;
}

function _getInitials(name) {
    return String(name || "")
        .split(" ")
        .filter(Boolean)
        .map(n => n.charAt(0).toUpperCase())
        .slice(0, 2)
        .join("");
}

function _formatRole(role) {
    const map = {
        admin: "Administrator",
        headmaster: "Head Master",
        staff: "Staff",
        user: "User",
    };
    return map[role] || (role ? role.charAt(0).toUpperCase() + role.slice(1) : "");
}