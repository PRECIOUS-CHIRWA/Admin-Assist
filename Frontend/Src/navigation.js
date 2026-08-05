(function () {
    'use strict';

    /* ─────────────────────────────────────────────────────────────────
       STEP 0 — APPLY THEME FROM LOCALSTORAGE (must happen before paint)
    ───────────────────────────────────────────────────────────────── */
    (function () {
        var saved = localStorage.getItem('aa-theme');
        if (saved === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else if (!saved) {
            // Default: respect OS preference
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('aa-theme', 'dark');
            }
        }
    })();

    /* ─────────────────────────────────────────────────────────────────
       STEP 1 — INJECT CRITICAL CSS IMMEDIATELY (synchronous)
       Must run before DOMContentLoaded so the sidebar never flashes
       visible before being hidden. Uses !important to prevent override.
    ───────────────────────────────────────────────────────────────── */
    _injectCriticalCSS();

    /* ─────────────────────────────────────────────────────────────────
       NAV LINK DEFINITIONS
       roles: [] means visible to all authenticated users.
       roles: ['admin'] means only admins see this link.
    ───────────────────────────────────────────────────────────────── */
    var NAV_LINKS = [
        // ── Core ───────────────────────────────────────────────────────────
        { href: 'dashboard.html', label: 'Dashboard', icon: '🏠', roles: [] },
        { href: 'students.html', label: 'Student Directory', icon: '👥', roles: [] },
        { href: 'enroll-student.html', label: 'Enroll Student', icon: '📝', roles: ['admin', 'headmaster', 'staff'] },
        // ── Attendance (Sprint 3) ───────────────────────────────────────────
        { section: 'Attendance' },
        { href: 'attendance-management.html', label: 'Take Attendance', icon: '📋', roles: [] },
        { href: 'attendance-history.html', label: 'Session History', icon: '📅', roles: [] },
        { href: 'attendance-summary.html', label: 'Summary', icon: '📊', roles: [] },
        { href: 'attendance-reports.html', label: 'Export CSV', icon: '⬇', roles: ['admin', 'headmaster', 'teacher'] },
        // ── Academics (Sprint 4) ────────────────────────────────────────────
        { section: 'Academics' },
        { href: 'academic-records.html', label: 'Academic Records', icon: '📄', roles: [] },
        { href: 'subject-management.html', label: 'Subjects', icon: '📚', roles: ['admin', 'headmaster'] },
        { href: 'student-transcript.html', label: 'Transcripts', icon: '🎓', roles: [] },
        // ── Reports & Analytics (Sprint 5) ──────────────────────────────────
        { section: 'Reports & Analytics' },
        { href: 'reports-dashboard.html', label: 'Reports', icon: '📈', roles: ['admin', 'headmaster', 'teacher'] },
        { href: 'analytics-dashboard.html', label: 'Analytics', icon: '📉', roles: ['admin', 'headmaster'] },
        { href: 'student-search.html', label: 'Student Search', icon: '🔍', roles: [] },
    ];

    /* ─────────────────────────────────────────────────────────────────
       MAIN INIT — runs after DOM is parsed
    ───────────────────────────────────────────────────────────────── */
    function _init() {
        _injectSidebar();
        _injectHamburger();
        _fixBranding();
        _fixUserInfoLayout();
        _wireEvents();
        _markActiveLink();

        // Fast path: display from localStorage with zero network delay
        var stored = (typeof getUser === 'function') ? getUser() : null;
        if (stored) {
            _displayUser(stored);
            _applyRbac(stored.role);
        }

        // Accurate path: confirm with the API and overwrite if different
        if (typeof loadCurrentUser === 'function') {
            loadCurrentUser().then(function (apiUser) {
                if (apiUser) {
                    _displayUser(apiUser);
                    _applyRbac(apiUser.role);
                }
            });
        }

        _wireLogout();
    }

    // Run when DOM is ready, however the script was loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    /* ─────────────────────────────────────────────────────────────────
       CRITICAL CSS INJECTION
       All rules use !important so they win over any page-level styles.
       Two <style> blocks are injected:
         1. #nav-critical  — sidebar positioning (hidden by default)
         2. #nav-ui        — visual styles for sidebar content
    ───────────────────────────────────────────────────────────────── */
    function _injectCriticalCSS() {
        if (document.getElementById('nav-critical')) return;

        var critical = document.createElement('style');
        critical.id = 'nav-critical';
        critical.textContent =
            /* Sidebar is FIXED and starts completely off-screen to the left */
            '#app-sidebar{' +
            'position:fixed!important;' +
            'top:0!important;left:0!important;' +
            'width:270px!important;height:100vh!important;' +
            'background:var(--aa-sidebar-bg,#172033)!important;color:#fff!important;' +
            'z-index:9999!important;' +
            'display:flex!important;flex-direction:column!important;' +
            'overflow-y:auto!important;overflow-x:hidden!important;' +
            'transform:translateX(-100%)!important;' +
            'visibility:hidden!important;pointer-events:none!important;' +
            'transition:transform .25s cubic-bezier(.4,0,.2,1),' +
            'visibility 0s .25s!important;' +
            'border-right:1px solid rgba(255,255,255,.06)!important;' +
            '}' +
            '#app-sidebar.is-open{' +
            'transform:translateX(0)!important;' +
            'visibility:visible!important;pointer-events:all!important;' +
            'transition:transform .25s cubic-bezier(.4,0,.2,1),' +
            'visibility 0s 0s!important;' +
            '}' +
            '#sidebar-backdrop{' +
            'position:fixed!important;inset:0!important;' +
            'background:rgba(0,0,0,.45)!important;' +
            'backdrop-filter:blur(2px)!important;' +
            'z-index:9998!important;' +
            'opacity:0!important;pointer-events:none!important;' +
            'transition:opacity .25s ease!important;' +
            '}' +
            '#sidebar-backdrop.is-visible{' +
            'opacity:1!important;pointer-events:all!important;' +
            '}' +
            'body.nav-open{overflow:hidden!important;}';

        (document.head || document.documentElement).appendChild(critical);
    }

    /* ─────────────────────────────────────────────────────────────────
       SIDEBAR HTML INJECTION
    ───────────────────────────────────────────────────────────────── */
    function _injectSidebar() {
        if (document.getElementById('app-sidebar')) return;

        // Build nav link HTML (supports section dividers)
        var linksHtml = NAV_LINKS.map(function (l) {
            if (l.section) {
                return '<li class="sb-section-header" aria-hidden="true">' + l.section + '</li>';
            }
            var roleAttr = l.roles && l.roles.length
                ? ' data-roles="' + l.roles.join(' ') + '"'
                : '';
            return '<li class="sb-item"' + roleAttr + '>' +
                '<a href="' + l.href + '" class="sb-link">' +
                '<span class="sb-icon" aria-hidden="true">' + l.icon + '</span>' +
                '<span class="sb-label">' + l.label + '</span>' +
                '</a>' +
                '</li>';
        }).join('');

        // Global School Name fallback
        window.SCHOOL_NAME = window.SCHOOL_NAME || 'Admin Assist Secondary School';
        var schoolName = window.SCHOOL_NAME;

        // Build sidebar element
        var nav = document.createElement('nav');
        nav.id = 'app-sidebar';
        nav.setAttribute('aria-label', 'Main navigation');
        nav.innerHTML =
            // ── Header: AA brand mark + School Name + close button ──
            '<div class="sb-head">' +
            '<div class="sb-brand">' +
            '<div class="sb-brand-mark">AA</div>' +
            '<div class="sb-brand-info">' +
            '<span class="sb-school-name" id="sidebar-school-name">' + _escapeHtml(schoolName) + '</span>' +
            '<span class="sb-system-tag">SIS Workspace</span>' +
            '</div>' +
            '</div>' +
            '<button class="sb-close-btn" id="sidebar-close-btn" ' +
            'aria-label="Close navigation menu" type="button">' +
            '&#x2715;' +
            '</button>' +
            '</div>' +

            // ── User card: [Avatar] [Name / Role / Staff ID] ──
            '<div class="sb-user">' +
            '<div class="sb-avatar" id="sidebar-avatar">?</div>' +
            '<div class="sb-user-text">' +
            '<span class="sb-name" id="sidebar-name">Loading\u2026</span>' +
            '<span class="sb-role" id="sidebar-role"></span>' +
            '<span class="sb-staff-id" id="sidebar-staff-id"></span>' +
            '</div>' +
            '</div>' +

            // ── Navigation links ──
            '<ul class="sb-nav">' + linksHtml + '</ul>' +

            // ── Footer: logout ──
            '<div class="sb-footer">' +
            '<button class="sb-logout-btn" id="sidebar-logout-btn" type="button">' +
            '<span aria-hidden="true">&#x1F6AA;</span>' +
            '<span>Logout</span>' +
            '</button>' +
            '</div>';

        document.body.appendChild(nav);

        // Backdrop element (sits behind open sidebar)
        var backdrop = document.createElement('div');
        backdrop.id = 'sidebar-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        document.body.appendChild(backdrop);

        // Inject visual styles for sidebar content
        _injectUIStyles();
    }

    /* ─────────────────────────────────────────────────────────────────
       UI STYLES INJECTION
       Visual polish for sidebar components, hamburger, and header fixes.
    ───────────────────────────────────────────────────────────────── */
    function _injectUIStyles() {
        if (document.getElementById('nav-ui')) return;

        var s = document.createElement('style');
        s.id = 'nav-ui';
        s.textContent = `
/* ═══════════════════════════════════════════════════════
   SIDEBAR — Brand New Design System
   Primary Blue: #1E5AA8 | Academic Gold: #D4AF37
   Dark sidebar background: #172033
════════════════════════════════════════════════════════ */

/* ── Sidebar header bar ───────────────────────────────── */
.sb-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 1rem; min-height: 64px; flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,.07);
    gap: 8px;
}
.sb-brand { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
.sb-brand-info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.sb-school-name {
    font-size: 12.5px; font-weight: 700; color: #ffffff;
    line-height: 1.25; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; max-width: 155px;
}
.sb-system-tag {
    font-size: 9px; color: #D4AF37; font-weight: 700;
    letter-spacing: .07em; text-transform: uppercase; margin-top: 1px;
}

/* AA brand mark — square with gold border */
.sb-brand-mark {
    width: 36px; height: 36px; border-radius: 8px;
    background: #1E5AA8;
    border: 2px solid #D4AF37;
    color: #D4AF37; font-size: 12px; font-weight: 800;
    letter-spacing: .04em;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; user-select: none;
}

/* Close X button */
.sb-close-btn {
    background: transparent; border: none;
    color: rgba(255,255,255,.5); font-size: 17px;
    cursor: pointer; width: 30px; height: 30px; border-radius: 5px;
    display: flex; align-items: center; justify-content: center;
    transition: background .15s, color .15s; flex-shrink: 0;
    line-height: 1;
}
.sb-close-btn:hover { background: rgba(255,255,255,.09); color: #fff; }
.sb-close-btn:focus-visible { outline: 2px solid #D4AF37; outline-offset: 2px; }

/* ── Sidebar user card ────────────────────────────────── */
.sb-user {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 16px; flex-shrink: 0;
    background: rgba(255,255,255,.03);
    border-bottom: 1px solid rgba(255,255,255,.06);
    cursor: pointer;
    transition: background .15s;
}
.sb-user:hover { background: rgba(30,90,168,.2) !important; }
.sb-user::after {
    content: '✎'; margin-left: auto;
    font-size: 12px; color: rgba(255,255,255,.25); padding-right: 2px;
}

.sb-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: #D4AF37;
    color: #172033; font-size: 13px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; letter-spacing: .5px; user-select: none;
    border: 1.5px solid rgba(255,255,255,.15);
}
.sb-user-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.sb-name {
    font-size: 13px; font-weight: 600; color: #fff;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sb-role   { font-size: 11px; color: rgba(255,255,255,.5); }
.sb-staff-id {
    font-size: 10px; color: rgba(255,255,255,.35);
    font-variant-numeric: tabular-nums; letter-spacing: .03em;
}

/* ── Nav links ────────────────────────────────────────── */
.sb-nav { list-style: none; padding: 6px 0; margin: 0; flex: 1; }

.sb-link {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 18px;
    color: rgba(255,255,255,.65); text-decoration: none;
    font-size: 13.5px; font-weight: 500;
    border-left: 3px solid transparent;
    transition: background .12s, color .12s, border-color .12s;
    white-space: nowrap; border-radius: 0;
}
.sb-link:hover {
    background: rgba(30,90,168,.15);
    color: #fff;
}
.sb-link.is-active {
    background: rgba(30,90,168,.25);
    color: #ffffff;
    border-left-color: #1E5AA8;
    font-weight: 600;
}
.sb-link:focus-visible { outline: 2px solid #D4AF37; outline-offset: -2px; }
.sb-icon { font-size: 16px; width: 20px; text-align: center; flex-shrink: 0; opacity: .85; }

/* ── Section labels in nav ────────────────────────────── */
.sb-section-header {
    padding: 14px 18px 3px;
    font-size: 9.5px; font-weight: 700; letter-spacing: .10em;
    text-transform: uppercase; color: rgba(255,255,255,.3);
    pointer-events: none; user-select: none;
}

/* ── Sidebar footer ───────────────────────────────────── */
.sb-footer {
    padding: 6px 0; flex-shrink: 0;
    border-top: 1px solid rgba(255,255,255,.06);
}
.sb-logout-btn {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 10px 18px;
    background: transparent; border: none;
    border-left: 3px solid transparent;
    color: rgba(255,255,255,.55); font-size: 13.5px; font-weight: 500;
    font-family: inherit; cursor: pointer; text-align: left;
    transition: background .12s, color .12s, border-color .12s;
}
.sb-logout-btn:hover {
    background: rgba(220,38,38,.12);
    color: #fca5a5; border-left-color: #DC2626;
}
.sb-logout-btn:focus-visible { outline: 2px solid #D4AF37; outline-offset: -2px; }

/* ═══════════════════════════════════════════════════════
   HEADER CHROME
════════════════════════════════════════════════════════ */

/* ── Hamburger button ─────────────────────────────────── */
#hamburger-btn {
    display: flex; flex-direction: column;
    justify-content: center; align-items: center; gap: 4.5px;
    width: 38px; height: 38px; padding: 8px;
    background: transparent; border: none;
    border-radius: 6px; cursor: pointer;
    flex-shrink: 0;
    transition: background .15s;
}
#hamburger-btn:hover { background: rgba(255,255,255,.1); }
#hamburger-btn:focus-visible { outline: 2px solid #D4AF37; outline-offset: 2px; }
.hb-line {
    display: block; width: 18px; height: 2px;
    background: currentColor; border-radius: 2px; pointer-events: none;
    transition: background .15s;
}

/* ── Theme toggle button ──────────────────────────────── */
#aa-theme-btn {
    display: flex; align-items: center; justify-content: center;
    width: 36px; height: 36px;
    background: transparent;
    border: 1.5px solid rgba(255,255,255,.25);
    border-radius: 50%;
    cursor: pointer; font-size: 16px; line-height: 1;
    flex-shrink: 0;
    transition: background .15s, border-color .15s;
    color: inherit;
}
#aa-theme-btn:hover {
    background: rgba(255,255,255,.1);
    border-color: rgba(255,255,255,.5);
}
#aa-theme-btn:focus-visible { outline: 2px solid #D4AF37; outline-offset: 2px; }

/* ── User info wrapper on standard pages ──────────────── */
#nav-user-text {
    display: flex; flex-direction: column;
    align-items: flex-start; gap: 0px;
}
#nav-user-text #headerUserName {
    font-size: 13.5px; font-weight: 600; color: #D4AF37;
    line-height: 1.35;
}
#nav-user-text #roleBadge {
    font-size: 11px !important; color: rgba(255,255,255,.6) !important;
    background: transparent !important; padding: 0 !important;
    border-radius: 0 !important; font-weight: 400 !important;
    text-transform: none !important; letter-spacing: 0 !important;
    line-height: 1.3;
}

/* ── User info on admin-pages (.app-header) ───────────── */
.app-header .user-profile {
    display: flex !important; flex-direction: row !important;
    align-items: center !important; gap: 10px !important;
}
.app-header .user-avatar {
    order: -1 !important;
    font-size: 13px !important; font-weight: 700 !important;
}
.app-header .user-meta {
    text-align: left !important;
    display: flex !important; flex-direction: column !important; gap: 1px !important;
}
.app-header .user-meta strong { font-size: 13.5px !important; font-weight: 600 !important; color: #ffffff !important; }
.app-header .user-meta span   { font-size: 11px !important;   color: rgba(255,255,255,.55) !important; }

.app-header .logo-copy .logo,
.app-header .logo-copy > span { display: none !important; }

/* ── Logout button ────────────────────────────────────── */
#logoutBtn {
    background: transparent !important;
    border: 1.5px solid rgba(255,255,255,.4) !important;
    color: rgba(255,255,255,.9) !important;
    padding: 6px 14px !important;
    border-radius: 6px !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    cursor: pointer !important;
    transition: background .15s, border-color .15s !important;
    margin-left: 8px !important;
}
#logoutBtn:hover {
    background: rgba(255,255,255,.1) !important;
    border-color: rgba(255,255,255,.7) !important;
}
#logoutBtn:focus-visible {
    outline: 2px solid #D4AF37 !important; outline-offset: 2px !important;
}

/* ── Mobile ───────────────────────────────────────────── */
@media (max-width: 480px) {
    #app-sidebar { width: 88vw !important; max-width: 290px !important; }
}
        `;
        (document.head || document.documentElement).appendChild(s);
    }

    /* ─────────────────────────────────────────────────────────────────
       HAMBURGER BUTTON INJECTION
       Inserted as the FIRST child of <header> so it appears top-left.
    ───────────────────────────────────────────────────────────────── */
    function _injectHamburger() {
        if (document.getElementById('hamburger-btn')) return;

        var header = document.querySelector('header');
        if (!header) return;

        var btn = document.createElement('button');
        btn.id = 'hamburger-btn';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Open navigation menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'app-sidebar');
        btn.innerHTML =
            '<span class="hb-line"></span>' +
            '<span class="hb-line"></span>' +
            '<span class="hb-line"></span>';

        // insertBefore with firstChild puts it at the very left of the header
        header.insertBefore(btn, header.firstChild);

        // ── Theme toggle button — inject into header right side ──────────
        if (!document.getElementById('aa-theme-btn')) {
            var themeBtn = document.createElement('button');
            themeBtn.id = 'aa-theme-btn';
            themeBtn.type = 'button';
            themeBtn.setAttribute('aria-label', 'Toggle dark/light theme');
            themeBtn.title = 'Toggle theme';
            // Set correct icon based on current theme
            var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            themeBtn.textContent = isDark ? '☀' : '🌙';
            // Append near the end of header (before last child, typically logout/user)
            header.appendChild(themeBtn);

            themeBtn.addEventListener('click', function () {
                var html = document.documentElement;
                var current = html.getAttribute('data-theme');
                if (current === 'dark') {
                    html.removeAttribute('data-theme');
                    localStorage.setItem('aa-theme', 'light');
                    themeBtn.textContent = '🌙';
                    themeBtn.setAttribute('aria-label', 'Switch to dark mode');
                } else {
                    html.setAttribute('data-theme', 'dark');
                    localStorage.setItem('aa-theme', 'dark');
                    themeBtn.textContent = '☀';
                    themeBtn.setAttribute('aria-label', 'Switch to light mode');
                }
            });
        }
    }

    function _fixBranding() {
        var schoolName = window.SCHOOL_NAME || 'Admin Assist Secondary School';

        // Standard pages header (e.g. header:not(.app-header) .logo)
        var logoEl = document.querySelector('header:not(.app-header) .logo');
        if (logoEl) {
            logoEl.innerHTML =
                '<div class="brand-group" style="display:flex;align-items:center;gap:10px;">' +
                '<div class="logo-mark" style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#1a5580,#2b84d9);border:2px solid #d4af37;color:#d4af37;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">AA</div>' +
                '<div class="brand-titles" style="display:flex;flex-direction:column;">' +
                '<span class="school-title" style="font-size:14px;font-weight:700;color:#ffffff;line-height:1.2;">' + _escapeHtml(schoolName) + '</span>' +
                '<span class="sub-title" style="font-size:10px;color:#d4af37;font-weight:600;letter-spacing:.05em;text-transform:uppercase;">Admin Assist SIS</span>' +
                '</div>' +
                '</div>';
            logoEl.style.background = 'none';
            logoEl.style.border = 'none';
            logoEl.style.padding = '0';
        }

        // Admin-pages header (.app-header)
        var appLogoGroup = document.querySelector('.app-header .logo-group');
        if (appLogoGroup) {
            var logoCopy = appLogoGroup.querySelector('.logo-copy');
            if (logoCopy) {
                logoCopy.innerHTML =
                    '<div class="logo" style="display:block!important;font-size:14px;font-weight:700;color:#ffffff;">' + _escapeHtml(schoolName) + '</div>' +
                    '<span style="display:block!important;font-size:11px;color:rgba(255,255,255,.6);">School Management System</span>';
            }
        }
    }


    function _fixUserInfoLayout() {
        var nameEl = document.getElementById('headerUserName');
        var badgeEl = document.getElementById('roleBadge');

        if (nameEl && badgeEl && !document.getElementById('nav-user-text')) {
            var wrap = document.createElement('div');
            wrap.id = 'nav-user-text';
            nameEl.parentNode.insertBefore(wrap, nameEl);
            wrap.appendChild(nameEl);
            wrap.appendChild(badgeEl);
        }
    }

    /* ─────────────────────────────────────────────────────────────────
       OPEN / CLOSE
    ───────────────────────────────────────────────────────────────── */
    function _openSidebar() {
        var sidebar = document.getElementById('app-sidebar');
        var backdrop = document.getElementById('sidebar-backdrop');
        var hamburger = document.getElementById('hamburger-btn');

        if (sidebar) sidebar.classList.add('is-open');
        if (backdrop) { backdrop.classList.add('is-visible'); backdrop.setAttribute('aria-hidden', 'false'); }
        if (hamburger) hamburger.setAttribute('aria-expanded', 'true');
        document.body.classList.add('nav-open');

        // Move focus inside the sidebar for keyboard/screen-reader users
        var firstFocusable = document.getElementById('sidebar-close-btn');
        if (firstFocusable) firstFocusable.focus();
    }

    function _closeSidebar() {
        var sidebar = document.getElementById('app-sidebar');
        var backdrop = document.getElementById('sidebar-backdrop');
        var hamburger = document.getElementById('hamburger-btn');

        if (sidebar) sidebar.classList.remove('is-open');
        if (backdrop) { backdrop.classList.remove('is-visible'); backdrop.setAttribute('aria-hidden', 'true'); }
        if (hamburger) { hamburger.setAttribute('aria-expanded', 'false'); hamburger.focus(); }
        document.body.classList.remove('nav-open');
    }

    // Expose for use by other scripts
    window.openSidebar = _openSidebar;
    window.closeSidebar = _closeSidebar;

    /* ─────────────────────────────────────────────────────────────────
       EVENT WIRING
    ───────────────────────────────────────────────────────────────── */
    function _wireEvents() {
        var hamburger = document.getElementById('hamburger-btn');
        var closeBtn = document.getElementById('sidebar-close-btn');
        var backdrop = document.getElementById('sidebar-backdrop');

        // Hamburger toggles sidebar
        if (hamburger) {
            hamburger.addEventListener('click', function () {
                var sidebar = document.getElementById('app-sidebar');
                if (sidebar && sidebar.classList.contains('is-open')) {
                    _closeSidebar();
                } else {
                    _openSidebar();
                }
            });
        }

        if (closeBtn) closeBtn.addEventListener('click', _closeSidebar);
        if (backdrop) backdrop.addEventListener('click', _closeSidebar);

        // Escape key closes the sidebar ONLY when no modal is open.
        // ModalManager registers its own capture-phase handler that fires first
        // and calls e.stopImmediatePropagation(), so this bubbling handler
        // will never run while a modal is active.
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            // Guard: if ModalManager exists and has open modals, do nothing here.
            // (ModalManager's capture listener already handled it.)
            var mm = window.ModalManager;
            if (mm && typeof mm._hasOpen === 'function' && mm._hasOpen()) return;
            _closeSidebar();
        });

        // Clicking a nav link closes the sidebar (important on mobile)
        document.querySelectorAll('.sb-link').forEach(function (link) {
            link.addEventListener('click', function () {
                setTimeout(_closeSidebar, 80);
            });
        });

        // ── User card in sidebar → navigate to profile page ──────────────────────────
        // Runs inside _wireEvents() after all other event binding is done.
        var userCard = document.querySelector('.sb-user');
        if (userCard) {
            userCard.style.cursor = 'pointer';
            userCard.tabIndex = 0;
            userCard.setAttribute('role', 'link');
            userCard.setAttribute('aria-label', 'View or edit your profile');
            userCard.setAttribute('title', 'Manage your profile');

            userCard.addEventListener('click', function () {
                window.location.href = 'update-user-details.html';
            });
            userCard.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    window.location.href = 'update-user-details.html';
                }
            });
        }
    }

    /* ─────────────────────────────────────────────────────────────────
       ACTIVE LINK HIGHLIGHT
    ───────────────────────────────────────────────────────────────── */
    function _markActiveLink() {
        var current = window.location.pathname.split('/').pop() || 'index.html';
        document.querySelectorAll('.sb-link').forEach(function (link) {
            if (link.getAttribute('href') === current) {
                link.classList.add('is-active');
                link.setAttribute('aria-current', 'page');
            }
        });
    }

    /* ─────────────────────────────────────────────────────────────────
       USER DISPLAY
       Populates BOTH header types and the sidebar user card.
       Layout: [Avatar circle with initials] [Full name]
                                              [Role label]
    ───────────────────────────────────────────────────────────────── */
    function _displayUser(user) {
        var fullName = user.fullName || user.name || 'User';
        var role = user.role || 'user';
        var initials = _getInitials(fullName);
        var roleLabel = _formatRole(role);
        var schoolName = window.SCHOOL_NAME || 'Admin Assist Secondary School';
        var staffId = _generateStaffId(user);
        var dept = user.department || _getDepartment(role);

        /* 1 — Sidebar user card */
        _setText('sidebar-avatar', initials);
        _setText('sidebar-name', fullName);
        _setText('sidebar-role', roleLabel);
        _setText('sidebar-staff-id', staffId);
        _setText('sidebar-school-name', schoolName);

        /* 2 — Standard pages header */
        _setText('headerAvatar', initials);
        _setText('headerUserName', fullName);
        var badge = document.getElementById('roleBadge');
        if (badge) badge.textContent = roleLabel;

        /* 3 — Dashboard welcome title & school info */
        var welcome = document.getElementById('welcomeTitle');
        if (welcome) {
            welcome.textContent = 'Welcome, ' + fullName.split(' ')[0] + '!';
        }
        _setText('dashSchoolName', schoolName);
        _setText('dashStaffId', staffId);
        _setText('dashDepartment', dept);

        /* 4 — Admin-pages header (.app-header) */
        var metaName = document.querySelector('.app-header .user-meta strong');
        var metaRole = document.querySelector('.app-header .user-meta span');
        var appAvt = document.querySelector('.app-header .user-avatar');
        if (metaName) metaName.textContent = fullName;
        if (metaRole) metaRole.textContent = roleLabel;
        if (appAvt) appAvt.textContent = initials;

        /* 5 — Data attributes contract for pages */
        document.querySelectorAll('[data-user-name]')
            .forEach(function (el) { el.textContent = fullName; });
        document.querySelectorAll('[data-user-role]')
            .forEach(function (el) { el.textContent = roleLabel; });
        document.querySelectorAll('[data-user-initials]')
            .forEach(function (el) { el.textContent = initials; });
        document.querySelectorAll('[data-school-name]')
            .forEach(function (el) { el.textContent = schoolName; });
        document.querySelectorAll('[data-staff-id]')
            .forEach(function (el) { el.textContent = staffId; });
        document.querySelectorAll('[data-department]')
            .forEach(function (el) { el.textContent = dept; });
    }

    /* ─────────────────────────────────────────────────────────────────
       ROLE-BASED ACCESS
    ───────────────────────────────────────────────────────────────── */
    function _applyRbac(role) {
        // Sidebar nav items with data-roles="..." are hidden if role not listed
        document.querySelectorAll('.sb-item[data-roles]').forEach(function (item) {
            var allowed = (item.dataset.roles || '').split(' ');
            item.style.display = allowed.indexOf(role) !== -1 ? '' : 'none';
        });

        // Admin-only page elements (stat cards, quick-access cards)
        var isPrivileged = role === 'admin' || role === 'headmaster';
        document.querySelectorAll('.admin-only').forEach(function (el) {
            el.style.display = isPrivileged ? '' : 'none';
        });
    }

    /* ─────────────────────────────────────────────────────────────────
       LOGOUT
    ───────────────────────────────────────────────────────────────── */
    function _wireLogout() {
        ['logoutBtn', 'sidebar-logout-btn'].forEach(function (id) {
            var btn = document.getElementById(id);
            if (!btn || btn.dataset.wired) return;
            btn.dataset.wired = 'true';
            btn.addEventListener('click', _doLogout);
        });
    }

    async function _doLogout() {
        try {
            await authFetch(API_BASE + '/auth/logout', { method: 'POST' });
        } catch (e) { /* clear session locally even if network fails */ }
        clearSession();
        window.location.href = 'login.html';
    }

    /* ─────────────────────────────────────────────────────────────────
       HELPERS
    ───────────────────────────────────────────────────────────────── */
    function _generateStaffId(user) {
        if (!user) return 'AA-STF-2025-0001';
        if (user.staffId || user.staff_id) return user.staffId || user.staff_id;
        var role = (user.role || 'user').toLowerCase();
        var prefix = 'STF';
        if (role === 'admin') prefix = 'ADM';
        else if (role === 'headmaster') prefix = 'EXE';
        else if (role === 'teacher') prefix = 'TCH';
        else if (role === 'staff') prefix = 'STF';

        var idNum = String(user.id || 1).padStart(4, '0');
        return 'AA-' + prefix + '-2025-' + idNum;
    }

    function _getDepartment(role) {
        var map = {
            admin: 'Administration',
            headmaster: 'Executive Office',
            teacher: 'Academic Department',
            staff: 'School Operations',
            user: 'General Staff'
        };
        return map[(role || '').toLowerCase()] || 'General Operations';
    }

    function _escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function _getInitials(name) {
        return String(name || '')
            .split(' ')
            .filter(Boolean)
            .map(function (n) { return n.charAt(0).toUpperCase(); })
            .slice(0, 2)
            .join('');
    }

    function _formatRole(role) {
        var map = {
            admin: 'Administrator',
            headmaster: 'Head Master',
            staff: 'Staff',
            user: 'User'
        };
        return map[role] || (role.charAt(0).toUpperCase() + role.slice(1));
    }

})();