/**
 * student-profile-page.js
 * Page-init for student-profile.html.
 * Depends on auth.js (loadCurrentUser, bindLogout, requireAuth)
 * and students.js (initializeStudentProfile).
 */
document.addEventListener("DOMContentLoaded", () => {
  requireAuth();
  loadCurrentUser();
  bindLogout();
  initializeStudentProfile();
});
