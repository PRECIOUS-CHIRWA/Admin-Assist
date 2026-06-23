async function verifyEmail() {
    const status = document.getElementById("verifyStatus");
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const email = params.get("email");

    if (!token || !email) {
        status.innerHTML = "<span>❌ This verification link is missing required details or has expired.</span>";
        status.className = "verify-status error";
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/verify-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, token }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Email verification failed");

        // Success! Show message and auto-redirect
        status.innerHTML = "<span>✅ Email verified successfully!</span>";
        status.className = "verify-status success";

        let countdown = 3;
        const countdownDiv = document.createElement("div");
        countdownDiv.className = "countdown";
        countdownDiv.textContent = `Redirecting to login in ${countdown} seconds...`;
        status.appendChild(countdownDiv);

        const interval = setInterval(() => {
            countdown--;
            if (countdown <= 0) {
                clearInterval(interval);
                window.location.href = "login.html";
            } else {
                countdownDiv.textContent = `Redirecting to login in ${countdown} seconds...`;
            }
        }, 1000);

    } catch (err) {
        status.innerHTML = `<span>❌ ${err.message}<br><small style="display: block; margin-top: 0.5rem;">Please check the link or <a href="login.html" style="color: inherit; text-decoration: underline;">return to login</a> to resend verification.</small></span>`;
        status.className = "verify-status error";
    }
}

verifyEmail();