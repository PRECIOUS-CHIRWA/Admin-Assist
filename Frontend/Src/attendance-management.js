// attendance-management.js — Sprint 3 (refactored with ModalManager)
// Depends on: auth.js (apiFetch, API_BASE), auth-guard.js, navigation.js, modal-manager.js

(function () {
    'use strict';

    let allClasses = [];
    let allTerms   = [];
    let allSubjects = [];
    let rosterStudents = [];

    // ─── Bootstrap ───────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', async () => {
        await Promise.all([loadClasses(), loadTerms()]);
        await loadSessions();
        bindFilterEvents();
        bindModalEvents();
    });

    // ─── Initial data loads ──────────────────────────────────────────────────

    async function loadClasses() {
        try {
            const res = await apiFetch('/api/attendance/classes');
            if (!res || !res.ok) throw new Error('Failed to load classes');
            allClasses = await res.json();
            populateSelect('filterClass', allClasses, 'id', classLabel, 'All Classes');
            populateSelect('sessionClass', allClasses, 'id', classLabel, '— Select Class —');
        } catch (err) {
            console.error('Failed to load classes:', err);
        }
    }

    async function loadTerms() {
        try {
            const res = await apiFetch('/api/attendance/terms');
            if (!res || !res.ok) throw new Error('Failed to load terms');
            allTerms = await res.json();
            populateSelect('filterTerm', allTerms, 'id', termLabel, 'All Terms');
            populateSelect('sessionTerm', allTerms, 'id', termLabel, '— Select Term —');

            // Pre-select the current term
            const current = allTerms.find(t => t.is_current);
            if (current) document.getElementById('sessionTerm').value = current.id;
        } catch (err) {
            console.error('Failed to load terms:', err);
        }
    }

    async function loadSubjectsForSession() {
        try {
            const res = await apiFetch('/api/subjects?is_active=1');
            if (!res || !res.ok) return;
            allSubjects = await res.json();
            populateSelect('sessionSubject', allSubjects, 'id', s => s.subject_name, 'General Roll Call');
        } catch (err) {
            console.error('Failed to load subjects:', err);
        }
    }

    // ─── Sessions table ──────────────────────────────────────────────────────

    async function loadSessions() {
        const params = new URLSearchParams();
        const classId  = document.getElementById('filterClass').value;
        const termId   = document.getElementById('filterTerm').value;
        const fromDate = document.getElementById('filterFromDate').value;
        const toDate   = document.getElementById('filterToDate').value;

        if (classId)  params.set('class_id',  classId);
        if (termId)   params.set('term_id',   termId);
        if (fromDate) params.set('from_date', fromDate);
        if (toDate)   params.set('to_date',   toDate);

        try {
            const res = await apiFetch(`/api/attendance/sessions?${params}`);
            if (!res || !res.ok) throw new Error('Failed to load sessions');
            const sessions = await res.json();
            renderSessions(sessions);
        } catch (err) {
            console.error('Failed to load sessions:', err);
        }
    }

    function renderSessions(sessions) {
        const tbody = document.getElementById('sessionsTableBody');
        const empty = document.getElementById('sessionsEmptyState');
        const badge = document.getElementById('sessionCountBadge');

        badge.textContent = `${sessions.length} session${sessions.length === 1 ? '' : 's'}`;

        if (!sessions.length) {
            tbody.innerHTML = '';
            empty.hidden = false;
            return;
        }
        empty.hidden = true;

        tbody.innerHTML = sessions.map(s => `
        <tr>
          <td>${formatDate(s.attendance_date)}</td>
          <td>${escapeHtml(s.class_name)}</td>
          <td>${escapeHtml(s.period)}</td>
          <td>${escapeHtml(s.teacher_name)}</td>
          <td>${s.present_count || 0}</td>
          <td>${s.absent_count  || 0}</td>
          <td>${s.late_count    || 0}</td>
          <td>${s.excused_count || 0}</td>
          <td><span class="aa-rate-pill ${rateClass(s)}">${attendanceRate(s)}%</span></td>
          <td class="aa-table-actions">
            <button class="aa-link-btn" data-view="${s.id}">View</button>
            <button class="aa-link-btn aa-link-danger" data-delete="${s.id}">Delete</button>
          </td>
        </tr>`).join('');

        tbody.querySelectorAll('[data-view]').forEach(btn =>
            btn.addEventListener('click', () => viewSession(btn.dataset.view))
        );
        tbody.querySelectorAll('[data-delete]').forEach(btn =>
            btn.addEventListener('click', () => deleteSession(btn.dataset.delete))
        );
    }

    function attendanceRate(s) {
        const total = (s.present_count || 0) + (s.absent_count || 0) +
                      (s.late_count    || 0) + (s.excused_count || 0);
        if (!total) return '0.0';
        return (((s.present_count || 0) / total) * 100).toFixed(1);
    }

    function rateClass(s) {
        const rate = parseFloat(attendanceRate(s));
        if (rate >= 90) return 'aa-rate-good';
        if (rate >= 75) return 'aa-rate-ok';
        return 'aa-rate-low';
    }

    // ─── View / Delete session ───────────────────────────────────────────────

    async function viewSession(id) {
        try {
            const res = await apiFetch(`/api/attendance/sessions/${id}`);
            if (!res || !res.ok) throw new Error('Failed');
            const { session, records } = await res.json();

            document.getElementById('viewSessionContent').innerHTML = `
        <div class="aa-summary-list">
          <div class="aa-line-item"><span>Class</span><strong>${escapeHtml(session.class_name)}</strong></div>
          <div class="aa-line-item"><span>Date</span><strong>${formatDate(session.attendance_date)}</strong></div>
          <div class="aa-line-item"><span>Period</span><strong>${escapeHtml(session.period)}</strong></div>
          <div class="aa-line-item"><span>Teacher</span><strong>${escapeHtml(session.teacher_name)}</strong></div>
          <div class="aa-line-item"><span>Term</span><strong>${escapeHtml(session.term_name)} (${escapeHtml(session.year_label)})</strong></div>
        </div>
        <div class="aa-table-wrap" style="margin-top:1rem">
          <table class="aa-table">
            <thead><tr><th>Adm No</th><th>Student</th><th>Status</th><th>Remarks</th></tr></thead>
            <tbody>
              ${records.map(r => `
              <tr>
                <td>${escapeHtml(r.admission_number)}</td>
                <td>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</td>
                <td><span class="aa-status-pill aa-status-${r.status}">${r.status}</span></td>
                <td>${escapeHtml(r.remarks || '—')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

            ModalManager.open('viewSessionModal');
        } catch {
            ModalManager.toast('Unable to load session details.', 'error');
        }
    }

    async function deleteSession(id) {
        if (!confirm('Delete this attendance session and all its records? This cannot be undone.')) return;
        try {
            const res = await apiFetch(`/api/attendance/sessions/${id}`, { method: 'DELETE' });
            if (!res || !res.ok) throw new Error('Delete failed');
            ModalManager.toast('Session deleted successfully.', 'success');
            await loadSessions();
        } catch {
            ModalManager.toast('Unable to delete session.', 'error');
        }
    }

    // ─── Filters ─────────────────────────────────────────────────────────────

    function bindFilterEvents() {
        ['filterClass', 'filterTerm', 'filterFromDate', 'filterToDate'].forEach(id =>
            document.getElementById(id).addEventListener('change', loadSessions)
        );
        document.getElementById('clearFiltersBtn').addEventListener('click', () => {
            ['filterClass', 'filterTerm', 'filterFromDate', 'filterToDate']
                .forEach(id => (document.getElementById(id).value = ''));
            loadSessions();
        });
    }

    // ─── Take Attendance modal ────────────────────────────────────────────────

    function bindModalEvents() {
        // Open
        document.getElementById('openTakeAttendanceBtn').addEventListener('click', async () => {
            await loadSubjectsForSession();
            document.getElementById('sessionDate').value = new Date().toISOString().split('T')[0];
            showStep(1);
            ModalManager.open('takeAttendanceModal', {
                opener: document.getElementById('openTakeAttendanceBtn'),
            });
        });

        // Close buttons — ModalManager auto-wires .aa-modal-close buttons,
        // but we also wire the Cancel and View-modal close buttons explicitly.
        document.getElementById('cancelTakeAttBtn').addEventListener('click', closeTakeAttendanceModal);
        document.getElementById('closeViewModalBtn').addEventListener('click', () => ModalManager.close('viewSessionModal'));

        // Roster loading
        document.getElementById('loadRosterBtn').addEventListener('click', loadRoster);

        // Navigation between steps
        document.getElementById('backToStep1Btn').addEventListener('click', () => showStep(1));

        // Submit
        document.getElementById('submitAttendanceBtn').addEventListener('click', submitAttendance);

        // Bulk mark buttons
        document.querySelectorAll('[data-bulk]').forEach(btn =>
            btn.addEventListener('click', () => bulkMark(btn.dataset.bulk))
        );
    }

    function closeTakeAttendanceModal() {
        ModalManager.close('takeAttendanceModal');
        // Reset form state after animation
        setTimeout(() => {
            showStep(1);
            rosterStudents = [];
            document.getElementById('rosterList').innerHTML = '';
            document.getElementById('sessionClass').value  = '';
            document.getElementById('sessionDate').value   = '';
            document.getElementById('sessionPeriod').value = 'General';
            document.getElementById('sessionSubject').value = '';
        }, 300);
    }

    function showStep(n) {
        document.getElementById('step1').hidden = (n !== 1);
        document.getElementById('step2').hidden = (n !== 2);
    }

    async function loadRoster() {
        const classId = document.getElementById('sessionClass').value;
        const termId  = document.getElementById('sessionTerm').value;
        const date    = document.getElementById('sessionDate').value;

        if (!classId || !termId || !date) {
            ModalManager.toast('Please select a class, term, and date.', 'warning');
            return;
        }

        ModalManager.setLoading('loadRosterBtn', true, 'Loading…');

        try {
            const res = await apiFetch(`/api/search/students?class_id=${classId}`);
            if (!res || !res.ok) throw new Error('Failed to load roster');
            const { students } = await res.json();

            if (!students || !students.length) {
                ModalManager.toast('This class has no enrolled students yet.', 'warning');
                return;
            }

            rosterStudents = students;
            renderRoster(students);
            showStep(2);
        } catch (err) {
            ModalManager.toast('Unable to load class roster. Please try again.', 'error');
            console.error(err);
        } finally {
            ModalManager.setLoading('loadRosterBtn', false, 'Load Class Roster');
        }
    }

    function renderRoster(students) {
        const list = document.getElementById('rosterList');
        list.innerHTML = students.map(s => `
        <div class="aa-roster-row" data-student-id="${s.id}" role="listitem">
          <div class="aa-roster-name">
            <strong>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</strong>
            <span>${escapeHtml(s.admission_number)}</span>
          </div>
          <div class="aa-roster-statuses">
            ${['present', 'absent', 'late', 'excused'].map(status => `
              <label class="aa-status-radio aa-status-radio-${status}">
                <input type="radio" name="status-${s.id}" value="${status}" ${status === 'present' ? 'checked' : ''} />
                <span>${status}</span>
              </label>`).join('')}
          </div>
        </div>`).join('');
    }

    function bulkMark(status) {
        document.querySelectorAll('.aa-roster-row').forEach(row => {
            const radio = row.querySelector(`input[value="${status}"]`);
            if (radio) radio.checked = true;
        });
    }

    async function submitAttendance() {
        const sessionClass  = document.getElementById('sessionClass').value;
        const sessionTerm   = document.getElementById('sessionTerm').value;
        const sessionDate   = document.getElementById('sessionDate').value;
        const sessionPeriod = document.getElementById('sessionPeriod').value || 'General';
        const sessionSubject = document.getElementById('sessionSubject').value || null;

        // Derive academic_year_id from the selected term (no longer required from frontend)
        const termRecord = allTerms.find(t => String(t.id) === String(sessionTerm));
        const academicYearId = termRecord ? termRecord.academic_year_id : null;

        ModalManager.setLoading('submitAttendanceBtn', true, 'Submitting…');

        try {
            // 1. Create the session
            const sessionRes = await apiFetch('/api/attendance/sessions', {
                method: 'POST',
                body: JSON.stringify({
                    class_id:         sessionClass,
                    term_id:          sessionTerm,
                    academic_year_id: academicYearId,
                    attendance_date:  sessionDate,
                    period:           sessionPeriod,
                    subject_id:       sessionSubject,
                }),
            });

            if (!sessionRes || !sessionRes.ok) {
                const data = await sessionRes.json().catch(() => ({}));
                throw new Error(data.error || 'Unable to create session');
            }

            const { session } = await sessionRes.json();

            // 2. Collect each student's status
            const records = rosterStudents.map(s => {
                const checked = document.querySelector(`input[name="status-${s.id}"]:checked`);
                return { student_id: s.id, status: checked ? checked.value : 'present' };
            });

            // 3. Submit bulk attendance
            const submitRes = await apiFetch(`/api/attendance/sessions/${session.id}/submit`, {
                method: 'POST',
                body: JSON.stringify({ records }),
            });

            if (!submitRes || !submitRes.ok) {
                const data = await submitRes.json().catch(() => ({}));
                throw new Error(data.error || 'Unable to submit attendance');
            }

            ModalManager.toast('Attendance recorded successfully! ✓', 'success');
            closeTakeAttendanceModal();
            await loadSessions();

        } catch (err) {
            ModalManager.toast(err.message || 'Unable to submit attendance.', 'error');
        } finally {
            ModalManager.setLoading('submitAttendanceBtn', false, 'Submit Attendance');
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function classLabel(c) {
        return c.class_name || `${c.grade_level}${c.stream ? ' ' + c.stream : ''}`;
    }

    function termLabel(t) {
        return `${t.term_name} (${t.year_label})`;
    }

    function populateSelect(id, items, valueKey, labelFn, placeholder) {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML =
            `<option value="">${placeholder}</option>` +
            items.map(item =>
                `<option value="${item[valueKey]}">${escapeHtml(labelFn(item))}</option>`
            ).join('');
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
        });
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&',  '&amp;')
            .replaceAll('<',  '&lt;')
            .replaceAll('>',  '&gt;')
            .replaceAll('"',  '&quot;')
            .replaceAll("'",  '&#39;');
    }

})();