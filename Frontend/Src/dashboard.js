/**
 * dashboard.js — Admin Assist Role-Tailored Dashboard Controller
 * Hydrates Admin, Staff, or Unified Student/Parent view based on session role.
 */

document.addEventListener('DOMContentLoaded', function () {
    loadDashboardStats();
    loadRecentActivity();
});

/* ── Dashboard Stats Loader ────────────────────────────────────────── */
async function loadDashboardStats() {
    try {
        const res = await apiFetch('/api/dashboard/stats');
        if (!res || !res.ok) return;
        const data = await res.json();

        const role = data.role || (typeof getUser === 'function' && getUser()?.role) || 'user';

        // Hide all views first
        document.querySelectorAll('.role-dashboard').forEach(el => el.classList.remove('is-active'));

        // ── 1. STAFF DASHBOARD ─────────────────────────────────────────
        if (role === 'staff') {
            const staffEl = document.getElementById('staffDashboard');
            if (staffEl) staffEl.classList.add('is-active');

            _setText('staffStatClasses', _fmt(data.assignedClassesCount));
            _setText('staffStatSubjects', _fmt(data.assignedSubjectsCount));
            _setText('staffStatStudents', _fmt(data.studentsCount));
            _setText('staffStatAttendance', (data.todayAttendance?.rate != null ? data.todayAttendance.rate + '%' : '0%'));

            // Render Assigned Classes Table
            const listEl = document.getElementById('staffAssignedList');
            if (listEl) {
                const classes = data.assignedClasses || [];
                const subjects = data.assignedSubjects || [];
                if (!classes.length) {
                    listEl.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--aa-text-muted)">No classes currently assigned.</td></tr>';
                } else {
                    const subjectNames = subjects.map(s => s.name || s.code).join(', ') || 'Assigned';
                    listEl.innerHTML = classes.map(c => `
                        <tr>
                            <td><strong>${_esc(c.class_name)}</strong></td>
                            <td>${_esc(c.grade_level)}</td>
                            <td>${_esc(subjectNames)}</td>
                        </tr>
                    `).join('');
                }
            }
            return;
        }

        // ── 2. UNIFIED STUDENT / PARENT DASHBOARD ──────────────────────
        if (role === 'user') {
            const studentEl = document.getElementById('studentDashboard');
            if (studentEl) studentEl.classList.add('is-active');

            const st = data.student || {};
            _setText('spStudentName', st.full_name || st.first_name || 'Student Profile');
            _setText('spStatus', st.status || 'Active');
            _setText('spAdmissionNo', st.admission_number || '—');
            _setText('spClass', st.class_name || '—');
            _setText('spGuardian', st.parent_guardian_name ? `${st.parent_guardian_name} (${st.relationship || 'Guardian'})` : '—');
            _setText('spGuardianPhone', st.phone_number || '—');

            const att = data.attendance || {};
            _setText('spAttendanceRate', (att.rate != null ? att.rate + '%' : '—'));
            _setText('spAttPresent', _fmt(att.present || 0));
            _setText('spAttAbsent', _fmt(att.absent || 0));
            _setText('spAttLate', _fmt(att.late || 0));
            _setText('spAttTotal', _fmt(att.total || 0));

            const results = data.results || [];
            _setText('spResultsCount', _fmt(results.length));

            const resList = document.getElementById('studentResultsList');
            if (resList) {
                if (!results.length) {
                    resList.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--aa-text-muted)">No results published yet for this period.</td></tr>';
                } else {
                    resList.innerHTML = results.map(r => `
                        <tr>
                            <td><strong>${_esc(r.subject_name || r.subject_code)}</strong></td>
                            <td>${_esc(r.term_name || '—')}</td>
                            <td>${_fmt(r.total_marks)}</td>
                            <td>${r.percentage != null ? r.percentage + '%' : '—'}</td>
                            <td><span class="badge-grade">${_esc(r.grade_classification || 'Grade ' + r.grade_code)}</span></td>
                        </tr>
                    `).join('');
                }
            }
            return;
        }

        // ── 3. ADMIN DASHBOARD ─────────────────────────────────────────
        const adminEl = document.getElementById('adminDashboard');
        if (adminEl) adminEl.classList.add('is-active');

        _setText('adminStatStudents', _fmt(data.totalStudents));
        _setText('adminStatTeachers', _fmt(data.totalTeachers));
        _setText('adminStatAttendance', data.attendanceRate != null ? data.attendanceRate + '%' : '—');
        _setText('adminStatClasses', _fmt(data.totalClasses));

        _setText('overviewPresent', _fmt(data.todayPresent));
        _setText('overviewAbsent', _fmt(data.todayAbsent));
        _setText('overviewLate', _fmt(data.todayLate));
        _setText('overviewNew', _fmt(data.newAdmissions));

    } catch (err) {
        console.error('loadDashboardStats:', err);
    }
}

/* ── Recent Activity Loader ────────────────────────────────────────── */
async function loadRecentActivity() {
    try {
        const res = await apiFetch('/api/dashboard/recent-activity');
        if (!res || !res.ok) return;
        const items = await res.json();

        if (!Array.isArray(items) || items.length === 0) return;

        const colours = ['notif-blue', 'notif-green', 'notif-orange', 'notif-red', 'notif-gray'];

        const markup = items.slice(0, 6).map(function (item, idx) {
            const initials = _initials(item.actorName || item.entityType || 'SYS');
            const colour = colours[idx % colours.length];
            const desc = _esc(item.description || item.action || 'Activity');
            const actor = _esc(item.actorName || 'System');
            const time = _relativeTime(item.createdAt);
            return '<li class="dash-notif-item">' +
                '<div class="dash-notif-avatar ' + colour + '">' + initials + '</div>' +
                '<div class="dash-notif-body">' +
                '<div class="dash-notif-text"><strong>' + actor + '</strong><br><span>' + desc + '</span></div>' +
                '<span class="dash-notif-time">' + time + '</span>' +
                '</div>' +
                '</li>';
        }).join('');

        const adminList = document.getElementById('adminRecentActivityList');
        if (adminList) adminList.innerHTML = markup;

        const staffList = document.getElementById('staffRecentActivityList');
        if (staffList) staffList.innerHTML = markup;

    } catch (err) {
        console.error('loadRecentActivity:', err);
    }
}

/* ── Helpers ───────────────────────────────────────────────────────── */
function _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function _fmt(n) {
    const num = Number(n);
    if (isNaN(num)) return '—';
    return num.toLocaleString();
}

function _initials(name) {
    return String(name || 'SYS').split(' ').filter(Boolean)
        .map(w => w[0].toUpperCase())
        .slice(0, 2).join('');
}

function _relativeTime(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + ' min' + (mins > 1 ? 's' : '') + ' ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + ' hour' + (hrs > 1 ? 's' : '') + ' ago';
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Yesterday';
    return days + ' days ago';
}

function _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}