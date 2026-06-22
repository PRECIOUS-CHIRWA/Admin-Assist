/**
 * enroll-student.js
 * Page-init for enroll-student.html.
 * Depends on auth.js (loadCurrentUser, bindLogout, requireAuth)
 * and students.js (initializeMultiStepForm).
 */
document.addEventListener("DOMContentLoaded", () => {
  requireAuth();
  loadCurrentUser();
  bindLogout();
  initializeMultiStepForm();
});

/* === Sprint 2 Additions: Enrollment Page Init === */

document.addEventListener("DOMContentLoaded", () => {
  // requireAuth() is a synchronous check from auth.js.
  // If no token exists in localStorage, the user is immediately redirected to login.
  requireAuth();

  // Start the multi-step form logic (defined in students.js)
  initializeMultiStepForm();
});
