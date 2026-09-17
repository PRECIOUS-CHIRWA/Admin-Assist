/**
 * login.js — Admin Assist Authentication Controller
 * Handles password visibility, credentials submission, error feedback,
 * token persistence, and role-based / return-URL redirection.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", function () {
        const loginForm = document.getElementById("loginForm");
        const emailInput = document.getElementById("email");
        const passwordInput = document.getElementById("password");
        const togglePwBtn = document.getElementById("togglePw");
        const loginBtn = document.getElementById("loginBtn");
        const banner = document.getElementById("error-banner");
        const rememberCheckbox = document.querySelector('input[name="remember"]');

        // Pre-fill remembered email if present
        const rememberedEmail = localStorage.getItem("aa_remember_email");
        if (rememberedEmail && emailInput) {
            emailInput.value = rememberedEmail;
            if (rememberCheckbox) rememberCheckbox.checked = true;
        }

        // 1. Password reveal toggle
        if (togglePwBtn && passwordInput) {
            togglePwBtn.addEventListener("click", function () {
                const isHidden = passwordInput.type === "password";
                passwordInput.type = isHidden ? "text" : "password";
                togglePwBtn.textContent = isHidden ? "🙈" : "👁";
                togglePwBtn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
            });
        }

        // 2. Banner helper
        function showError(message) {
            if (!banner) return;
            banner.textContent = message;
            banner.classList.add("visible");
        }

        function clearError() {
            if (!banner) return;
            banner.textContent = "";
            banner.classList.remove("visible");
        }

        // 3. Form submission
        if (loginForm) {
            loginForm.addEventListener("submit", async function (e) {
                e.preventDefault();
                clearError();

                const email = emailInput ? emailInput.value.trim() : "";
                const password = passwordInput ? passwordInput.value : "";

                if (!email || !password) {
                    showError("Please enter your email or admission number and password.");
                    return;
                }

                if (loginBtn) {
                    loginBtn.disabled = true;
                    loginBtn.textContent = "Signing in…";
                }

                // Show login-specific loader with full blur/opaque background
                if (window.AALoader && window.AALoader.showLoginLoader) {
                    window.AALoader.showLoginLoader("Authenticating…");
                } else if (window.AALoader) {
                    window.AALoader.showPageLoader("Authenticating…");
                }

                try {
                    const endpoint = typeof API_BASE !== "undefined"
                        ? `${API_BASE.replace(/\/+$/, "")}/auth/login`
                        : "/api/auth/login";

                    const res = await fetch(endpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ email, password }),
                    });

                    const data = await res.json().catch(() => ({}));

                    if (!res.ok) {
                        throw new Error(data.error || "Invalid email or password");
                    }

                    // Store access token and user profile
                    localStorage.setItem("accessToken", data.accessToken);
                    localStorage.setItem("user", JSON.stringify(data.user));

                    if (window.AALoader && window.AALoader.showLoginLoader) {
                        window.AALoader.showLoginLoader("Entering Admin Assist…");
                    }

                    // Remember Me handling
                    if (rememberCheckbox && rememberCheckbox.checked) {
                        localStorage.setItem("aa_remember_email", email);
                    } else {
                        localStorage.removeItem("aa_remember_email");
                    }

                    // Redirection: respect "next" query parameter or route to role default
                    const urlParams = new URLSearchParams(window.location.search);
                    const nextUrl = urlParams.get("next");
                    const isStudent = data.user && data.user.role === "user";

                    if (nextUrl && !nextUrl.startsWith("http") && !nextUrl.startsWith("//")) {
                        const decodedNext = decodeURIComponent(nextUrl);
                        if (!isStudent || decodedNext.includes("student-transcript.html") || decodedNext.includes("settings.html")) {
                            window.location.href = decodedNext;
                            return;
                        }
                    }

                    // Default route: Student goes to transcript; staff and admin go to dashboard
                    window.location.href = isStudent ? "student-transcript.html" : "dashboard.html";

                } catch (err) {
                    if (window.AALoader) {
                        window.AALoader.hidePageLoader();
                    }
                    if (document.body) {
                        document.body.classList.remove("aa-page-loading");
                    }
                    showError(err.message || "Unable to sign in. Please verify your credentials.");
                } finally {
                    if (loginBtn) {
                        loginBtn.disabled = false;
                        loginBtn.textContent = "Login";
                    }
                }
            });
        }
    });
})();