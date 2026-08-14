(function () {
    "use strict";

    var banner  = document.getElementById("form-banner");
    var form    = document.getElementById("forgotForm");
    var submitBtn = document.getElementById("submitBtn");

    function showBanner(msg, type) {
        banner.textContent = msg;
        banner.className = "error-banner " + (type === "success" ? "success-banner" : "");
        banner.style.display = "block";
    }

    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        banner.style.display = "none";

        var email = document.getElementById("email").value.trim();
        if (!email) { showBanner("Please enter your email address.", "error"); return; }

        submitBtn.disabled = true;
        submitBtn.textContent = "Sending…";

        try {
            var res = await fetch(API_BASE + "/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email }),
            });
            var data = await res.json().catch(function () { return {}; });
            if (res.ok) {
                showBanner(data.message || "If that email is registered, a reset link has been sent.", "success");
                submitBtn.textContent = "Sent";
                form.reset();
            } else {
                showBanner(data.error || "Something went wrong. Please try again.", "error");
                submitBtn.disabled = false;
                submitBtn.textContent = "Send Reset Link";
            }
        } catch (err) {
            showBanner("Network error. Please check your connection.", "error");
            submitBtn.disabled = false;
            submitBtn.textContent = "Send Reset Link";
        }
    });
})();
