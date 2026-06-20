/**
 * dashboard.js
 * All page behaviour for dashboard.html.
 * Depends on auth.js being loaded first (provides loadCurrentUser, bindLogout, authFetch, API_BASE).
 */

// ── Live stat cards ─────────────────────────────────────────────────────────

async function loadDashboardStats() {
  try {
    const res = await authFetch(`${API_BASE}/dashboard/stats`);
    if (!res || !res.ok) {
      const err = res ? await res.json().catch(() => ({})) : {};
      throw new Error(err.error || "Failed to load statistics");
    }
    const stats = await res.json();
    document.querySelectorAll("[data-stat]").forEach(el => {
      const val = stats[el.dataset.stat];
      el.textContent = val !== undefined ? Number(val).toLocaleString() : "—";
    });
  } catch (err) {
    document.querySelectorAll("[data-stat]").forEach(el => {
      el.textContent = "—";
    });
    showDashboardError(err.message);
  }
}

// ── Recent Activity ──────────────────────────────────────────────────────────

async function loadRecentActivity() {
  const list = document.getElementById("recentActivityList");
  if (!list) return;

  try {
    const res = await authFetch(`${API_BASE}/dashboard/recent-activity`);
    if (!res || !res.ok) {
      const err = res ? await res.json().catch(() => ({})) : {};
      throw new Error(err.error || "Failed to load activity");
    }
    const { activities } = await res.json();

    list.innerHTML = "";

    if (!activities || activities.length === 0) {
      const li = document.createElement("li");
      li.className = "activity-empty";
      li.textContent = "No recent activity to display.";
      list.appendChild(li);
      return;
    }

    activities.forEach(item => {
      const li = document.createElement("li");
      li.className = "activity-entry";

      const when = new Date(item.createdAt).toLocaleString();
      li.textContent = `${item.actorName || "System"} · ${item.action.replace(/_/g, " ")} · ${when}`;
      list.appendChild(li);
    });
  } catch (err) {
    list.innerHTML = `<li class="activity-error">${err.message}</li>`;
  }
}

// ── RBAC visibility ──────────────────────────────────────────────────────────

function applyRoleVisibility() {
  const user = getUser();
  if (!user) return;

  const isPrivileged = user.role === "admin" || user.role === "headmaster";

  // Admin-only cards are hidden via CSS by default (.admin-only { display: none })
  // Privileged users get them shown
  if (isPrivileged) {
    document.querySelectorAll(".admin-only").forEach(el => {
      el.classList.remove("admin-only-hidden");
      // Remove the class that hides them so they participate in grid layout
      el.removeAttribute("hidden");
      el.style.display = "";   // restore to grid-item default
    });
  }

  // Welcome title with real first name
  const titleEl = document.getElementById("welcomeTitle");
  if (titleEl) {
    const firstName = (user.name || user.fullName || "").split(" ")[0] || "User";
    titleEl.textContent = `Welcome, ${firstName}!`;
  }
}

// ── Card navigation (replaces inline onclick) ────────────────────────────────

function bindCardNavigation() {
  document.querySelectorAll(".activity-card[data-href]").forEach(card => {
    card.addEventListener("click", () => {
      window.location.href = card.dataset.href;
    });
    // Keyboard accessibility
    card.setAttribute("role", "link");
    card.setAttribute("tabindex", "0");
    card.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.location.href = card.dataset.href;
      }
    });
  });
}

// ── Error display ────────────────────────────────────────────────────────────

function showDashboardError(message) {
  // Use showToast if defined by students.js, otherwise create a simple alert element
  if (typeof showToast === "function") {
    showToast(message, "error");
  } else {
    console.warn("Dashboard error:", message);
  }
}

// ── Initialise ───────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  requireAuth();
  loadCurrentUser();
  bindLogout();
  applyRoleVisibility();
  bindCardNavigation();
  loadDashboardStats();
  loadRecentActivity();
});
