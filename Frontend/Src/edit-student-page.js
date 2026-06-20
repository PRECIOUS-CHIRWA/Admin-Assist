/**
 * edit-student-page.js
 * Page-init for edit-student.html.
 * Depends on auth.js (loadCurrentUser, bindLogout, requireAuth)
 * and students.js (initializeEditStudent).
 */
document.addEventListener("DOMContentLoaded", () => {
  requireAuth();
  loadCurrentUser();
  bindLogout();
  initializeEditStudent();
});
