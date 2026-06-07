/**
 * auth-guard.js
 * Protects dashboard and admin pages from unauthorized access.
 * Run this FIRST in your page, before other scripts that need user data.
 * 
 * Include in your page like:
 *   <script src="auth.js"></script>
 *   <script src="auth-guard.js"></script>
 */

/**
 * requireAuthenticatedPage()
 * Checks if user is logged in. If NOT, redirects to login immediately.
 * Returns the user object if authenticated, null otherwise.
 */
function requireAuthenticatedPage() {
    const token = localStorage.getItem("accessToken");
    const userRaw = localStorage.getItem("user");
    
    // No token or user data → not logged in
    if (!token || !userRaw) {
        redirectToLogin();
        return null;
    }
    
    // Parse user object
    let user = null;
    try {
        user = JSON.parse(userRaw);
    } catch {
        // Corrupted user data → clear and redirect
        clearSession();
        redirectToLogin();
        return null;
    }
    
    return user;
}

/**
 * redirectToLogin()
 * Redirects to login page, preserving the current URL as "next" parameter
 * so we can redirect back after login.
 */
function redirectToLogin() {
    const currentPath = window.location.pathname.split("/").pop() + 
                       window.location.search + 
                       window.location.hash;
    const nextUrl = encodeURIComponent(currentPath);
    window.location.href = `login.html?next=${nextUrl}`;
}

/**
 * requireRole(...allowedRoles)
 * Checks if user is authenticated AND has one of the allowed roles.
 * Usage: requireRole("admin", "headmaster") → only admins and headmasters pass
 */
function requireRole(...allowedRoles) {
    const user = requireAuthenticatedPage();
    if (!user) return null;
    
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        // User doesn't have required role → redirect to dashboard
        window.location.href = "dashboard.html";
        return null;
    }
    
    return user;
}

// ─── RUN ON PAGE LOAD ──────────────────────────────────
// This ensures the page is protected as soon as it starts loading
const currentUser = requireAuthenticatedPage();
