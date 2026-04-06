const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const navLinks = document.querySelectorAll(".site-nav a");
const revealItems = document.querySelectorAll("[data-reveal]");
const signupForm = document.querySelector("#signup-form");
const formStatus = document.querySelector("#form-status");
const currentYear = document.querySelector("#current-year");

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isExpanded = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!isExpanded));
    siteNav.classList.toggle("is-open");
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      navToggle.setAttribute("aria-expanded", "false");
      siteNav.classList.remove("is-open");
    });
  });
}

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

if (signupForm && formStatus) {
  signupForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(signupForm);
    const fullName = formData.get("fullName")?.toString().trim() || "User";
    const role = formData.get("role")?.toString() || "account";
    const password = formData.get("password")?.toString() || "";
    const confirmPassword =
      formData.get("confirmPassword")?.toString() || "";

    formStatus.classList.remove("is-error", "is-success");

    if (!signupForm.reportValidity()) {
      formStatus.textContent = "Please complete all required fields first.";
      formStatus.classList.add("is-error");
      return;
    }

    if (password !== confirmPassword) {
      formStatus.textContent =
        "Passwords do not match yet. Please enter the same password twice.";
      formStatus.classList.add("is-error");
      return;
    }

    const firstName = fullName.split(" ")[0];
    formStatus.textContent = `Welcome, ${firstName}! Your ${role.toLowerCase()} account details have been saved.`;
    formStatus.classList.add("is-success");
    signupForm.reset();
  });
}
