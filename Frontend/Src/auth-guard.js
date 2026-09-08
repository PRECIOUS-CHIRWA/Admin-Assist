/**
 * auth-guard.js — Admin Assist Authentication & Role Route Guard
 * Enforces session validity, role-based page protection, and bfcache back-button lock.
 */
(function () {
    'use strict';

    function verifyAuth() {
        const token = typeof getAccessToken === 'function' ? getAccessToken() : localStorage.getItem('accessToken');
        const user = typeof getUser === 'function' ? getUser() : (() => {
            try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
        })();

        if (!token || !user) {
            if (typeof clearSession === 'function') clearSession();
            const intended = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.replace('login.html?next=' + intended);
            return false;
        }

        // Role-based route guard
        const page = window.location.pathname.split('/').pop() || 'dashboard.html';
        const role = user.role || 'user';

        // 1. Admin/Headmaster: Attendance management is REMOVED for admins (must not appear in menu or direct access unless assigned)
        if ((role === 'admin' || role === 'headmaster') && page === 'attendance-management.html') {
            window.location.replace('dashboard.html');
            return false;
        }

        // 2. Staff: Cannot access enrollment/student addition or teachers directory
        if (role === 'staff' && (page === 'enroll-student.html' || page === 'teachers.html' || page === 'students.html')) {
            window.location.replace('dashboard.html');
            return false;
        }

        // 3. Unified Student/Parent (role 'user'): Can only access student-facing pages
        const studentAllowedPages = [
            'dashboard.html',
            'student-profile.html',
            'attendance-history.html',
            'academic-records.html',
            'student-transcript.html',
            'settings.html',
            'notifications.html'
        ];

        if (role === 'user' && !studentAllowedPages.includes(page)) {
            window.location.replace('dashboard.html');
            return false;
        }

        return true;
    }

    // Run verification immediately
    verifyAuth();

    // Prevent Back button from restoring cached page after logout (bfcache)
    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            verifyAuth();
        }
    });
})();