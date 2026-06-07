function getReturnPath() {
    return window.location.pathname.split("/").pop() + window.location.search + window.location.hash;
}

function redirectToLogin() {
    const next = encodeURIComponent(getReturnPath());
    window.location.replace(`login.html?next=${next}`);
}

function requireAuthenticatedPage() {
    const token = getAccessToken();
    const user = getUser();

    if (token && user) return user;

    clearSession();
    redirectToLogin();
    return null;
}

function requireRole(...allowedRoles) {
    const user = requireAuthenticatedPage();
    if (!user) return null;

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        window.location.replace("dashboard.html");
        return null;
    }

    return user;
}

function withAuthenticatedPage(pageInit, options = {}) {
    const roles = Array.isArray(options.roles) ? options.roles : [];
    const user = roles.length > 0 ? requireRole(...roles) : requireAuthenticatedPage();

    if (!user || typeof pageInit !== "function") return;
    pageInit(user);
}
