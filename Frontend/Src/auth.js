/**
 * auth.js — shared by every page that talks to the backend.
 * Load this BEFORE any page-specific scripts:
 *   <script src="auth.js"></script>
 */

// Switch this to your deployed backend URL before pushing to GitHub Pages.
// During local development it points to localhost.
const API_BASE = window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000/api"
    : "https://admin-assist-api.onrender.com/api";   // ← update this before deploying

/**
 * getAccessToken()
 * Returns the stored access token or null if the user is not logged in.
 */
function getAccessToken() {
    return localStorage.getItem("accessToken") || null;
}

/**
 * getUser()
 * Returns the stored user object or null.
 */
function getUser() {
    try {
        const raw = localStorage.getItem("user");
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * clearSession()
 * Wipes all tokens, cached profiles, and session storage.
 * Called on logout or token expiry.
 */
function clearSession() {
    try {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        localStorage.removeItem("aa_school_name");
        sessionStorage.clear();
    } catch (e) {
        console.warn("clearSession error:", e);
    }
}

/**
 * performLogout()
 * Explicitly terminates server session, clears local storage,
 * and navigates to login with history replace.
 */
async function performLogout() {
    try {
        await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
        // proceed to clear locally even if network fails
    } finally {
        clearSession();
        window.location.replace("login.html");
    }
}

/**
 * authFetch(url, options)
 * A thin wrapper around fetch() that automatically attaches the
 * Authorization header and handles 401 responses by redirecting to login.
 *
 * Usage (same as fetch):
 *   const data = await authFetch("/api/auth/me");
 */
async function authFetch(url, options = {}) {
    if (window.AALoader && typeof window.AALoader.reqStart === "function") {
        window.AALoader.reqStart();
    }
    try {
        const token = getAccessToken();

        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        // Deduplicate any accidental double /api/api/ in URLs
        const cleanUrl = String(url || "").replace(/\/api\/api\//g, "/api/");

        const res = await fetch(cleanUrl, { ...options, headers, credentials: "include" });

        // Session expired or invalid — clear local state and bounce to login
        if (res.status === 401) {
            clearSession();
            window.location.href = "login.html";
            return;
        }

        return res;
    } finally {
        if (window.AALoader && typeof window.AALoader.reqEnd === "function") {
            window.AALoader.reqEnd();
        }
    }
}

/**
 * apiFetch(path, options)
 * Helper to call backend API endpoints.
 * Accepts paths with or without leading '/api' (e.g. '/api/students' or '/students').
 */
async function apiFetch(path, options = {}) {
    let cleanPath = String(path || "");
    if (cleanPath.startsWith("/api/")) {
        cleanPath = cleanPath.slice(4);
    } else if (cleanPath === "/api") {
        cleanPath = "";
    } else if (!cleanPath.startsWith("/")) {
        cleanPath = "/" + cleanPath;
    }
    const base = API_BASE.replace(/\/+$/, "");
    return authFetch(`${base}${cleanPath}`, options);
}
/**
 * requireAuth()
 * Called at the top of every protected page.
 * Redirects to login if there is no valid session in storage.
 * (auth-guard.js does the same as an IIFE, but this function is kept
 * for pages that call it explicitly via DOMContentLoaded handlers.)
 */
function requireAuth() {
    const token = getAccessToken();
    const user = getUser();
    if (!token || !user) {
        const intended = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace("login.html?next=" + intended);
    }
}

// ============================================================================
// Sprint 2: Shared user-context loader
// Fetches real identity from GET /api/auth/me and populates every element
// that carries a data-user-name, data-user-role, or data-user-initials attr.
// Falls back to the locally-stored session object if the fetch fails.
// ============================================================================

/**
 * formatRole(role, user) — converts DB enum values to display labels
 */
function formatRole(role, user) {
    if (user && typeof user === "object") {
        const r = user.role || role;
        const pos = user.school_position || "";
        const isTeacher = !!(user.is_teacher || pos === "Teacher");
        if (r === "admin") return isTeacher ? "Admin & Teacher" : "Administrator";
        if (r === "headmaster" || pos === "Head Teacher") return "Head Teacher";
        if (r === "staff") return pos || "Staff";
        if (r === "user") return "Student";
    }
    const labels = {
        admin: "Administrator",
        headmaster: "Headmaster",
        staff: "Staff",
        user: "Student / Parent",
    };
    return labels[role] || (role ? role.charAt(0).toUpperCase() + role.slice(1) : "");
}

/**
 * getInitials(fullName) — derives two-letter initials from a full name
 */
function getInitials(fullName) {
    if (!fullName) return "?";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * applyUserToDOM(user)
 * Writes name / role / initials into every data-user-* element,
 * plus the legacy id-based elements used by existing pages.
 */
function applyUserToDOM(user) {
    if (!user) return;

    // ── data-attribute pattern (new pages) ──────────────────────────────────
    document.querySelectorAll("[data-user-name]").forEach(el => {
        el.textContent = user.name || user.fullName || "User";
    });
    document.querySelectorAll("[data-user-role]").forEach(el => {
        el.textContent = formatRole(user.role, user);
    });
    document.querySelectorAll("[data-user-initials]").forEach(el => {
        el.textContent = getInitials(user.name || user.fullName || "");
    });

    // ── Legacy id-based pattern (existing pages) ─────────────────────────────
    const nameEl = document.getElementById("headerUserName");
    const avatarEl = document.getElementById("headerAvatar");
    const badgeEl = document.getElementById("roleBadge");

    if (nameEl) nameEl.textContent = user.name || user.fullName || "User";
    if (avatarEl) avatarEl.textContent = getInitials(user.name || user.fullName || "");
    if (badgeEl) {
        badgeEl.textContent = formatRole(user.role, user);
        badgeEl.className = `role-badge ${user.role || ""}`;
    }
}

/**
 * loadCurrentUser()
 * Fetches the real user from the server and hydrates all user-display elements.
 * Falls back to session storage so the page still renders offline.
 */
async function loadCurrentUser() {
    // Immediate fallback from session storage (no flash of "?")
    const cached = getUser();
    if (cached) applyUserToDOM(cached);

    try {
        const res = await apiFetch("/api/auth/me");
        if (!res || !res.ok) return cached || null;
        const data = await res.json();
        const user = data.user;

        // Dynamic session refresh: update token if fresh token returned
        if (data.accessToken) {
            localStorage.setItem("accessToken", data.accessToken);
        }

        // Normalise: ensure both `fullName` and `name` are present so that
        // any consumer (navigation.js, other pages) can read either key.
        user.fullName = user.fullName || user.name || "";
        user.name = user.fullName;

        // Hydrate all data-user-* elements and legacy id-based elements.
        applyUserToDOM(user);

        // Persist back to localStorage so role-based UI keeps working
        // on pages that still call getUser() synchronously.
        const current = getUser() || {};
        localStorage.setItem("user", JSON.stringify({ ...current, ...user }));

        // ── CRITICAL FIX: return the user so callers (.then(user => …))
        // receive the resolved object instead of undefined.
        return user;

    } catch (err) {
        console.warn("loadCurrentUser failed:", err.message);
        return cached || null;
    }
}

/**
 * bindLogout(buttonId?)
 * Attaches the logout click handler to the element with id "logoutBtn"
 * (or a custom id if passed). Prevents duplicating this boilerplate across pages.
 */
function bindLogout(buttonId = "logoutBtn") {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.addEventListener("click", async () => {
        try {
            await apiFetch("/api/auth/logout", { method: "POST" });
        } catch {
            // Clear locally even if network call fails
        } finally {
            clearSession();
            window.location.href = "login.html";
        }
    });
}
