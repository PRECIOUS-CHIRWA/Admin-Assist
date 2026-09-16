/**
 * settings.js — Admin Assist Settings Page
 * Wires all 5 setting tabs to real API endpoints.
 *
 * Load order: auth.js → auth-guard.js → navigation.js → settings.js
 */
(function () {
    "use strict";

    /* ── Role-based tab visibility ────────────────────────────────── */
    function _applyRoleTabVisibility() {
        var user = null;
        try { user = JSON.parse(localStorage.getItem("user")); } catch (e) {}
        var role = user && user.role ? user.role : "user";

        // Only admin and headmaster can see General, System, and Notifications tabs
        if (role !== "admin" && role !== "headmaster") {
            var adminOnlyTargets = ["general", "system", "notifications"];
            document.querySelectorAll(".settings-nav-item").forEach(function (btn) {
                var target = btn.dataset.target;
                if (adminOnlyTargets.indexOf(target) !== -1) {
                    btn.style.display = "none";
                }
            });
            document.querySelectorAll(".settings-section").forEach(function (s) {
                if (adminOnlyTargets.indexOf(s.id) !== -1) {
                    s.style.display = "none";
                }
            });

            // Activate Profile tab as the default active tab
            document.querySelectorAll(".settings-nav-item").forEach(function (b) { b.classList.remove("is-active"); });
            document.querySelectorAll(".settings-section").forEach(function (s) { s.classList.remove("is-active"); });
            var profileBtn = document.querySelector(".settings-nav-item[data-target='profile']");
            var profileSection = document.getElementById("profile");
            if (profileBtn) profileBtn.classList.add("is-active");
            if (profileSection) profileSection.classList.add("is-active");
        }
    }

    /* ── Tab switching ────────────────────────────────────────────── */
    document.querySelectorAll(".settings-nav-item").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var target = this.dataset.target;
            document.querySelectorAll(".settings-nav-item").forEach(function (b) { b.classList.remove("is-active"); });
            document.querySelectorAll(".settings-section").forEach(function (s) { s.classList.remove("is-active"); });
            this.classList.add("is-active");
            var section = document.getElementById(target);
            if (section) section.classList.add("is-active");
            if (target === "logs") {
                loadRecentLogs();
            }
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
    function _esc(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /* ── RECENT & FULL LOGS ────────────────────────────────── */
    var _allLogsCurrentPage = 1;
    var _allLogsTotalPages = 1;

    async function loadRecentLogs() {
        var tbody = document.getElementById("settingsLogsBody");
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--aa-text-muted);">Loading recent logs…</td></tr>';

        try {
            var res = await apiFetch("/api/settings/logs?mode=week");
            if (!res || !res.ok) throw new Error("Unable to load activity logs");
            var data = await res.json();
            var logs = data.logs || [];

            if (!logs.length) {
                tbody.innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--aa-text-muted);">No activity recorded this week.</td></tr>';
                return;
            }

            tbody.innerHTML = logs.map(function (log) {
                var timeStr = log.created_at ? new Date(log.created_at).toLocaleString("en-GB", {
                    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                }) : "—";

                var actorStr = log.actor_name || "System";
                var roleBadge = '<span class="aa-badge" style="font-size:11px;text-transform:capitalize;">' + _esc(log.actor_role || "system") + '</span>';
                var actionStr = _esc(log.action_display || log.description || log.action || "Activity");

                return '<tr style="border-bottom: 1px solid var(--aa-border);">' +
                    '<td style="padding: 10px 12px; white-space: nowrap; color: var(--aa-text-muted); font-size: 12px;">' + timeStr + '</td>' +
                    '<td style="padding: 10px 12px; font-weight: 600; color: var(--aa-text);">' + actionStr + '</td>' +
                    '<td style="padding: 10px 12px; color: var(--aa-text);">' + _esc(actorStr) + '</td>' +
                    '<td style="padding: 10px 12px;">' + roleBadge + '</td>' +
                    '</tr>';
            }).join("");
        } catch (err) {
            console.warn("loadRecentLogs:", err.message);
            tbody.innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:#ef4444;">Failed to load logs: ' + _esc(err.message) + '</td></tr>';
        }
    }

    async function loadAllLogs(page) {
        page = Math.max(1, parseInt(page, 10) || 1);
        _allLogsCurrentPage = page;

        var tbody = document.getElementById("fullLogsBody");
        var summaryEl = document.getElementById("allLogsSummary");
        var pageIndicator = document.getElementById("allLogsPageIndicator");
        var prevBtn = document.getElementById("allLogsPrevBtn");
        var nextBtn = document.getElementById("allLogsNextBtn");

        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--aa-text-muted);">Loading audit logs…</td></tr>';

        var search = _val("allLogsSearchInput").trim();
        var fromDate = _val("allLogsFromDate");
        var toDate = _val("allLogsToDate");

        var query = new URLSearchParams({
            mode: "all",
            page: String(page),
            limit: "20"
        });
        if (search) query.append("search", search);
        if (fromDate) query.append("fromDate", fromDate);
        if (toDate) query.append("toDate", toDate);

        try {
            var res = await apiFetch("/api/settings/logs?" + query.toString());
            if (!res || !res.ok) throw new Error("Unable to load audit logs");
            var data = await res.json();
            var logs = data.logs || [];
            var total = data.total || 0;
            _allLogsTotalPages = Math.max(1, data.totalPages || 1);

            if (pageIndicator) pageIndicator.textContent = "Page " + _allLogsCurrentPage + " of " + _allLogsTotalPages;
            if (prevBtn) prevBtn.disabled = _allLogsCurrentPage <= 1;
            if (nextBtn) nextBtn.disabled = _allLogsCurrentPage >= _allLogsTotalPages;

            if (summaryEl) {
                var start = total === 0 ? 0 : (_allLogsCurrentPage - 1) * 20 + 1;
                var end = Math.min(total, _allLogsCurrentPage * 20);
                summaryEl.textContent = "Showing " + start + " to " + end + " of " + total + " logs";
            }

            if (!logs.length) {
                tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--aa-text-muted);">No logs match your filter criteria.</td></tr>';
                return;
            }

            tbody.innerHTML = logs.map(function (log) {
                var timeStr = log.created_at ? new Date(log.created_at).toLocaleString("en-GB", {
                    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                }) : "—";

                var actorStr = log.actor_name || "System";
                var roleBadge = '<span class="aa-badge" style="font-size:11px;text-transform:capitalize;">' + _esc(log.actor_role || "system") + '</span>';
                var actionStr = _esc(log.action_display || log.description || log.action || "Activity");

                var detailsStr = "";
                if (log.details) {
                    if (typeof log.details === "object") {
                        try {
                            detailsStr = Object.entries(log.details)
                                .slice(0, 3)
                                .map(function (pair) { return pair[0] + ": " + pair[1]; })
                                .join(", ");
                        } catch (e) {
                            detailsStr = JSON.stringify(log.details);
                        }
                    } else {
                        detailsStr = String(log.details);
                    }
                }
                if (!detailsStr) detailsStr = "—";

                return '<tr style="border-bottom: 1px solid var(--aa-border);">' +
                    '<td style="padding: 10px 12px; white-space: nowrap; color: var(--aa-text-muted); font-size: 12px;">' + timeStr + '</td>' +
                    '<td style="padding: 10px 12px; font-weight: 600; color: var(--aa-text);">' + actionStr + '</td>' +
                    '<td style="padding: 10px 12px; color: var(--aa-text);">' + _esc(actorStr) + '</td>' +
                    '<td style="padding: 10px 12px;">' + roleBadge + '</td>' +
                    '<td style="padding: 10px 12px; color: var(--aa-text-muted); font-size: 12px; max-width: 300px; word-break: break-word;">' + _esc(detailsStr) + '</td>' +
                    '</tr>';
            }).join("");
        } catch (err) {
            console.warn("loadAllLogs:", err.message);
            tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:#ef4444;">Failed to load logs: ' + _esc(err.message) + '</td></tr>';
        }
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

            if (s.school_name) {
                localStorage.setItem("aa_school_name", s.school_name);
                window.dispatchEvent(new CustomEvent("aa-settings-updated", {
                    detail: { school_name: s.school_name }
                }));
            }
        } catch (err) {
            console.warn("loadSettings:", err.message);
        }
    }

    async function saveGeneral() {
        var btn = document.getElementById("saveGeneralBtn");
        if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
        try {
            var schoolName = _val("schoolName").trim();
            var payload = {
                school_name:         schoolName || undefined,
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

            if (schoolName) {
                localStorage.setItem("aa_school_name", schoolName);
                window.dispatchEvent(new CustomEvent("aa-settings-updated", {
                    detail: { school_name: schoolName }
                }));
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
        _applyRoleTabVisibility();
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

        // Recent Logs & Full Logs controls
        var refreshLogsBtn = document.getElementById("refreshLogsBtn");
        if (refreshLogsBtn) refreshLogsBtn.addEventListener("click", loadRecentLogs);

        var recentLogsContainer = document.getElementById("recentLogsContainer");
        var fullLogsContainer = document.getElementById("fullLogsContainer");

        function showFullLogs() {
            if (recentLogsContainer) recentLogsContainer.style.display = "none";
            if (fullLogsContainer) fullLogsContainer.style.display = "block";
            loadAllLogs(1);
        }
        var openAllLogsBtn = document.getElementById("openAllLogsBtn");
        if (openAllLogsBtn) openAllLogsBtn.addEventListener("click", showFullLogs);

        var openAllLogsLink = document.getElementById("openAllLogsLink");
        if (openAllLogsLink) openAllLogsLink.addEventListener("click", showFullLogs);

        var backToRecentLogsBtn = document.getElementById("backToRecentLogsBtn");
        if (backToRecentLogsBtn) {
            backToRecentLogsBtn.addEventListener("click", function () {
                if (fullLogsContainer) fullLogsContainer.style.display = "none";
                if (recentLogsContainer) recentLogsContainer.style.display = "block";
                loadRecentLogs();
            });
        }

        var allLogsFilterBtn = document.getElementById("allLogsFilterBtn");
        if (allLogsFilterBtn) allLogsFilterBtn.addEventListener("click", function () { loadAllLogs(1); });

        var allLogsResetBtn = document.getElementById("allLogsResetBtn");
        if (allLogsResetBtn) {
            allLogsResetBtn.addEventListener("click", function () {
                _set("allLogsSearchInput", "");
                _set("allLogsFromDate", "");
                _set("allLogsToDate", "");
                loadAllLogs(1);
            });
        }

        var allLogsSearchInput = document.getElementById("allLogsSearchInput");
        if (allLogsSearchInput) {
            allLogsSearchInput.addEventListener("keydown", function (e) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    loadAllLogs(1);
                }
            });
        }

        var allLogsPrevBtn = document.getElementById("allLogsPrevBtn");
        if (allLogsPrevBtn) {
            allLogsPrevBtn.addEventListener("click", function () {
                if (_allLogsCurrentPage > 1) loadAllLogs(_allLogsCurrentPage - 1);
            });
        }

        var allLogsNextBtn = document.getElementById("allLogsNextBtn");
        if (allLogsNextBtn) {
            allLogsNextBtn.addEventListener("click", function () {
                if (_allLogsCurrentPage < _allLogsTotalPages) loadAllLogs(_allLogsCurrentPage + 1);
            });
        }

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

