/**
 * navigation.js
 * Shared initialisation for every protected page.
 * Handles: user display (fast + accurate), RBAC visibility, logout, sidebar toggle.
 *
 * Load on every protected page, AFTER auth.js + auth-guard.js,
 * BEFORE any page-specific script.
 */

/* === Sprint 2 Additions: Shared Navigation === */

document.addEventListener("DOMContentLoaded", () => {

    // ── Step 1: Synchronous auth check ────────────────────────────────────────
    // auth-guard.js already checks this via an IIFE, but a second check here
    // catches any edge case where guard.js was accidentally omitted.
    requireAuth();

    // ── Step 2: Fast display from localStorage ────────────────────────────────
    // Show user info immediately so the header doesn't flash "?" while the API
    // call is in flight. Think of it as a "placeholder with real data".
    const storedUser = getUser();
    if (storedUser) {
        _quickDisplay(storedUser);
        _applyRbac(storedUser.role);
    }

    // ── Step 3: Accurate display from the API ─────────────────────────────────
    // loadCurrentUser() is defined in auth.js. It calls GET /api/auth/me and
    // updates the same elements with fresh server data.
    loadCurrentUser().then(user => {
        if (user) _applyRbac(user.role);
    });

    // ── Step 4: Logout button ─────────────────────────────────────────────────
    // Any element with id="logoutBtn" on ANY page gets this handler automatically.
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn && !logoutBtn.dataset.wired) {
        logoutBtn.dataset.wired = "true";  // prevents double-wiring if this runs twice
        logoutBtn.addEventListener("click", async () => {
            try {
                await authFetch(`${API_BASE}/auth/logout`, { method: "POST" });
            } catch { /* clear locally even if the network call fails */ }
            finally {
                clearSession();
                window.location.href = "login.html";
            }
        });
    }

    // ── Step 5: Sidebar toggle ────────────────────────────────────────────────
    // Defensive: only runs if the page actually has a sidebar in its HTML.
    // Future pages that add a sidebar will automatically get toggle behaviour.
    const toggle = document.querySelector(".topbar__menu-toggle");
    const sidebar = document.getElementById("sidebar");
    const layout = document.querySelector(".layout");

    if (toggle && sidebar) {
        const PREF_KEY = "sidebar-collapsed";

        toggle.addEventListener("click", () => {
            const shouldCollapse = !sidebar.classList.contains("sidebar--collapsed");
            localStorage.setItem(PREF_KEY, String(shouldCollapse));
            _setSidebarState(toggle, sidebar, layout, shouldCollapse);
        });

        // Restore previous preference on page load
        _setSidebarState(
            toggle, sidebar, layout,
            localStorage.getItem(PREF_KEY) === "true"
        );

        // Close sidebar on Escape (useful on mobile where sidebar overlays content)
        document.addEventListener("keydown", e => {
            if (e.key === "Escape" && sidebar.classList.contains("sidebar--open")) {
                sidebar.classList.remove("sidebar--open");
            }
        });
    }
});

// ─── Private helpers ─────────────────────────────────────────────────────────

/**
 * _quickDisplay(user)
 * Populates header elements from localStorage data synchronously.
 * This is the "fast path" before the API responds.
 */
function _quickDisplay(user) {
    const fullName = user.fullName || user.name || "User";
    const role = user.role || "user";
    const firstName = fullName.split(" ")[0];

    const nameEl = document.getElementById("headerUserName");
    if (nameEl) nameEl.textContent = fullName;

    const avatarEl = document.getElementById("headerAvatar");
    if (avatarEl) avatarEl.textContent = (firstName.charAt(0) || "?").toUpperCase();

    const badgeEl = document.getElementById("roleBadge");
    if (badgeEl) {
        badgeEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        badgeEl.className = `role-badge ${role}`;
    }

    const welcomeEl = document.getElementById("welcomeTitle");
    if (welcomeEl) welcomeEl.textContent = `Welcome, ${firstName}!`;
}

/**
 * _applyRbac(role)
 * Shows .admin-only elements for privileged roles, hides them for others.
 * Called twice: once from localStorage (fast), once from API (accurate).
 */
function _applyRbac(role) {
    const isPrivileged = role === "admin" || role === "headmaster";
    document.querySelectorAll(".admin-only").forEach(el => {
        el.style.display = isPrivileged ? "" : "none";
    });
}

/**
 * _setSidebarState(toggle, sidebar, layout, collapsed)
 * Toggles the collapsed classes on the sidebar and grid layout,
 * and updates the aria-expanded attribute on the toggle button.
 */
function _setSidebarState(toggle, sidebar, layout, collapsed) {
    sidebar.classList.toggle("sidebar--collapsed", collapsed);
    if (layout) layout.classList.toggle("layout--sidebar-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
}