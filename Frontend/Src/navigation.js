/**
 * navigation.js — Sidebar, Branding, and User Display
 *
 * WHAT THIS FILE DOES:
 *  Step 0 – Injects critical CSS synchronously so the sidebar is
 *            ALWAYS off-screen before any paint. This is the fix
 *            for the sidebar appearing at the bottom of the page.
 *  Step 1 – After DOM is ready: injects sidebar HTML and hamburger button.
 *  Step 2 – Fixes header branding (Admin Assist → AA box).
 *  Step 3 – Fixes user info layout → [Avatar] [Name / Role stacked].
 *  Step 4 – Populates user data: fast from localStorage, accurate from API.
 *  Step 5 – Applies role-based nav link visibility.
 *  Step 6 – Wires all events: hamburger, close, backdrop, Escape, logout.
 *
 * Load order on every protected page:
 *   auth.js → auth-guard.js → navigation.js → page-specific script
 */

(function () {
    'use strict';

    /* ─────────────────────────────────────────────────────────────────
       STEP 0 — INJECT CRITICAL CSS IMMEDIATELY (synchronous)
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
        {
            href: 'dashboard.html',
            label: 'Dashboard',
            icon: '🏠',
            roles: []
        },
        {
            href: 'students.html',
            label: 'Student Directory',
            icon: '👥',
            roles: []
        },
        {
            href: 'enroll-student.html',
            label: 'Enroll Student',
            icon: '📝',
            roles: ['admin', 'headmaster', 'staff']
        },
        {
            href: 'attendance-management.html',
            label: 'Attendance',
            icon: '📊',
            roles: []
        },
        {
            href: 'academic-records.html',
            label: 'Academic Records',
            icon: '📄',
            roles: []
        },
        {
            href: 'generate-report.html',
            label: 'Reports',
            icon: '📈',
            roles: ['admin', 'headmaster']
        }
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
            'width:280px!important;height:100vh!important;' +
            'background:#0A1628!important;color:#fff!important;' +
            'z-index:9999!important;' +
            'display:flex!important;flex-direction:column!important;' +
            'overflow-y:auto!important;overflow-x:hidden!important;' +
            'transform:translateX(-100%)!important;' +
            'visibility:hidden!important;pointer-events:none!important;' +
            'transition:transform .3s cubic-bezier(.4,0,.2,1),' +
            'visibility 0s .3s!important;' +
            '}' +
            '#app-sidebar.is-open{' +
            'transform:translateX(0)!important;' +
            'visibility:visible!important;pointer-events:all!important;' +
            'transition:transform .3s cubic-bezier(.4,0,.2,1),' +
            'visibility 0s 0s!important;' +
            '}' +
            '#sidebar-backdrop{' +
            'position:fixed!important;inset:0!important;' +
            'background:rgba(0,0,0,.52)!important;' +
            'z-index:9998!important;' +
            'opacity:0!important;pointer-events:none!important;' +
            'transition:opacity .3s ease!important;' +
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

        // Build nav link HTML
        var linksHtml = NAV_LINKS.map(function (l) {
            var roleAttr = l.roles.length
                ? ' data-roles="' + l.roles.join(' ') + '"'
                : '';
            return '<li class="sb-item"' + roleAttr + '>' +
                '<a href="' + l.href + '" class="sb-link">' +
                '<span class="sb-icon" aria-hidden="true">' + l.icon + '</span>' +
                '<span class="sb-label">' + l.label + '</span>' +
                '</a>' +
                '</li>';
        }).join('');

        // Build sidebar element
        var nav = document.createElement('nav');
        nav.id = 'app-sidebar';
        nav.setAttribute('aria-label', 'Main navigation');
        nav.innerHTML =
            // ── Header: AA brand mark + close button ──
            '<div class="sb-head">' +
            '<div class="sb-brand">' +
            '<div class="sb-brand-mark">AA</div>' +
            '</div>' +
            '<button class="sb-close-btn" id="sidebar-close-btn" ' +
            'aria-label="Close navigation menu" type="button">' +
            '&#x2715;' +
            '</button>' +
            '</div>' +

            // ── User card: [Avatar] [Name / Role] ──
            '<div class="sb-user">' +
            '<div class="sb-avatar" id="sidebar-avatar">?</div>' +
            '<div class="sb-user-text">' +
            '<span class="sb-name" id="sidebar-name">Loading\u2026</span>' +
            '<span class="sb-role" id="sidebar-role"></span>' +
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
/* ── Sidebar header ──────────────────────────────────── */
.sb-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px; min-height: 64px; flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,.08);
}
.sb-brand { display: flex; align-items: center; }
.sb-brand-mark {
    width: 38px; height: 38px; border-radius: 10px;
    background: linear-gradient(135deg, #1a5580 0%, #2b84d9 100%);
    border: 2px solid #d4af37;
    color: #d4af37; font-size: 13px; font-weight: 800;
    letter-spacing: .06em;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; user-select: none;
}
.sb-close-btn {
    background: transparent; border: none;
    color: rgba(255,255,255,.65); font-size: 18px;
    cursor: pointer; width: 32px; height: 32px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    transition: background .15s, color .15s; flex-shrink: 0;
}
.sb-close-btn:hover { background: rgba(255,255,255,.1); color: #fff; }
.sb-close-btn:focus-visible { outline: 2px solid #d4af37; outline-offset: 2px; }

/* ── Sidebar user card ── [Avatar] [Name \n Role] ────── */
.sb-user {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 20px; flex-shrink: 0;
    background: rgba(255,255,255,.04);
    border-bottom: 1px solid rgba(255,255,255,.07);
}

.sb-avatar {
    width: 40px; height: 40px; border-radius: 50%;
    background: linear-gradient(135deg, #d4af37 0%, #f0c674 100%);
    color: #0A1628; font-size: 14px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; letter-spacing: .5px; user-select: none;
}
.sb-user-text {
    display: flex; flex-direction: column; gap: 2px;
    min-width: 0; flex: 1;
}
.sb-name {
    font-size: 13px; font-weight: 600; color: #fff;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sb-role { font-size: 11px; color: rgba(255,255,255,.55); }

/* ── Nav links ───────────────────────────────────────── */
.sb-nav {
    list-style: none; padding: 8px 0; margin: 0; flex: 1;
}

/* ── Sidebar user card hover (signals it's clickable) ── */
.sb-user:hover {
    background: rgba(255,255,255,.07) !important;
    transition: background .15s !important;
}
.sb-user::after {
    content: '✎';
    margin-left: auto;
    font-size: 13px;
    color: rgba(255,255,255,.3);
    padding-right: 4px;
}

.sb-link {
    display: flex; align-items: center; gap: 12px;
    padding: 11px 20px;
    color: rgba(255,255,255,.72); text-decoration: none;
    font-size: 14px; font-weight: 500;
    border-left: 3px solid transparent;
    transition: background .15s, color .15s, border-color .15s;
    white-space: nowrap;
}
.sb-link:hover { background: rgba(255,255,255,.07); color: #fff; }
.sb-link.is-active {
    background: rgba(184,115,51,.15); color: #d4af37;
    border-left-color: #d4af37; font-weight: 600;
}
.sb-link:focus-visible { outline: 2px solid #d4af37; outline-offset: -2px; }
.sb-icon { font-size: 17px; width: 22px; text-align: center; flex-shrink: 0; }

/* ── Sidebar footer / logout ─────────────────────────── */
.sb-footer {
    padding: 8px 0; flex-shrink: 0;
    border-top: 1px solid rgba(255,255,255,.07);
}
.sb-logout-btn {
    display: flex; align-items: center; gap: 12px;
    width: 100%; padding: 11px 20px;
    background: transparent; border: none;
    border-left: 3px solid transparent;
    color: rgba(255,255,255,.65); font-size: 14px; font-weight: 500;
    font-family: inherit; cursor: pointer; text-align: left;
    transition: background .15s, color .15s, border-color .15s;
}
.sb-logout-btn:hover {
    background: rgba(217,64,64,.12);
    color: #ff8a8a; border-left-color: #c0392b;
}
.sb-logout-btn:focus-visible { outline: 2px solid #d4af37; outline-offset: -2px; }

/* ── Hamburger button ────────────────────────────────── */
#hamburger-btn {
    display: flex; flex-direction: column;
    justify-content: center; align-items: center; gap: 5px;
    width: 40px; height: 40px; padding: 8px;
    background: transparent; border: none;
    border-radius: 6px; cursor: pointer;
    flex-shrink: 0; margin-right: 8px;
    transition: background .2s;
}
#hamburger-btn:hover { background: rgba(255,255,255,.12); }
#hamburger-btn:focus-visible { outline: 2px solid #d4af37; outline-offset: 2px; }
.hb-line {
    display: block; width: 20px; height: 2px;
    background: #ffffff; border-radius: 2px; pointer-events: none;
}

/* ── User info wrapper on standard pages ─────────────── */
/* #nav-user-text wraps #headerUserName + #roleBadge so they stack */
#nav-user-text {
    display: flex; flex-direction: column;
    align-items: flex-start; gap: 1px;
}
#nav-user-text #headerUserName {
    font-size: 14px; font-weight: 600; color: #d4af37;
    line-height: 1.3;
}
#nav-user-text #roleBadge {
    font-size: 11px !important; color: rgba(255,255,255,.7) !important;
    background: transparent !important; padding: 0 !important;
    border-radius: 0 !important; font-weight: 500 !important;
    text-transform: none !important; letter-spacing: 0 !important;
    line-height: 1.3;
}

/* ── User info on admin-pages (.app-header) ──────────── */
/* Reorder: [Avatar first] [Name / Role stacked] */
.app-header .user-profile {
    display: flex !important; flex-direction: row !important;
    align-items: center !important; gap: 10px !important;
}
.app-header .user-avatar {
    order: -1 !important;          /* visually moves avatar before meta text */
    font-size: 14px !important;
    font-weight: 700 !important;
}
.app-header .user-meta {
    text-align: left !important;   /* was right-aligned in admin-pages.css */
    display: flex !important;
    flex-direction: column !important; gap: 2px !important;
}
.app-header .user-meta strong {
    font-size: 14px !important; font-weight: 600 !important;
    color: #ffffff !important;
}
.app-header .user-meta span {
    font-size: 11px !important; color: rgba(255,255,255,.6) !important;
}

/* ── AA branding: hide "Admin Assist" text on admin-pages ─ */
/* .logo-mark already shows "AA" — we hide the text beside it */
.app-header .logo-copy .logo,
.app-header .logo-copy > span { display: none !important; }

/* ── Logout button — standardized white-outline style ── */
/* Overrides the red style in dashboard.css */
#logoutBtn {
    background: transparent !important;
    border: 1px solid rgba(255,255,255,.65) !important;
    color: #ffffff !important;
    padding: 7px 14px !important;
    border-radius: 6px !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    cursor: pointer !important;
    transition: background .2s, border-color .2s !important;
    margin-left: 8px !important;
}
#logoutBtn:hover {
    background: rgba(255,255,255,.12) !important;
    border-color: #ffffff !important;
}
#logoutBtn:focus-visible {
    outline: 2px solid #d4af37 !important; outline-offset: 2px !important;
}

/* ── Mobile ──────────────────────────────────────────── */
@media (max-width: 480px) {
    #app-sidebar { width: 100% !important; max-width: 300px !important; }
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
    }

    /* ─────────────────────────────────────────────────────────────────
       BRANDING FIX
       Standard pages have: <div class="logo">Admin Assist</div>
       Replace text with "AA" and style it like the login page logo mark.
    ───────────────────────────────────────────────────────────────── */
    function _fixBranding() {
        // Standard pages
        var logoEl = document.querySelector('header:not(.app-header) .logo');
        if (logoEl && logoEl.textContent.trim() === 'Admin Assist') {
            logoEl.textContent = 'AA';
            // Apply box styling inline to ensure it's visible even without navigation.css
            logoEl.setAttribute('style',
                'display:inline-flex;align-items:center;justify-content:center;' +
                'width:38px;height:38px;border-radius:10px;' +
                'background:linear-gradient(135deg,#1a5580,#2b84d9);' +
                'border:2px solid #d4af37;color:#d4af37;' +
                'font-size:13px;font-weight:800;letter-spacing:.06em;' +
                'flex-shrink:0;user-select:none;text-decoration:none;'
            );
        }
        // Admin-pages: logo-mark already shows "AA"; CSS hides the adjacent text
    }

    /* ─────────────────────────────────────────────────────────────────
       USER INFO LAYOUT FIX
       Standard pages have #headerUserName and #roleBadge as siblings.
       Wrap them in #nav-user-text so they stack vertically.
       Final layout: [avatar] [Name  ]
                               [Role  ]
    ───────────────────────────────────────────────────────────────── */
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

        // Escape key closes the sidebar
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') _closeSidebar();
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

        /* 1 — Sidebar user card */
        _setText('sidebar-avatar', initials);
        _setText('sidebar-name', fullName);
        _setText('sidebar-role', roleLabel);

        /* 2 — Standard pages header (dashboard, students, enroll, etc.)
               #headerAvatar | #nav-user-text > [#headerUserName / #roleBadge] */
        _setText('headerAvatar', initials);
        _setText('headerUserName', fullName);
        var badge = document.getElementById('roleBadge');
        if (badge) badge.textContent = roleLabel;

        /* 3 — Dashboard welcome title */
        var welcome = document.getElementById('welcomeTitle');
        if (welcome) {
            welcome.textContent = 'Welcome, ' + fullName.split(' ')[0] + '!';
        }

        /* 4 — Admin-pages header (.app-header)
               .user-meta > [strong / span] + .user-avatar */
        var metaName = document.querySelector('.app-header .user-meta strong');
        var metaRole = document.querySelector('.app-header .user-meta span');
        var appAvt = document.querySelector('.app-header .user-avatar');
        if (metaName) metaName.textContent = fullName;
        if (metaRole) metaRole.textContent = roleLabel;
        if (appAvt) appAvt.textContent = initials;

        /* 5 — data-user-* attribute contract for future pages */
        document.querySelectorAll('[data-user-name]')
            .forEach(function (el) { el.textContent = fullName; });
        document.querySelectorAll('[data-user-role]')
            .forEach(function (el) { el.textContent = roleLabel; });
        document.querySelectorAll('[data-user-initials]')
            .forEach(function (el) { el.textContent = initials; });
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