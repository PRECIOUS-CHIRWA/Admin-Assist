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
        const position = user.school_position || '';
        const isHeadTeacher = (role === 'headmaster') || (position === 'Head Teacher');
        const isTeacher = !!(user.is_teacher || position === 'Teacher');

        // 1. Unified Student/Parent (role 'user'): Strictly student-transcript.html and settings.html
        const studentAllowedPages = [
            'student-transcript.html',
            'settings.html'
        ];

        if (role === 'user') {
            if (!studentAllowedPages.includes(page)) {
                window.location.replace('student-transcript.html');
                return false;
            }
            return true;
        }

        // 2. Head Teacher (Supervisory: Dashboard, Classes/Subjects, Staff view-only, Reports, Settings)
        if (isHeadTeacher && role !== 'admin') {
            const headTeacherBlocked = [
                'enroll-student.html',
                'students.html',
                'timetable-management.html',
                'attendance-management.html'
            ];
            if (headTeacherBlocked.includes(page)) {
                window.location.replace('dashboard.html');
                return false;
            }
            return true;
        }

        // 3. Admin / Staff route rules
        // Attendance management: Excluded for pure admin
        if (role === 'admin' && !isTeacher && page === 'attendance-management.html') {
            window.location.replace('dashboard.html');
            return false;
        }

        // Results menu rule: Pure admin without teaching duties does not have Results
        if (role === 'admin' && !isTeacher && page === 'academic-records.html') {
            window.location.replace('dashboard.html');
            return false;
        }

        // 4. Staff (non-head): Cannot access enrollment/student addition or staff directory
        if (role === 'staff' && !isHeadTeacher && (page === 'enroll-student.html' || page === 'teachers.html' || page === 'students.html')) {
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