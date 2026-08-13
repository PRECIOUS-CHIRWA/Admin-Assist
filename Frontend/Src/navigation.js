/**
 * navigation.js — Admin Assist Navigation Shell v4
 * Matches the Image 2 design precisely:
 *   - Navy sidebar (220px) with AA shield logo + 7 nav items w/ SVG icons
 *   - White sticky topbar: hamburger | page title | settings+bell+user
 *   - Active page detection, mobile overlay, RBAC filtering
 */

(function () {
    'use strict';

    /* ── SVG Icon library ─────────────────────────────────────────────── */
    var ICONS = {
        dashboard: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
        students: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
        teachers: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
        attendance: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>',
        results: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
        reports: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
        settings: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
        bell: '<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>',
        gear: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
        logout: '<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    };

    /* ── Navigation config ────────────────────────────────────────────── */
    var NAV_ITEMS = [
        { href: 'dashboard.html', label: 'Dashboard', icon: 'dashboard', roles: [] },
        { href: 'students.html', label: 'Students', icon: 'students', roles: [] },
        { href: 'teachers.html', label: 'Teachers', icon: 'teachers', roles: ['admin', 'headmaster', 'staff'] },
        { href: 'attendance-management.html', label: 'Attendance', icon: 'attendance', roles: [] },
        { href: 'academic-records.html', label: 'Results', icon: 'results', roles: [] },
        { href: 'reports-dashboard.html', label: 'Reports', icon: 'reports', roles: ['admin', 'headmaster', 'staff'] },
        { href: 'settings.html', label: 'Settings', icon: 'settings', roles: [] },
    ];

    /* ── Page title map ───────────────────────────────────────────────── */
    var PAGE_TITLES = {
        'dashboard.html': 'Dashboard',
        'students.html': 'Students',
        'teachers.html': 'Teachers',
        'attendance-management.html': 'Attendance',
        'attendance-history.html': 'Attendance History',
        'attendance-summary.html': 'Attendance Summary',
        'attendance-reports.html': 'Attendance Reports',
        'academic-records.html': 'Academic Results',
        'subject-management.html': 'Subject Management',
        'student-transcript.html': 'Student Transcript',
        'reports-dashboard.html': 'Reports',
        'analytics-dashboard.html': 'Analytics',
        'student-search.html': 'Student Search',
        'generate-report.html': 'Report Builder',
        'enroll-student.html': 'Enroll Student',
        'settings.html': 'Settings',
    };

    /* ── Init ─────────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        _injectStyles();
        _buildSidebar();
        _buildTopbar();
        _markActivePage();
        _loadUser();
        _bindEvents();
        _wrapContent();
    });

    /* ── Wrap existing page content in .page-body ─────────────────────── */
    function _wrapContent() {
        // If the page already uses .page-body, skip
        if (document.querySelector('.page-body')) return;

        var main = document.querySelector('main') ||
            document.querySelector('.main-container') ||
            document.querySelector('#main-content');

        if (main && !main.classList.contains('page-body')) {
            main.classList.add('page-content');
            var wrapper = document.createElement('div');
            wrapper.className = 'page-body';
            main.parentNode.insertBefore(wrapper, main);
            wrapper.appendChild(main);
        }
    }

    /* ── Build sidebar ────────────────────────────────────────────────── */
    function _buildSidebar() {
        var nav = document.createElement('nav');
        nav.id = 'app-sidebar';
        nav.setAttribute('aria-label', 'Main navigation');
        nav.innerHTML =
            // Logo area
            '<div class="sb-logo-area">' +
            '<div class="sb-logo-shield"><span>AA</span></div>' +
            '<div class="sb-logo-text">' +
            '<span class="sb-logo-name">ADMIN ASSIST</span>' +
            '<span class="sb-logo-sub">School Information System</span>' +
            '</div>' +
            '</div>' +

            // Nav items
            '<ul class="sb-nav" role="list">' +
            NAV_ITEMS.map(function (item) {
                var roleAttr = item.roles && item.roles.length
                    ? ' data-roles="' + item.roles.join(' ') + '"' : '';
                return '<li class="sb-item"' + roleAttr + '>' +
                    '<a href="' + item.href + '" class="sb-link" data-page="' + item.href + '">' +
                    '<span class="sb-icon">' + ICONS[item.icon] + '</span>' +
                    '<span class="sb-label">' + item.label + '</span>' +
                    '</a>' +
                    '</li>';
            }).join('') +
            '</ul>' +

            // Logout
            '<div class="sb-footer">' +
            '<button class="sb-logout" id="nav-logout-btn" type="button">' +
            '<span class="sb-icon">' + ICONS.logout + '</span>' +
            '<span>Logout</span>' +
            '</button>' +
            '</div>';

        document.body.insertBefore(nav, document.body.firstChild);

        // Backdrop for mobile
        var backdrop = document.createElement('div');
        backdrop.id = 'sb-backdrop';
        document.body.insertBefore(backdrop, nav.nextSibling);
    }

    /* ── Build topbar ─────────────────────────────────────────────────── */
    function _buildTopbar() {
        var currentPage = _currentPage();
        var pageTitle = PAGE_TITLES[currentPage] || 'Admin Assist';

        var bar = document.createElement('div');
        bar.id = 'app-topbar';
        bar.innerHTML =
            '<button class="tb-hamburger" id="tb-hamburger" aria-label="Toggle navigation">' +
            '<span></span><span></span><span></span>' +
            '</button>' +

            '<span class="tb-title" id="topbar-page-title">' + _esc(pageTitle) + '</span>' +

            '<div class="tb-right">' +
            '<button class="tb-icon-btn" title="Settings" onclick="window.location=\'settings.html\'">' +
            ICONS.gear +
            '</button>' +
            '<button class="tb-icon-btn" title="Notifications" style="position:relative">' +
            ICONS.bell +
            '<span class="tb-badge" id="notif-badge" hidden>0</span>' +
            '</button>' +
            '<div class="tb-user" id="tb-user">' +
            '<div class="tb-avatar" id="tb-avatar">?</div>' +
            '<div class="tb-user-info">' +
            '<span class="tb-user-name" id="tb-user-name">Loading…</span>' +
            '<span class="tb-user-role" id="tb-user-role"></span>' +
            '</div>' +
            '</div>' +
            '</div>';

        // Insert topbar as first child of .page-body, or after sidebar
        var pageBody = document.querySelector('.page-body');
        if (pageBody) {
            pageBody.insertBefore(bar, pageBody.firstChild);
        } else {
            document.body.appendChild(bar);
        }
    }

    /* ── Mark active page ─────────────────────────────────────────────── */
    function _markActivePage() {
        var current = _currentPage();
        document.querySelectorAll('.sb-link').forEach(function (a) {
            if (a.getAttribute('data-page') === current || a.getAttribute('href') === current) {
                a.classList.add('active');
                a.setAttribute('aria-current', 'page');
                a.closest('.sb-item').classList.add('active');
            }
        });
    }

    /* ── Load user from auth.js ──────────────────────────────────────── */
    function _loadUser() {
        if (typeof loadCurrentUser !== 'function') return;
        loadCurrentUser().then(function (user) {
            if (!user) return;
            var name = user.name || 'User';
            var role = user.role || '';
            var initials = _initials(name);

            var nameEl = document.getElementById('tb-user-name');
            var roleEl = document.getElementById('tb-user-role');
            var avatarEl = document.getElementById('tb-avatar');

            if (nameEl) nameEl.textContent = name;
            if (roleEl) roleEl.textContent = _capitalise(role);
            if (avatarEl) avatarEl.textContent = initials;

            // Also update sidebar footer user if shown
            _filterByRole(role);
        }).catch(function () { });
    }

    /* ── RBAC: hide items user's role can't access ───────────────────── */
    function _filterByRole(role) {
        document.querySelectorAll('[data-roles]').forEach(function (el) {
            var allowed = el.getAttribute('data-roles').split(' ');
            if (allowed.length && !allowed.includes(role)) {
                el.style.display = 'none';
            }
        });
    }

    /* ── Event binding ───────────────────────────────────────────────── */
    function _bindEvents() {
        // Hamburger
        document.addEventListener('click', function (e) {
            if (e.target.closest('#tb-hamburger')) {
                document.getElementById('app-sidebar').classList.toggle('open');
                document.getElementById('sb-backdrop').classList.toggle('open');
            }
            if (e.target.id === 'sb-backdrop') {
                document.getElementById('app-sidebar').classList.remove('open');
                document.getElementById('sb-backdrop').classList.remove('open');
            }
        });

        // Logout
        document.addEventListener('click', function (e) {
            if (e.target.closest('#nav-logout-btn')) _doLogout();
        });
    }

    function _doLogout() {
        if (typeof authFetch === 'function' && typeof API_BASE !== 'undefined') {
            authFetch(API_BASE + '/auth/logout', { method: 'POST' })
                .catch(function () { })
                .finally(function () { window.location.href = 'login.html'; });
        } else {
            window.location.href = 'login.html';
        }
    }

    /* ── Style injection ─────────────────────────────────────────────── */
    function _injectStyles() {
        if (document.getElementById('nav-shell-styles')) return;
        var s = document.createElement('style');
        s.id = 'nav-shell-styles';
        s.textContent = `
/* ═══════════════════════════════════════════════════════
   Navigation Shell — matches Image 2 design precisely
════════════════════════════════════════════════════════ */

/* ── Sidebar ─────────────────────────────────────────── */
#app-sidebar {
    position: fixed; top: 0; left: 0; bottom: 0;
    width: 220px; background: #1B2A4A;
    display: flex; flex-direction: column;
    z-index: 200; overflow: hidden;
    transition: transform .28s cubic-bezier(.4,0,.2,1);
    font-family: 'Inter', -apple-system, sans-serif;
}

/* Logo area */
.sb-logo-area {
    display: flex; align-items: center; gap: 12px;
    padding: 20px 16px; flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,.08);
}
.sb-logo-shield {
    width: 40px; height: 40px; border-radius: 10px;
    background: #0F1C35; border: 2px solid #C9A227;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
}
.sb-logo-shield span {
    font-size: 13px; font-weight: 800; color: #fff; letter-spacing: .04em;
}
.sb-logo-text { display: flex; flex-direction: column; }
.sb-logo-name {
    font-size: 11px; font-weight: 800; color: #fff;
    letter-spacing: .06em;
}
.sb-logo-sub {
    font-size: 9px; color: rgba(255,255,255,.45);
    font-weight: 500; letter-spacing: .04em; margin-top: 1px;
}

/* Nav list */
.sb-nav {
    list-style: none; padding: 12px 0; flex: 1; overflow-y: auto;
}
.sb-nav::-webkit-scrollbar { width: 4px; }
.sb-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 2px; }

.sb-item { margin: 2px 8px; }

.sb-link {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; border-radius: 10px;
    color: rgba(255,255,255,.62); text-decoration: none;
    font-size: 14px; font-weight: 500;
    transition: background .15s, color .15s;
    position: relative;
}
.sb-link:hover {
    background: rgba(255,255,255,.08); color: rgba(255,255,255,.9);
    text-decoration: none;
}
.sb-link.active {
    background: rgba(37,99,235,.28); color: #fff; font-weight: 600;
}
.sb-link.active::before {
    content: ''; position: absolute; left: 0; top: 6px; bottom: 6px;
    width: 3px; background: #C9A227; border-radius: 0 3px 3px 0; left: -8px;
}
.sb-icon { display: flex; align-items: center; flex-shrink: 0; }

/* Section header */
.sb-section-header {
    padding: 12px 20px 4px;
    font-size: 10px; font-weight: 700; letter-spacing: .1em;
    text-transform: uppercase; color: rgba(255,255,255,.3);
    pointer-events: none; user-select: none;
}

/* Footer */
.sb-footer {
    padding: 12px 16px; border-top: 1px solid rgba(255,255,255,.08); flex-shrink: 0;
}
.sb-logout {
    width: 100%; display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; border-radius: 10px;
    background: none; border: none; cursor: pointer;
    color: rgba(255,255,255,.5); font-size: 14px; font-weight: 500;
    font-family: inherit; transition: background .15s, color .15s;
}
.sb-logout:hover { background: rgba(239,68,68,.18); color: #fca5a5; }

/* Mobile backdrop */
#sb-backdrop {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,.45); z-index: 190;
}
#sb-backdrop.open { display: block; }

/* Mobile: hide sidebar, show on .open */
@media (max-width: 768px) {
    #app-sidebar { transform: translateX(-100%); }
    #app-sidebar.open { transform: translateX(0); }
    #app-topbar { left: 0; }
}

/* ── Topbar ──────────────────────────────────────────── */
#app-topbar {
    position: fixed; top: 0; left: 220px; right: 0; height: 64px;
    background: #fff; border-bottom: 1px solid #E5E7EB;
    display: flex; align-items: center; padding: 0 24px;
    z-index: 100; gap: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06);
    font-family: 'Inter', -apple-system, sans-serif;
}
@media (max-width: 768px) { #app-topbar { left: 0; } }

.tb-hamburger {
    width: 38px; height: 38px; border: none; background: none; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 5px; border-radius: 8px; padding: 0; flex-shrink: 0;
}
.tb-hamburger span {
    display: block; width: 20px; height: 2px; background: #374151; border-radius: 2px;
}
.tb-hamburger:hover { background: #F3F4F6; }

.tb-title {
    font-size: 18px; font-weight: 700; color: #1B2A4A; flex: 1;
}

.tb-right {
    display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}

.tb-icon-btn {
    width: 38px; height: 38px; border: none; background: #F3F4F6;
    border-radius: 10px; cursor: pointer; display: flex; align-items: center;
    justify-content: center; color: #6B7280; position: relative;
    transition: background .15s; flex-shrink: 0;
}
.tb-icon-btn:hover { background: #E5E7EB; color: #374151; }

.tb-badge {
    position: absolute; top: 4px; right: 4px; width: 16px; height: 16px;
    background: #EF4444; color: #fff; border-radius: 50%;
    font-size: 9px; font-weight: 700; display: flex; align-items: center;
    justify-content: center; border: 2px solid #fff;
}

.tb-user {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 10px; border-radius: 10px; cursor: pointer;
    transition: background .15s;
}
.tb-user:hover { background: #F3F4F6; }

.tb-avatar {
    width: 36px; height: 36px; border-radius: 50%; background: #1B2A4A;
    color: #fff; font-size: 12px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

.tb-user-info { display: flex; flex-direction: column; }
.tb-user-name { font-size: 13px; font-weight: 600; color: #111827; line-height: 1.2; }
.tb-user-role { font-size: 11px; color: #6B7280; text-transform: capitalize; }

/* ── Ensure page content clears sidebar + topbar ──── */
body { overflow-x: hidden; }

.main-container, main, .page-content {
    margin-left: 220px;
    padding-top: 64px;
    min-height: 100vh;
    background: #F0F2F5;
}

.main-container, main {
    padding: 80px 28px 28px;
}

@media (max-width: 768px) {
    .main-container, main, .page-content {
        margin-left: 0;
    }
}
`;
        document.head.appendChild(s);
    }

    /* ── Helpers ─────────────────────────────────────────────────────── */
    function _currentPage() {
        var path = window.location.pathname.split('/');
        return path[path.length - 1] || 'dashboard.html';
    }

    function _initials(name) {
        return String(name || 'U').split(' ').filter(Boolean)
            .map(function (n) { return n[0].toUpperCase(); })
            .slice(0, 2).join('');
    }

    function _capitalise(str) {
        return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
    }

    function _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

})();