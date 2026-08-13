/**
 * dashboard.js — Admin Assist Dashboard
 * Loads: stat cards, today's overview, recent activity notifications.
 * Depends on: auth.js (apiFetch, authFetch, API_BASE)
 */

document.addEventListener('DOMContentLoaded', function () {
    loadDashboardStats();
    loadRecentActivity();
});

/* ── Dashboard Stats (all in one API call) ──────────────────────── */
async function loadDashboardStats() {
    try {
        const res = await apiFetch('/api/dashboard/stats');
        if (!res || !res.ok) return;
        const data = await res.json();

        _setText('statStudents', _fmt(data.totalStudents));
        _setText('statTeachers', _fmt(data.totalTeachers));
        _setText('statAttendance', data.attendanceRate != null ? data.attendanceRate + '%' : '—');
        _setText('statClasses', _fmt(data.totalClasses));

        _setText('overviewPresent', _fmt(data.todayPresent));
        _setText('overviewAbsent', _fmt(data.todayAbsent));
        _setText('overviewLate', _fmt(data.todayLate));
        _setText('overviewNew', _fmt(data.newAdmissions));
    } catch (err) {
        console.error('loadDashboardStats:', err);
    }
}

/* ── Recent Activity → Notifications panel ──────────────────────── */
async function loadRecentActivity() {
    const list = document.getElementById('recentActivityList');
    if (!list) return;

    try {
        const res = await apiFetch('/api/dashboard/recent-activity');
        if (!res || !res.ok) return;
        const items = await res.json();

        if (!Array.isArray(items) || items.length === 0) return; // keep static fallback

        const colours = ['notif-blue', 'notif-green', 'notif-orange', 'notif-red', 'notif-gray'];

        list.innerHTML = items.slice(0, 6).map(function (item, idx) {
            var initials = _initials(item.actorName || item.entityType || 'SYS');
            var colour = colours[idx % colours.length];
            var desc = _esc(item.description || item.action || 'Activity');
            var actor = _esc(item.actorName || 'System');
            var time = _relativeTime(item.createdAt);
            return '<li class="dash-notif-item">' +
                '<div class="dash-notif-avatar ' + colour + '">' + initials + '</div>' +
                '<div class="dash-notif-body">' +
                '<div class="dash-notif-text"><strong>' + actor + '</strong><br><span>' + desc + '</span></div>' +
                '<span class="dash-notif-time">' + time + '</span>' +
                '</div>' +
                '</li>';
        }).join('');
    } catch (err) {
        console.error('loadRecentActivity:', err);
        // Static fallback already in HTML — no action needed
    }
}

/* ── Helpers ─────────────────────────────────────────────────────── */
function _setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
}

function _fmt(n) {
    var num = Number(n);
    if (isNaN(num)) return '—';
    return num.toLocaleString();
}

function _initials(name) {
    return String(name || 'SYS').split(' ').filter(Boolean)
        .map(function (w) { return w[0].toUpperCase(); })
        .slice(0, 2).join('');
}

function _relativeTime(dateStr) {
    if (!dateStr) return '';
    var diff = Date.now() - new Date(dateStr).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + ' min' + (mins > 1 ? 's' : '') + ' ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + ' hour' + (hrs > 1 ? 's' : '') + ' ago';
    var days = Math.floor(hrs / 24);
    if (days === 1) return 'Yesterday';
    return days + ' days ago';
}

function _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}