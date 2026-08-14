(function () {
    "use strict";

    var banner  = document.getElementById("form-banner");
    var form    = document.getElementById("resetForm");
    var resetBtn = document.getElementById("resetBtn");

    function showBanner(msg, type) {
        banner.textContent = msg;
        banner.className = "error-banner " + (type === "success" ? "success-banner" : "");
        banner.style.display = "block";
    }

    // Toggle visibility for both password fields
    ["togglePw1", "togglePw2"].forEach(function (id, i) {
        var btn = document.getElementById(id);
        var field = document.getElementById(i === 0 ? "newPassword" : "confirmPassword");
        if (btn && field) {
            btn.addEventListener("click", function () {
                field.type = field.type === "password" ? "text" : "password";
            });
        }
    });

    // Extract token from URL
    var token = new URLSearchParams(window.location.search).get("token");

    if (!token) {
        showBanner("Invalid or missing reset token. Please request a new password reset link.", "error");
        if (resetBtn) resetBtn.disabled = true;
    }

    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        banner.style.display = "none";

        var newPassword = document.getElementById("newPassword").value;
        var confirmPassword = document.getElementById("confirmPassword").value;

        if (!newPassword || newPassword.length < 8) {
            showBanner("Password must be at least 8 characters.", "error"); return;
        }
        if (newPassword !== confirmPassword) {
            showBanner("Passwords do not match.", "error"); return;
        }

        resetBtn.disabled = true;
        resetBtn.textContent = "Resetting…";

        try {
            var res = await fetch(API_BASE + "/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: token, newPassword: newPassword }),
            });
            var data = await res.json().catch(function () { return {}; });
            if (res.ok) {
                showBanner(data.message || "Password reset successfully. Redirecting to login…", "success");
                setTimeout(function () { window.location.href = "login.html"; }, 2500);
            } else {
                showBanner(data.error || "Reset failed. The link may have expired.", "error");
                resetBtn.disabled = false;
                resetBtn.textContent = "Reset Password";
            }
        } catch (err) {
            showBanner("Network error. Please check your connection.", "error");
            resetBtn.disabled = false;
            resetBtn.textContent = "Reset Password";
        }
    });
})();
