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
