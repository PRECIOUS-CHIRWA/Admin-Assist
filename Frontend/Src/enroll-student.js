/**
 * enroll-student.js
 * Page initialiser for enroll-student.html.
 *
 * Responsibilities:
 *  1. Auth guard (synchronous — redirects to login if no token)
 *  2. Load live enrollment stats into the stat cards
 *  3. Initialise the multi-step form (defined in students.js)
 *  4. Wire the success overlay buttons
 *
 * Load order: auth.js → auth-guard.js → navigation.js → students.js → THIS FILE
 */

/* === Sprint 2: Enrollment Page Init === */

document.addEventListener("DOMContentLoaded", () => {

  // ── 1. Auth guard ─────────────────────────────────────────────────────────
  // requireAuth() is synchronous — it redirects immediately if no session.
  requireAuth();

  // ── 2. Load enrollment stats ──────────────────────────────────────────────
  _loadEnrollmentStats();

  // ── 3. Initialise multi-step form ─────────────────────────────────────────
  // initializeMultiStepForm() is defined in students.js.
  // It sets up the Next / Back / Submit buttons and form state tracking.
  initializeMultiStepForm();

  // ── 4. Wire success overlay buttons ──────────────────────────────────────
  // These are wired here instead of inside students.js so that
  // students.js stays self-contained without DOM id assumptions.
  const enrollAnotherBtn = document.getElementById("enrollAnotherBtn");
  const viewListBtn = document.getElementById("viewListBtn");

  if (enrollAnotherBtn) {
    enrollAnotherBtn.addEventListener("click", () => {
      window.location.href = "enroll-student.html";
    });
  }

  if (viewListBtn) {
    viewListBtn.addEventListener("click", () => {
      window.location.href = "students.html";
    });
  }
});

/**
 * _loadEnrollmentStats()
 * GET /api/dashboard/enrollment-stats
 * Populates [data-enroll-stat="..."] elements with live counts.
 * On error, sets all values to 0 rather than crashing the page.
 */
async function _loadEnrollmentStats() {
  try {
    const res = await authFetch(`${API_BASE}/dashboard/enrollment-stats`);
    if (!res || !res.ok) throw new Error("Stats unavailable");

    const stats = await res.json();

    document.querySelectorAll("[data-enroll-stat]").forEach(el => {
      const key = el.dataset.enrollStat;
      const val = stats[key];
      el.textContent = val !== undefined ? Number(val).toLocaleString() : "0";
    });
  } catch (err) {
    // Show zeros on error — better than "—" for a stats display
    document.querySelectorAll("[data-enroll-stat]").forEach(el => {
      el.textContent = "0";
    });
    console.warn("_loadEnrollmentStats:", err.message);
  }
}