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

        const user = typeof getUser === 'function' ? getUser() : null;
        const role = data.role || (user && user.role) || 'user';
        const position = (user && user.school_position) || '';
        const isHeadTeacher = (role === 'headmaster') || (position === 'Head Teacher');

        // Hide all views first
        document.querySelectorAll('.role-dashboard').forEach(el => el.classList.remove('is-active'));

        // ── 1. STAFF DASHBOARD ─────────────────────────────────────────
        if (role === 'staff' && !isHeadTeacher) {
            const staffEl = document.getElementById('staffDashboard');
            if (staffEl) staffEl.classList.add('is-active');

            _setText('staffStatClasses', _fmt(data.assignedClassesCount));
            _setText('staffStatSubjects', _fmt(data.assignedSubjectsCount));

            const ttCount = data.todayClassesCount != null ? Number(data.todayClassesCount) : 0;
            _setText('staffStatTimetable', String(ttCount));

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

            // Wire timetable modal opener
            initTimetableModal();
            return;
        }

        // ── 2. UNIFIED STUDENT / PARENT DASHBOARD (Redirects to Transcript) ──
        if (role === 'user') {
            window.location.replace('student-transcript.html');
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

        // Dual Access: Admin + Teacher
        const teacherStrip = document.getElementById('adminTeacherStrip');
        if (teacherStrip) {
            const isTeacher = !!(data.is_teacher || (user && (user.is_teacher || user.school_position === 'Teacher')));
            if (isTeacher) {
                teacherStrip.style.display = 'block';
                const sub = document.getElementById('adminTeacherSubtitle');
                if (sub) {
                    const cls = data.assignedClassesCount || 0;
                    const subCount = data.assignedSubjectsCount || 0;
                    sub.textContent = `You are assigned to ${cls} ${cls === 1 ? 'class' : 'classes'} and ${subCount} ${subCount === 1 ? 'subject' : 'subjects'} alongside system administration duties.`;
                }
            } else {
                teacherStrip.style.display = 'none';
            }
        }

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

/* ── Timetable Modal Controller ────────────────────────────────────── */
let isTimetableModalBound = false;

function initTimetableModal() {
    const card = document.getElementById('staffTimetableCard');
    const linkBtn = document.getElementById('viewTodayScheduleBtn');
    const modal = document.getElementById('timetableModal');
    if (!card || !modal || isTimetableModalBound) return;
    isTimetableModalBound = true;

    const closeBtns = [
        document.getElementById('closeTimetableModalBtn'),
        document.getElementById('closeTimetableModalFooterBtn')
    ];
    closeBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', () => { modal.hidden = true; });
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.hidden = true;
    });

    const openModal = () => {
        modal.hidden = false;
        setActiveTimetableTab('today');
        loadTimetableData('today');
    };

    card.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
    });

    if (linkBtn) {
        linkBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            openModal();
        });
    }

    const tabToday = document.getElementById('ttTabToday');
    const tabWeek = document.getElementById('ttTabWeek');

    if (tabToday) {
        tabToday.addEventListener('click', () => {
            setActiveTimetableTab('today');
            loadTimetableData('today');
        });
    }

    if (tabWeek) {
        tabWeek.addEventListener('click', () => {
            setActiveTimetableTab('week');
            loadTimetableData('week');
        });
    }
}

function setActiveTimetableTab(tab) {
    const tabToday = document.getElementById('ttTabToday');
    const tabWeek = document.getElementById('ttTabWeek');
    if (!tabToday || !tabWeek) return;

    if (tab === 'today') {
        tabToday.style.background = '#fff';
        tabToday.style.color = 'var(--aa-blue, #2563EB)';
        tabToday.style.fontWeight = '600';
        tabToday.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
        tabToday.style.border = '1px solid var(--aa-border, #E2E8F0)';

        tabWeek.style.background = 'transparent';
        tabWeek.style.color = 'var(--aa-text-muted)';
        tabWeek.style.fontWeight = '400';
        tabWeek.style.boxShadow = 'none';
        tabWeek.style.border = 'none';
    } else {
        tabWeek.style.background = '#fff';
        tabWeek.style.color = 'var(--aa-blue, #2563EB)';
        tabWeek.style.fontWeight = '600';
        tabWeek.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
        tabWeek.style.border = '1px solid var(--aa-border, #E2E8F0)';

        tabToday.style.background = 'transparent';
        tabToday.style.color = 'var(--aa-text-muted)';
        tabToday.style.fontWeight = '400';
        tabToday.style.boxShadow = 'none';
        tabToday.style.border = 'none';
    }
}

async function loadTimetableData(mode) {
    const titleEl = document.getElementById('timetableModalTitle');
    const subtitleEl = document.getElementById('timetableModalSubtitle');
    const loadingEl = document.getElementById('ttModalLoading');
    const emptyEl = document.getElementById('ttModalEmpty');
    const tableWrap = document.getElementById('ttModalTableWrap');
    const tbody = document.getElementById('ttModalBody');
    const countBadge = document.getElementById('ttModalCountBadge');
    const colDay = document.getElementById('ttColDay');

    if (loadingEl) loadingEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    if (tableWrap) tableWrap.hidden = true;

    try {
        const endpoint = mode === 'week' ? '/api/timetable/my/week' : '/api/timetable/my/today';
        const res = await apiFetch(endpoint);
        if (!res || !res.ok) throw new Error('Failed to fetch timetable');
        const data = await res.json();

        const periods = data.timetable || [];
        if (countBadge) {
            countBadge.textContent = `${periods.length} ${periods.length === 1 ? 'class' : 'classes'}`;
        }

        if (mode === 'week') {
            if (titleEl) titleEl.textContent = 'Weekly Teaching Timetable';
            if (subtitleEl) subtitleEl.textContent = 'Full schedule for Monday through Friday';
            if (colDay) colDay.style.display = '';
        } else {
            if (titleEl) titleEl.textContent = "Today's Teaching Schedule";
            if (subtitleEl) subtitleEl.textContent = data.date_formatted || data.day || 'Today';
            if (colDay) colDay.style.display = 'none';
        }

        if (loadingEl) loadingEl.hidden = true;

        if (!periods.length) {
            if (emptyEl) emptyEl.hidden = false;
            if (tableWrap) tableWrap.hidden = true;
            return;
        }

        if (tbody) {
            tbody.innerHTML = periods.map(p => {
                const startTime = p.start_time_formatted || (p.start_time || '').substring(0, 5);
                const endTime = p.end_time_formatted || (p.end_time || '').substring(0, 5);
                const timeRange = `${startTime} – ${endTime}`;
                const dayCell = mode === 'week' ? `<td><span class="aa-badge">${_esc(p.day_of_week)}</span></td>` : '';
                return `
                    <tr>
                        <td><strong>${_esc(timeRange)}</strong></td>
                        ${dayCell}
                        <td><strong>${_esc(p.class_name)}</strong></td>
                        <td>${_esc(p.subject_name || p.subject_code)}</td>
                        <td>${_esc(p.room || '—')}</td>
                    </tr>
                `;
            }).join('');
        }

        if (tableWrap) tableWrap.hidden = false;
    } catch (err) {
        console.error('loadTimetableData:', err);
        if (loadingEl) loadingEl.hidden = true;
        if (emptyEl) {
            emptyEl.hidden = false;
            const p = emptyEl.querySelector('p');
            if (p) p.textContent = 'Unable to load timetable periods: ' + err.message;
        }
    }
}