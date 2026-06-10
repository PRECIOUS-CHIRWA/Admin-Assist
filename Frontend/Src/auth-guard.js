/**
 * auth-guard.js
 * Include this as the FIRST script on any page that requires a logged-in user.
 * It must come AFTER auth.js since it depends on getAccessToken() and getUser().
 * Any page that loads without a valid token is immediately redirected to login.
 */
(function () {
    const token = getAccessToken();
    const user  = getUser();

    if (!token || !user) {
        // Preserve the page they were trying to reach so login can redirect back
        const intended = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace("login.html?next=" + intended);
    }
})();