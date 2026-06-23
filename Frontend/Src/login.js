document.getElementById("togglePw").addEventListener("click", function () {
    const pw = document.getElementById("password");
    const isHidden = pw.type === "password";
    pw.type = isHidden ? "text" : "password";
    this.textContent = isHidden ? "🙈" : "👁";
    this.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("loginBtn");
    const banner = document.getElementById("error-banner");

    banner.textContent = "";
    banner.classList.remove("visible");
    btn.disabled = true;
    btn.textContent = "Signing in…";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Login failed");

        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("user", JSON.stringify(data.user));

        // RBAC redirect — send each role to the right landing page
        const role = data.user?.role;
        if (role === "admin" || role === "headmaster") {
            window.location.href = "dashboard.html";
        } else if (role === "staff") {
            window.location.href = "dashboard.html";
        } else {
            window.location.href = "dashboard.html";
        }
    } catch (err) {
        banner.textContent = err.message;
        banner.classList.add("visible");
    } finally {
        btn.disabled = false;
        btn.textContent = "Login";
    }
});