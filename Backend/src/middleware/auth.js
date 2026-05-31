/**
 * auth.js — shared by every page that talks to the backend.
 * Load this BEFORE any page-specific scripts.
 *
 * BEFORE DEPLOYING:
 * Replace "https://your-backend-url.onrender.com" with your actual Render URL.
 * It will look like: https://admin-assist-api.onrender.com
 */
const API_BASE = window.location.hostname === "localhost" ||
                 window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000/api"
    : "https://your-backend-url.onrender.com/api";  // ← REPLACE THIS

function getAccessToken() {
    return sessionStorage.getItem("accessToken") || null;
}

function getUser() {
    try {
        const raw = sessionStorage.getItem("user");
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function clearSession() {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("user");
}

async function authFetch(url, options = {}) {
    const token = getAccessToken();
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const res = await fetch(url, { ...options, headers, credentials: "include" });
    if (res.status === 401) {
        clearSession();
        window.location.href = "login.html";
        return;
    }
    return res;
}