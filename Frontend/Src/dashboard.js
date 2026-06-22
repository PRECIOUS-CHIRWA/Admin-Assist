/**
 * dashboard.js
 * Initialises the dashboard page: live stats, recent activity, RBAC, logout.
 * Loaded after auth.js → auth-guard.js → navigation.js.
 */

/* === Sprint 2 Additions: Dashboard Live Data === */

document.addEventListener("DOMContentLoaded", () => {
  // ── 1. Fast display from localStorage (no flicker) ───────────────────────
  const storedUser = getUser();
  if (storedUser) {
    _applyRbacVisibility(storedUser.role || "user");
  }

  // ── 2. Fetch accurate user data from API ─────────────────────────────────
  // loadCurrentUser() is defined in auth.js and updates the header elements.
  loadCurrentUser().then(user => {
    if (user) _applyRbacVisibility(user.role || "user");
  });

  // ── 3. Load live stat counts ──────────────────────────────────────────────
  loadDashboardStats();

  // ── 4. Load recent activity feed ─────────────────────────────────────────
  loadRecentActivity();

  // ── 5. Wire activity card clicks ─────────────────────────────────────────
  // data-href on each card replaces the old inline onclick="" attributes.
  document.querySelectorAll(".activity-card[data-href]").forEach(card => {
    card.addEventListener("click", () => {
      window.location.href = card.dataset.href;
    });
  });

  // ── 6. Logout ─────────────────────────────────────────────────────────────
  // navigation.js also wires this, but having it here too is harmless and
  // ensures it works even if navigation.js is removed from a page.
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn && !logoutBtn.dataset.wired) {
    logoutBtn.dataset.wired = "true";
    logoutBtn.addEventListener("click", async () => {
      try {
        await authFetch(`${API_BASE}/auth/logout`, { method: "POST" });
      } catch { /* clear locally even if the network request fails */ }
      finally {
        clearSession();
        window.location.href = "login.html";
      }
    });
  }
});

/**
 * loadDashboardStats()
 * GET /api/dashboard/stats
 * Expects: { totalStudents, totalTeachers, pendingEnrollments, pendingApprovals }
 * Writes each value into the matching [data-stat] element.
 */
async function loadDashboardStats() {
  try {
    const res = await authFetch(`${API_BASE}/dashboard/stats`);
    if (!res || !res.ok) throw new Error("Could not load dashboard stats");

    const stats = await res.json();

    document.querySelectorAll("[data-stat]").forEach(el => {
      const key = el.dataset.stat;
      const val = stats[key];
      // toLocaleString adds commas: 1000 → "1,000"
      el.textContent = val !== undefined ? Number(val).toLocaleString() : "—";
    });
  } catch (err) {
    // Keep "—" in all cards; log the reason so it's debuggable
    console.error("loadDashboardStats:", err.message);
  }
}

/**
 * loadRecentActivity()
 * GET /api/dashboard/recent-activity
 * Expects an array of { action, actorName, createdAt, entityType }
 * Renders a <li> per event into #activity-list.
 */
async function loadRecentActivity() {
  const list = document.getElementById("activity-list");
  if (!list) return;

  // Show skeleton rows while the request is in flight
  list.innerHTML = `
        <li class="activity-item activity-skeleton"></li>
        <li class="activity-item activity-skeleton"></li>
        <li class="activity-item activity-skeleton"></li>
    `;

  try {
    const res = await authFetch(`${API_BASE}/dashboard/recent-activity`);
    if (!res || !res.ok) throw new Error("Could not load recent activity");

    const items = await res.json(); // array from the backend

    if (!Array.isArray(items) || items.length === 0) {
      list.innerHTML = `<li class="activity-empty">No recent activity yet.</li>`;
      return;
    }

    list.innerHTML = items.map(item => `
            <li class="activity-item">
                <span class="activity-dot"></span>
                <div class="activity-detail">
                    <span class="activity-action">${_esc(item.action)}</span>
                    <span class="activity-meta">
                        ${_esc(item.actorName || "System")} &middot;
                        ${new Date(item.createdAt).toLocaleString()}
                    </span>
                </div>
            </li>
        `).join("");

  } catch (err) {
    list.innerHTML = `<li class="activity-error">
            Could not load activity: ${_esc(err.message)}
        </li>`;
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _applyRbacVisibility(role) {
  const isPrivileged = role === "admin" || role === "headmaster";
  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display = isPrivileged ? "" : "none";
  });
}

// Escapes user-controlled text before inserting into innerHTML
function _esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}