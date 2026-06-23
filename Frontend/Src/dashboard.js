/**
 * dashboard.js
 * Dashboard-specific logic: live stats, recent activity, card navigation.
 * Runs after auth.js → auth-guard.js → navigation.js.
 * User display and RBAC are handled by navigation.js.
 */

/* === Sprint 2: Dashboard Live Data === */

document.addEventListener("DOMContentLoaded", () => {
  loadDashboardStats();
  loadRecentActivity();
  _wireCardClicks();
});

/**
 * loadDashboardStats()
 * GET /api/dashboard/stats
 * Fills [data-stat] elements with live counts from the database.
 */
async function loadDashboardStats() {
  try {
    const res = await authFetch(`${API_BASE}/dashboard/stats`);
    if (!res || !res.ok) throw new Error("Could not load stats");

    const stats = await res.json();

    document.querySelectorAll("[data-stat]").forEach(el => {
      const val = stats[el.dataset.stat];
      el.textContent = val !== undefined
        ? Number(val).toLocaleString()
        : "—";
    });
  } catch (err) {
    // Keep "—" placeholders; log reason for debugging
    console.warn("loadDashboardStats:", err.message);
  }
}

/**
 * loadRecentActivity()
 * GET /api/dashboard/recent-activity
 * Expects: [{ action, actorName, createdAt }]
 */
async function loadRecentActivity() {
  const list = document.getElementById("activity-list");
  if (!list) return;

  list.innerHTML = `
        <li class="activity-skeleton"></li>
        <li class="activity-skeleton"></li>
        <li class="activity-skeleton"></li>
    `;

  try {
    const res = await authFetch(`${API_BASE}/dashboard/recent-activity`);
    if (!res || !res.ok) throw new Error("Could not load activity");

    const items = await res.json();

    if (!Array.isArray(items) || items.length === 0) {
      list.innerHTML = `<li class="activity-empty">No recent activity yet.</li>`;
      return;
    }

    list.innerHTML = items.map(item => `
            <li class="activity-item">
                <span class="activity-dot" aria-hidden="true"></span>
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
            Activity unavailable: ${_esc(err.message)}
        </li>`;
  }
}

/**
 * _wireCardClicks()
 * Wires data-href on activity cards so there are no inline onclick handlers.
 */
function _wireCardClicks() {
  document.querySelectorAll(".activity-card[data-href]").forEach(card => {
    card.addEventListener("click", () => {
      window.location.href = card.dataset.href;
    });
    card.style.cursor = "pointer";
  });
}

function _esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}