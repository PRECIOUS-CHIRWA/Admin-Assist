// Password visibility toggle
document.getElementById("togglePw").addEventListener("click", function () {
    const pw = document.getElementById("password");
    const isHidden = pw.type === "password";
    pw.type = isHidden ? "text" : "password";
    this.textContent = isHidden ? "🙈" : "👁";
    this.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
});

function showBanner(message, type = "error") {
    const banner = document.getElementById("form-banner");
    banner.textContent = message;
    banner.className = `form-banner visible ${type}`;
}

document.getElementById("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("signupBtn");
    const banner = document.getElementById("form-banner");

    banner.className = "form-banner";
    banner.textContent = "";

    const name = document.getElementById("fullname").value.trim();
    const email = document.getElementById("email").value.trim();
    const role = document.getElementById("role").value;
    const password = document.getElementById("password").value;
    const confirm = document.getElementById("confirmPassword").value;

    // Client-side validation before hitting the network
    if (password !== confirm) {
        showBanner("Passwords do not match.");
        return;
    }
    if (password.length < 8) {
        showBanner("Password must be at least 8 characters.");
        return;
    }

    btn.disabled = true;
    btn.textContent = "Creating account…";

    try {
        const res = await fetch(`${API_BASE}/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, role }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Signup failed");

        showBanner("Account created! Redirecting to login…", "success");
        setTimeout(() => { window.location.href = "login.html"; }, 1800);
    } catch (err) {
        showBanner(err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "Sign Up";
    }
});