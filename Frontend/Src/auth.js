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
    : "https://admin-assist-api.onrender.com";   // ← update this before deploying

/**
 * getAccessToken()
 * Returns the stored access token or null if the user is not logged in.
 */
function getAccessToken() {
    return sessionStorage.getItem("accessToken") || null;
}

/**
 * getUser()
 * Returns the stored user object or null.
 */
function getUser() {
    try {
        const raw = sessionStorage.getItem("user");
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * clearSession()
 * Wipes the in-memory session. Called on logout or token expiry.
 */
function clearSession() {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("user");
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
    const token = getAccessToken();

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const res = await fetch(url, { ...options, headers, credentials: "include" });

    // Session expired or invalid — clear local state and bounce to login
    if (res.status === 401) {
        clearSession();
        window.location.href = "login.html";
        return;
    }

    return res;
}