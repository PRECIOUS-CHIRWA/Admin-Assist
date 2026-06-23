/**
 * navigation.js
 * Injects the sidebar, hamburger button, and user data into every authenticated page.
 *
 * Handles: sidebar open/close, Escape key, backdrop, RBAC nav links,
 *          user display for BOTH header layouts, logout button wiring.
 *
 * Load order: auth.js → auth-guard.js → navigation.js → page-specific script
 */

(function () {

    /* ── Nav link definitions (icon, label, href, required roles) ─────────── */
    const NAV_LINKS = [
        { href: 'dashboard.html', label: 'Dashboard', icon: '🏠', roles: [] },
        { href: 'students.html', label: 'Student Directory', icon: '👥', roles: [] },
        { href: 'enroll-student.html', label: 'Enroll Student', icon: '📝', roles: ['admin', 'headmaster', 'staff'] },
        { href: 'attendance-management.html', label: 'Attendance', icon: '📊', roles: [] },
        { href: 'academic-records.html', label: 'Academic Records', icon: '📄', roles: [] },
        { href: 'generate-report.html', label: 'Reports', icon: '📈', roles: ['admin', 'headmaster'] },
    ];

    /* ── Bootstrap ───────────────────────────────────────────────────────── */
    function init() {
        _injectSidebar();
        _injectHamburger();
        _wireEvents();
        _markActiveLink();

        // Fast display from localStorage — no network required, no flicker
        const stored = getUser();
        if (stored) {
            _displayUser(stored);
            _applyRbac(stored.role);
        }

        // Accurate display from the API — overwrites the localStorage values
        // with server-fresh data; also updates user.fullName if the alias is now live
        loadCurrentUser().then(user => {
            if (user) {
                _displayUser(user);
                _applyRbac(user.role);
            }
        });

        _wireLogout();
    }

    /* ── Sidebar injection ───────────────────────────────────────────────── */
    function _injectSidebar() {
        if (document.getElementById('app-sidebar')) return; // already present

        // Build sidebar element
        const sidebar = document.createElement('nav');
        sidebar.id = 'app-sidebar';
        sidebar.className = 'app-sidebar';
        sidebar.setAttribute('aria-label', 'Main navigation');
        sidebar.setAttribute('role', 'navigation');

        sidebar.innerHTML = `
            <div class="sidebar-header">
                <div class="sidebar-brand">
                    <div class="sidebar-brand-mark">AA</div>
                    <span class="sidebar-brand-name">Admin Assist</span>
                </div>
                <button class="sidebar-close-btn" id="sidebar-close-btn"
                        aria-label="Close navigation">
                    <svg width="18" height="18" viewBox="0 0 18 18"
                         fill="none" aria-hidden="true">
                        <path d="M14 4L4 14M4 4l10 10"
                              stroke="currentColor" stroke-width="2"
                              stroke-linecap="round"/>
                    </svg>
                </button>
            </div>

            <div class="sidebar-user-card">
                <div class="sidebar-avatar" id="sidebar-avatar">?</div>
                <div class="sidebar-user-info">
                    <span class="sidebar-username" id="sidebar-username">Loading…</span>
                    <span class="sidebar-user-role" id="sidebar-user-role"></span>
                </div>
            </div>

            <ul class="sidebar-nav-list">
                ${NAV_LINKS.map(link => `
                    <li class="sidebar-nav-item"
                        ${link.roles.length ? `data-roles="${link.roles.join(' ')}"` : ''}>
                        <a href="${link.href}" class="sidebar-nav-link">
                            <span class="sidebar-nav-icon" aria-hidden="true">${link.icon}</span>
                            <span class="sidebar-nav-label">${link.label}</span>
                        </a>
                    </li>`).join('')}
            </ul>

            <div class="sidebar-footer">
                <button class="sidebar-logout-btn" id="sidebar-logout-btn"
                        aria-label="Log out">
                    <span class="sidebar-nav-icon" aria-hidden="true">🚪</span>
                    <span class="sidebar-nav-label">Logout</span>
                </button>
            </div>
        `;

        document.body.appendChild(sidebar);

        // Backdrop — sits behind the open sidebar
        const backdrop = document.createElement('div');
        backdrop.id = 'sidebar-backdrop';
        backdrop.className = 'sidebar-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        document.body.appendChild(backdrop);
    }

    /* ── Hamburger injection ─────────────────────────────────────────────── */
    function _injectHamburger() {
        if (document.querySelector('.hamburger-btn')) return;

        // Works for both <header> and <header class="app-header">
        const header = document.querySelector('header');
        if (!header) return;

        const btn = document.createElement('button');
        btn.className = 'hamburger-btn';
        btn.id = 'hamburger-btn';
        btn.setAttribute('aria-label', 'Open navigation menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'app-sidebar');
        btn.setAttribute('type', 'button');
        btn.innerHTML = `
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
        `;

        // Prepend so it appears at the very left of the header
        header.insertBefore(btn, header.firstChild);
    }

    /* ── Open / Close ────────────────────────────────────────────────────── */
    function openSidebar() {
        const sidebar = document.getElementById('app-sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        const hamburger = document.getElementById('hamburger-btn');
        if (!sidebar) return;

        sidebar.classList.add('is-open');
        if (backdrop) { backdrop.classList.add('is-visible'); backdrop.setAttribute('aria-hidden', 'false'); }
        if (hamburger) hamburger.setAttribute('aria-expanded', 'true');
        document.body.classList.add('nav-open'); // prevents body scroll on mobile

        // Move focus into sidebar for keyboard/screen-reader users
        const firstLink = sidebar.querySelector('.sidebar-nav-link, .sidebar-close-btn');
        if (firstLink) firstLink.focus();
    }

    function closeSidebar() {
        const sidebar = document.getElementById('app-sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        const hamburger = document.getElementById('hamburger-btn');
        if (!sidebar) return;

        sidebar.classList.remove('is-open');
        if (backdrop) { backdrop.classList.remove('is-visible'); backdrop.setAttribute('aria-hidden', 'true'); }
        if (hamburger) { hamburger.setAttribute('aria-expanded', 'false'); hamburger.focus(); }
        document.body.classList.remove('nav-open');
    }

    /* ── Event wiring ────────────────────────────────────────────────────── */
    function _wireEvents() {
        // Hamburger opens sidebar
        const hamburger = document.getElementById('hamburger-btn');
        if (hamburger) hamburger.addEventListener('click', openSidebar);

        // ✕ button closes sidebar
        const closeBtn = document.getElementById('sidebar-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeSidebar);

        // Backdrop click closes sidebar
        const backdrop = document.getElementById('sidebar-backdrop');
        if (backdrop) backdrop.addEventListener('click', closeSidebar);

        // Escape key closes sidebar
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') closeSidebar();
        });

        // Clicking a nav link closes the sidebar (good UX on mobile)
        document.querySelectorAll('.sidebar-nav-link').forEach(link => {
            link.addEventListener('click', () => {
                // Small delay so the navigation starts before sidebar closes
                setTimeout(closeSidebar, 80);
            });
        });
    }

    /* ── Active link highlight ───────────────────────────────────────────── */
    function _markActiveLink() {
        const current = window.location.pathname.split('/').pop() || 'index.html';
        document.querySelectorAll('.sidebar-nav-link').forEach(link => {
            if (link.getAttribute('href') === current) {
                link.classList.add('is-active');
                link.setAttribute('aria-current', 'page');
            }
        });
    }

    /* ── User display ────────────────────────────────────────────────────── */
    /**
     * _displayUser(user)
     * Populates user info across three different header layouts:
     *   1. Standard pages   — #headerAvatar, #headerUserName, #roleBadge
     *   2. Admin-pages      — .app-header .user-meta strong/span + .user-avatar
     *   3. Sidebar user card — #sidebar-avatar, #sidebar-username, #sidebar-user-role
     *   4. data-user-* attrs — [data-user-name], [data-user-role], [data-user-initials]
     *
     * Display order enforced: [Avatar] [Name] [Role]
     */
    function _displayUser(user) {
        const fullName = user.fullName || user.name || 'User';
        const role = user.role || 'user';
        const initials = _getInitials(fullName);
        const roleLabel = _formatRole(role);

        /* ── 1. Sidebar user card ──────────────────────────────────────────── */
        _setText('sidebar-avatar', initials);
        _setText('sidebar-username', fullName);
        _setText('sidebar-user-role', roleLabel);

        /* ── 2. Standard header (#headerAvatar #headerUserName #roleBadge) ── */
        _setText('headerAvatar', initials);
        _setText('headerUserName', fullName);

        const badge = document.getElementById('roleBadge');
        if (badge) {
            badge.textContent = roleLabel;
            badge.className = `role-badge ${role}`;
        }

        const welcome = document.getElementById('welcomeTitle');
        if (welcome) welcome.textContent = `Welcome, ${fullName.split(' ')[0]}!`;

        /* ── 3. Admin-pages header (.app-header) ──────────────────────────── */
        // These pages have: <strong>Admin User</strong> and <span>Desk title</span>
        const metaName = document.querySelector('.app-header .user-meta strong');
        const metaRole = document.querySelector('.app-header .user-meta span');
        const appAvtr = document.querySelector('.app-header .user-avatar');
        if (metaName) metaName.textContent = fullName;
        if (metaRole) metaRole.textContent = roleLabel;
        if (appAvtr) appAvtr.textContent = initials;

        /* ── 4. data-user-* attribute contract (future pages) ─────────────── */
        document.querySelectorAll('[data-user-name]')
            .forEach(el => el.textContent = fullName);
        document.querySelectorAll('[data-user-role]')
            .forEach(el => el.textContent = roleLabel);
        document.querySelectorAll('[data-user-initials]')
            .forEach(el => el.textContent = initials);
    }

    /* ── RBAC ────────────────────────────────────────────────────────────── */
    function _applyRbac(role) {
        // Hide sidebar nav items that require roles the user doesn't have
        document.querySelectorAll('.sidebar-nav-item[data-roles]').forEach(item => {
            const allowed = (item.dataset.roles || '').split(' ');
            item.style.display = allowed.includes(role) ? '' : 'none';
        });

        // Show/hide .admin-only page elements (stat cards, quick-access cards)
        const isPrivileged = role === 'admin' || role === 'headmaster';
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = isPrivileged ? '' : 'none';
        });
    }

    /* ── Logout wiring ───────────────────────────────────────────────────── */
    function _wireLogout() {
        // Wire BOTH the page's logoutBtn AND the sidebar's logout button
        ['logoutBtn', 'sidebar-logout-btn'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn || btn.dataset.wired) return;
            btn.dataset.wired = 'true';
            btn.addEventListener('click', _doLogout);
        });
    }

    async function _doLogout() {
        try {
            await authFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
        } catch { /* clear locally even if the network call fails */ }
        finally {
            clearSession();
            window.location.href = 'login.html';
        }
    }

    /* ── Private helpers ─────────────────────────────────────────────────── */
    function _setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function _getInitials(name) {
        return String(name || '')
            .split(' ')
            .filter(Boolean)
            .map(n => n.charAt(0).toUpperCase())
            .slice(0, 2)
            .join('');
    }

    function _formatRole(role) {
        const labels = {
            admin: 'Administrator',
            headmaster: 'Head Master',
            staff: 'Staff',
            user: 'User',
        };
        return labels[role] || (role.charAt(0).toUpperCase() + role.slice(1));
    }

    /* ── Expose open/close for use by other scripts if needed ─────────────── */
    window.openSidebar = openSidebar;
    window.closeSidebar = closeSidebar;

    /* ── Run ─────────────────────────────────────────────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init(); // DOM already ready (e.g. script loaded with defer)
    }

})();