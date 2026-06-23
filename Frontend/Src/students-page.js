/**
 * students-page.js
 * Page-init for students.html.
 * Depends on auth.js (loadCurrentUser, bindLogout, requireAuth)
 * and students.js (initializeStudentList).
 */
document.addEventListener("DOMContentLoaded", () => {
  requireAuth();
  loadCurrentUser();
  bindLogout();
  initializeStudentList();
});
