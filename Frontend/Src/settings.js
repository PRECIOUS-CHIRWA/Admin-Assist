/**
 * settings.js — Admin Assist Settings Page
 * Wires all 5 setting tabs to real API endpoints.
 *
 * Load order: auth.js → auth-guard.js → navigation.js → settings.js
 */
(function () {
    "use strict";

    /* ── Tab switching ────────────────────────────────────── */
    document.querySelectorAll(".settings-nav-item").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var target = this.dataset.target;
            document.querySelectorAll(".settings-nav-item").forEach(function (b) { b.classList.remove("is-active"); });
            document.querySelectorAll(".settings-section").forEach(function (s) { s.classList.remove("is-active"); });
            this.classList.add("is-active");
            var section = document.getElementById(target);
            if (section) section.classList.add("is-active");
        });
    });

    /* ── Helpers ──────────────────────────────────────────── */
    function _toast(msg, type) {
        var c = document.getElementById("toast-container");
        if (!c) {
            c = document.createElement("div");
            c.id = "toast-container";
            Object.assign(c.style, { position: "fixed", bottom: "24px", right: "24px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px" });
            document.body.appendChild(c);
        }
        var el = document.createElement("div");
        el.style.cssText = "padding:12px 18px;border-radius:8px;font-size:13px;font-weight:500;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.2);max-width:320px;";
        el.style.background = type === "error" ? "#ef4444" : type === "success" ? "#10b981" : "#1B2A4A";
        el.textContent = msg;
        c.appendChild(el);
        setTimeout(function () { el.remove(); }, 4000);
    }

    function _val(id) {
        var el = document.getElementById(id);
        return el ? el.value : "";
    }
    function _set(id, v) {
        var el = document.getElementById(id);
        if (el && v != null) el.value = v;
    }

    /* ── PROFILE TAB ──────────────────────────────────────── */
    async function loadProfile() {
        try {
            var res = await apiFetch("/api/users/profile");
            if (!res || !res.ok) return;
            var data = await res.json();
            var u = data.user || {};
            _set("profileName",  u.name  || u.fullName || "");
            _set("profileEmail", u.email || "");
            _set("profileRole",  u.role  || "");
        } catch (err) {
            console.warn("loadProfile:", err.message);
        }
    }

    async function saveProfile() {
        var btn = document.getElementById("saveProfileBtn");
        if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
        try {
            var name  = _val("profileName").trim();
            var email = _val("profileEmail").trim();
            if (!name || !email) { _toast("Name and email are required.", "error"); return; }
            var res = await apiFetch("/api/users/profile", {
                method: "PUT",
                body: JSON.stringify({ name: name, email: email }),
            });
            if (!res || !res.ok) {
                var d = await res.json().catch(function () { return {}; });
                throw new Error(d.error || "Save failed");
            }
            _toast("Profile saved.", "success");
        } catch (err) {
            _toast(err.message || "Could not save profile.", "error");
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = "Save Profile"; }
        }
    }

    /* ── SECURITY TAB ─────────────────────────────────────── */
    async function savePassword() {
        var btn = document.getElementById("changePasswordBtn");
        if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
        try {
            var current  = _val("currentPassword");
            var newPw    = _val("newPassword");
            var confirm  = _val("confirmPassword");
            if (!current || !newPw || !confirm) { _toast("All password fields are required.", "error"); return; }
            if (newPw !== confirm) { _toast("New passwords do not match.", "error"); return; }
            if (newPw.length < 8) { _toast("Password must be at least 8 characters.", "error"); return; }

            var res = await apiFetch("/api/users/profile/password", {
                method: "PUT",
                body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
            });
            if (!res || !res.ok) {
                var d = await res.json().catch(function () { return {}; });
                throw new Error(d.error || "Password change failed");
            }
            _toast("Password changed successfully.", "success");
            _set("currentPassword", ""); _set("newPassword", ""); _set("confirmPassword", "");
        } catch (err) {
            _toast(err.message || "Could not change password.", "error");
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = "Change Password"; }
        }
    }

    /* ── GENERAL TAB ──────────────────────────────────────── */
    var _cachedSettings = null;

    async function loadSettings() {
        try {
            var res = await apiFetch("/api/settings");
            if (!res || !res.ok) return;
            var data = await res.json();
            var s = data.settings || {};
            _cachedSettings = s;
            _set("schoolName",        s.school_name         || "");
            _set("academicYear",      s.academic_year_label || "");
            _set("schoolDept",        s.department          || "");
            _set("country",           s.country             || "");
            _set("phoneNumber",       s.phone               || "");
            _set("schoolAddress",     s.address             || "");
            _set("timezone",          s.timezone            || "Africa/Lusaka");
            _set("dateFormat",        s.date_format         || "DD/MM/YYYY");
            _set("maxLoginAttempts",  s.max_login_attempts  != null ? s.max_login_attempts : 5);

            var attCheck = document.getElementById("notifyAttendance");
            var enrCheck = document.getElementById("notifyEnrollment");
            var resCheck = document.getElementById("notifyResults");
            var annCheck = document.getElementById("notifyAnnouncements");

            if (attCheck) attCheck.checked = s.notify_on_attendance === 1 || s.notify_on_attendance === true;
            if (enrCheck) enrCheck.checked = s.notify_on_enrollment === 1 || s.notify_on_enrollment === true;
            if (resCheck) resCheck.checked = s.notify_on_results === 1 || s.notify_on_results === true;
            if (annCheck) annCheck.checked = s.notify_on_announcements === 1 || s.notify_on_announcements === true;
        } catch (err) {
            console.warn("loadSettings:", err.message);
        }
    }

    async function saveGeneral() {
        var btn = document.getElementById("saveGeneralBtn");
        if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
        try {
            var payload = {
                school_name:         _val("schoolName").trim() || undefined,
                academic_year_label: _val("academicYear").trim() || undefined,
                department:          _val("schoolDept").trim() || undefined,
                country:             _val("country").trim() || undefined,
                phone:               _val("phoneNumber").trim() || undefined,
                address:             _val("schoolAddress").trim() || undefined,
                timezone:            _val("timezone") || undefined,
            };
            // Remove undefined keys
            Object.keys(payload).forEach(function (k) { if (payload[k] === undefined) delete payload[k]; });
            var res = await apiFetch("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
            if (!res || !res.ok) {
                var d = await res.json().catch(function () { return {}; });
                throw new Error(d.error || "Save failed");
            }
            _toast("General settings saved.", "success");
        } catch (err) {
            _toast(err.message || "Could not save settings.", "error");
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = "Save Changes"; }
        }
    }

    /* ── SYSTEM TAB ───────────────────────────────────────── */
    async function saveSystem() {
        var btn = document.getElementById("saveSystemBtn");
        if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
        try {
            var maxAttempts = parseInt(_val("maxLoginAttempts"), 10);
            var payload = {
                date_format: _val("dateFormat") || undefined,
                max_login_attempts: !isNaN(maxAttempts) ? maxAttempts : undefined,
            };
            Object.keys(payload).forEach(function (k) { if (payload[k] === undefined) delete payload[k]; });
            var res = await apiFetch("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
            if (!res || !res.ok) {
                var d = await res.json().catch(function () { return {}; });
                throw new Error(d.error || "Save failed");
            }
            _toast("System settings saved.", "success");
        } catch (err) {
            _toast(err.message || "Could not save system settings.", "error");
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = "Save System"; }
        }
    }

    /* ── NOTIFICATIONS TAB ────────────────────────────────── */
    async function saveNotifications() {
        var btn = document.getElementById("saveNotifBtn");
        if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
        try {
            var attCheck = document.getElementById("notifyAttendance");
            var enrCheck = document.getElementById("notifyEnrollment");
            var resCheck = document.getElementById("notifyResults");
            var annCheck = document.getElementById("notifyAnnouncements");

            var payload = {
                notify_on_attendance:    attCheck && attCheck.checked ? 1 : 0,
                notify_on_enrollment:    enrCheck && enrCheck.checked ? 1 : 0,
                notify_on_results:       resCheck && resCheck.checked ? 1 : 0,
                notify_on_announcements: annCheck && annCheck.checked ? 1 : 0,
            };

            var res = await apiFetch("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
            if (!res || !res.ok) {
                var d = await res.json().catch(function () { return {}; });
                throw new Error(d.error || "Save failed");
            }
            _toast("Notification preferences saved.", "success");
        } catch (err) {
            _toast(err.message || "Could not save notification preferences.", "error");
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = "Save Notification Preferences"; }
        }
    }

    /* ── THEME & APPEARANCE CONTROLS ─────────────────────── */
    function updateThemeControlsUI() {
        if (typeof window.ThemeManager === "undefined") return;
        var effective = window.ThemeManager.getEffectiveTheme();
        var isSystem = window.ThemeManager.isSystemSync();

        var cardLight = document.getElementById("themeCardLight");
        var cardDark = document.getElementById("themeCardDark");
        var syncToggle = document.getElementById("syncSystemToggle");

        if (cardLight) cardLight.classList.toggle("is-active", effective === "light");
        if (cardDark) cardDark.classList.toggle("is-active", effective === "dark");
        if (syncToggle) syncToggle.checked = isSystem;
    }

    function initThemeControls() {
        if (typeof window.ThemeManager === "undefined") return;

        updateThemeControlsUI();

        var cardLight = document.getElementById("themeCardLight");
        if (cardLight) {
            cardLight.addEventListener("click", function () {
                window.ThemeManager.setTheme("light", false);
                updateThemeControlsUI();
                _toast("Theme switched to Light mode.", "info");
            });
        }

        var cardDark = document.getElementById("themeCardDark");
        if (cardDark) {
            cardDark.addEventListener("click", function () {
                window.ThemeManager.setTheme("dark", false);
                updateThemeControlsUI();
                _toast("Theme switched to Dark mode.", "info");
            });
        }

        var syncToggle = document.getElementById("syncSystemToggle");
        if (syncToggle) {
            syncToggle.addEventListener("change", function () {
                var checked = this.checked;
                window.ThemeManager.setTheme(checked ? "system" : window.ThemeManager.getEffectiveTheme(), checked);
                updateThemeControlsUI();
                _toast(checked ? "Theme set to sync with system." : "System sync disabled.", "info");
            });
        }

        window.addEventListener("aa-theme-change", function () {
            updateThemeControlsUI();
        });
    }

    /* ── Event binding ────────────────────────────────────── */
    document.addEventListener("DOMContentLoaded", function () {
        loadProfile();
        loadSettings();
        initThemeControls();

        // Profile
        var saveProfileBtn = document.getElementById("saveProfileBtn");
        if (saveProfileBtn) saveProfileBtn.addEventListener("click", saveProfile);

        // Security
        var changePasswordBtn = document.getElementById("changePasswordBtn");
        if (changePasswordBtn) changePasswordBtn.addEventListener("click", savePassword);

        // General
        var saveGeneralBtn = document.getElementById("saveGeneralBtn");
        if (saveGeneralBtn) saveGeneralBtn.addEventListener("click", saveGeneral);

        // System
        var saveSystemBtn = document.getElementById("saveSystemBtn");
        if (saveSystemBtn) saveSystemBtn.addEventListener("click", saveSystem);

        // Notifications
        var saveNotifBtn = document.getElementById("saveNotifBtn");
        if (saveNotifBtn) saveNotifBtn.addEventListener("click", saveNotifications);

        // Discard buttons — reload from cache
        document.querySelectorAll(".btn-secondary[data-discard]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var panel = btn.dataset.discard;
                if (panel === "general" || panel === "notifications") loadSettings();
                if (panel === "profile") loadProfile();
            });
        });
    });

})();

