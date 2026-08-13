// attendance-management.js — Admin Assist Attendance Management Module
// Orchestration layer for Attendance Management page.
// Depends on: auth.js (apiFetch, API_BASE), auth-guard.js, navigation.js, modal-manager.js

(function () {
    'use strict';

    let allYears = [];
    let allClasses = [];
    let allTerms = [];
    let allSubjects = [];
    let rosterStudents = [];
    let editingSessionId = null;

    // ─── DOM Initialization ───────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', () => {
        initAttendancePage();
    });

    /**
     * initAttendancePage
     * Master initialization entry point for the Attendance Management module.
     */
    async function initAttendancePage() {
        try {
            if (typeof loadCurrentUser === 'function') {
                loadCurrentUser();
            }

            // Load meta-data in parallel
            await Promise.all([
                loadAcademicYears(),
                loadClasses(),
                loadTerms()
            ]);

            // Load initial attendance sessions
            await loadAttendanceSessions();

            // Bind event handlers
            bindFilterEvents();
            bindModalEvents();
        } catch (err) {
            console.error('initAttendancePage error:', err);
            showError('Failed to initialize Attendance Management page.');
        }
    }

    // ─── Data Loaders ─────────────────────────────────────────────────────────

    /**
     * loadAcademicYears
     * Fetches academic years available to the authenticated user's school.
     */
    async function loadAcademicYears() {
        try {
            const res = await apiFetch('/api/attendance/academic-years');
            if (!res || !res.ok) throw new Error('Failed to fetch academic years');
            allYears = await res.json();

            populateSelect('filterYear', allYears, 'id', y => y.year_label, 'All Years');
            populateSelect('sessionYear', allYears, 'id', y => y.year_label, '— Select Year —');

            // Auto-select current academic year in modal if available
            const current = allYears.find(y => y.is_current);
            if (current) {
                const yearSelect = document.getElementById('sessionYear');
                if (yearSelect) {
                    yearSelect.value = current.id;
                    await loadTerms(current.id);
                }
            }
        } catch (err) {
            console.error('loadAcademicYears:', err);
            showError('Unable to load academic years from server.');
        }
    }

    /**
     * loadTerms
     * Retrieves terms for the selected academic year.
     * @param {string|number} [yearId] - optional academic year ID filter
     */
    async function loadTerms(yearId) {
        try {
            const path = yearId ? `/api/attendance/terms?academicYearId=${yearId}` : '/api/attendance/terms';
            const res = await apiFetch(path);
            if (!res || !res.ok) throw new Error('Failed to fetch terms');
            allTerms = await res.json();

            // Populate filterTerm (all terms or filtered by selected year)
            populateSelect('filterTerm', allTerms, 'id', termLabel, 'All Terms');

            // Populate sessionTerm in modal
            const termSelect = document.getElementById('sessionTerm');
            if (termSelect) {
                if (!yearId) {
                    termSelect.innerHTML = '<option value="">— Select Year First —</option>';
                    termSelect.disabled = true;
                } else if (!allTerms.length) {
                    termSelect.innerHTML = '<option value="">No terms available for this academic year</option>';
                    termSelect.disabled = true;
                } else {
                    termSelect.disabled = false;
                    termSelect.innerHTML = '<option value="">— Select Term —</option>' +
                        allTerms.map(t => `<option value="${t.id}">${escapeHtml(termLabel(t))}</option>`).join('');

                    // Auto-select current term if matching year
                    const current = allTerms.find(t => t.is_current);
                    if (current) termSelect.value = current.id;
                }
            }
        } catch (err) {
            console.error('loadTerms:', err);
            showError('Unable to load school terms.');
        }
    }

    /**
     * loadClasses
     * Retrieves configured classes for the authenticated school.
     */
    async function loadClasses() {
        try {
            const res = await apiFetch('/api/attendance/classes');
            if (!res || !res.ok) throw new Error('Failed to fetch classes');
            allClasses = await res.json();

            populateSelect('filterClass', allClasses, 'id', classLabel, 'All Classes');
            populateSelect('sessionClass', allClasses, 'id', classLabel, '— Select Class —');
        } catch (err) {
            console.error('loadClasses:', err);
            showError('Unable to load class list.');
        }
    }

    /**
     * loadSubjects
     * Retrieves applicable subjects for the selected class.
     * @param {string|number} [classId] - optional class ID filter
     */
    async function loadSubjects(classId) {
        try {
            const path = classId ? `/api/attendance/subjects?classId=${classId}` : '/api/attendance/subjects';
            const res = await apiFetch(path);
            if (!res || !res.ok) return;
            allSubjects = await res.json();

            populateSelect('sessionSubject', allSubjects, 'id', s => `${s.subject_code} — ${s.subject_name}`, 'General Roll Call');
        } catch (err) {
            console.error('loadSubjects:', err);
        }
    }

    /**
     * loadClassInfo
     * Displays enrolled count & class teacher banner when class is selected in modal.
     * @param {string|number} classId
     */
    function loadClassInfo(classId) {
        const banner = document.getElementById('classInfoBanner');
        const text = document.getElementById('classInfoText');
        if (!banner || !text) return;

        if (!classId) {
            banner.hidden = true;
            return;
        }

        const cls = allClasses.find(c => String(c.id) === String(classId));
        if (!cls) {
            banner.hidden = true;
            return;
        }

        const enrolled = cls.student_count !== undefined ? cls.student_count : 0;
        const teacherPart = cls.class_teacher_name ? `  ·  Class Teacher: ${cls.class_teacher_name}` : '';
        text.textContent = `${classLabel(cls)}  —  ${enrolled} enrolled student${enrolled !== 1 ? 's' : ''}${teacherPart}`;
        banner.hidden = false;
    }

    // ─── Register & Roster ────────────────────────────────────────────────────

    /**
     * loadRoster
     * Sends selected filters to backend and loads the student roster.
     */
    async function loadRoster() {
        const yearId = document.getElementById('sessionYear').value;
        const termId = document.getElementById('sessionTerm').value;
        const classId = document.getElementById('sessionClass').value;
        const date = document.getElementById('sessionDate').value;
        const period = document.getElementById('sessionPeriod').value || 'General';
        const subjectId = document.getElementById('sessionSubject').value || '';

        if (!yearId || !termId || !classId || !date) {
            showError('Please select Academic Year, Term, Class, and Date.');
            return;
        }

        ModalManager.setLoading('loadRosterBtn', true, 'Loading Register…');

        try {
            const params = new URLSearchParams({
                class_id: classId,
                term_id: termId,
                academic_year_id: yearId,
                date: date,
                period: period,
            });
            if (subjectId) params.append('subject_id', subjectId);

            const res = await apiFetch(`/api/attendance/register?${params}`);
            if (!res || !res.ok) throw new Error('Failed to load class register');
            const data = await res.json();

            if (!data.students || !data.students.length) {
                showError('No active students are enrolled in this class. Please enroll students first.');
                return;
            }

            // Check if existing session was detected
            const editBanner = document.getElementById('editingSessionBanner');
            const editText = document.getElementById('editingSessionText');
            const submitBtn = document.getElementById('submitAttendanceBtn');

            if (data.existing_session) {
                editingSessionId = data.existing_session.id;
                if (editBanner && editText) {
                    editText.textContent = `⚠️ Editing existing session (#${data.existing_session.id}) recorded on ${formatDate(data.existing_session.attendance_date)} (${data.existing_session.period}).`;
                    editBanner.hidden = false;
                }
                if (submitBtn) submitBtn.textContent = 'Update Attendance';
            } else {
                editingSessionId = null;
                if (editBanner) editBanner.hidden = true;
                if (submitBtn) submitBtn.textContent = 'Submit Attendance';
            }

            rosterStudents = data.students;
            renderRoster(data.students);
            showStep(2);
        } catch (err) {
            console.error('loadRoster error:', err);
            showError('Unable to load class register.');
        } finally {
            ModalManager.setLoading('loadRosterBtn', false, 'Load Register');
        }
    }

    /**
     * renderRoster
     * Renders student roster controls inside rosterList container.
     * @param {Array} students
     */
    function renderRoster(students) {
        const list = document.getElementById('rosterList');
        if (!list) return;

        list.innerHTML = students.map((s, idx) => {
            const currentStatus = s.status || 'present';
            return `
            <div class="aa-roster-row" data-student-id="${s.id}" role="listitem">
              <div class="aa-roster-name">
                <span class="aa-roster-num">${idx + 1}.</span>
                <strong>${escapeHtml(s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim())}</strong>
                <span class="aa-text-muted">(${escapeHtml(s.studentNumber || s.admissionNumber || '')})</span>
              </div>
              <div class="aa-roster-statuses">
                ${['present', 'absent', 'late', 'excused'].map(st => `
                  <label class="aa-status-radio aa-status-radio-${st}">
                    <input type="radio" name="status-${s.id}" value="${st}" ${currentStatus === st ? 'checked' : ''} />
                    <span>${st.charAt(0).toUpperCase() + st.slice(1)}</span>
                  </label>`).join('')}
              </div>
            </div>`;
        }).join('');
    }

    /**
     * setBulkAttendance
     * Sets attendance status for all students in the roster.
     * @param {'present'|'absent'|'late'|'excused'} status
     */
    function setBulkAttendance(status) {
        if (!['present', 'absent', 'late', 'excused'].includes(status)) return;
        document.querySelectorAll('#rosterList .aa-roster-row').forEach(row => {
            const radio = row.querySelector(`input[value="${status}"]`);
            if (radio) radio.checked = true;
        });
    }

    /**
     * submitAttendance
     * Validates and submits attendance session and individual student records.
     */
    async function submitAttendance() {
        const yearId = document.getElementById('sessionYear').value;
        const termId = document.getElementById('sessionTerm').value;
        const classId = document.getElementById('sessionClass').value;
        const date = document.getElementById('sessionDate').value;
        const period = document.getElementById('sessionPeriod').value || 'General';
        const subjectId = document.getElementById('sessionSubject').value || null;

        if (!yearId || !termId || !classId || !date) {
            showError('Missing required session metadata.');
            return;
        }

        ModalManager.setLoading('submitAttendanceBtn', true, 'Submitting…');

        try {
            let sessionId = editingSessionId;

            // 1. Create or retrieve session if new
            if (!sessionId) {
                const sessionRes = await apiFetch('/api/attendance/sessions', {
                    method: 'POST',
                    body: JSON.stringify({
                        class_id: classId,
                        term_id: termId,
                        academic_year_id: yearId,
                        attendance_date: date,
                        period: period,
                        subject_id: subjectId,
                    }),
                });

                if (!sessionRes || !sessionRes.ok) {
                    const errData = await sessionRes.json().catch(() => ({}));
                    throw new Error(errData.error || 'Failed to create attendance session');
                }

                const sessionData = await sessionRes.json();
                sessionId = sessionData.session.id;
            } else {
                // Update existing session details if modified
                await apiFetch(`/api/attendance/sessions/${sessionId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        attendance_date: date,
                        period: period,
                        subject_id: subjectId,
                    }),
                }).catch(() => {});
            }

            // 2. Collect statuses from DOM
            const records = rosterStudents.map(s => {
                const checked = document.querySelector(`input[name="status-${s.id}"]:checked`);
                return {
                    student_id: s.id,
                    status: checked ? checked.value : 'present',
                };
            });

            // 3. Submit bulk records to session endpoint
            const submitRes = await apiFetch(`/api/attendance/sessions/${sessionId}/submit`, {
                method: 'POST',
                body: JSON.stringify({ records }),
            });

            if (!submitRes || !submitRes.ok) {
                const errData = await submitRes.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to submit attendance records');
            }

            showSuccess(`Attendance recorded for ${records.length} student${records.length !== 1 ? 's' : ''}. ✓`);
            resetAttendanceModal();
            ModalManager.close('takeAttendanceModal');
            await loadAttendanceSessions();

        } catch (err) {
            console.error('submitAttendance error:', err);
            showError(err.message || 'Failed to submit attendance.');
        } finally {
            ModalManager.setLoading('submitAttendanceBtn', false, 'Submit Attendance');
        }
    }

    // ─── Sessions Table & Filtering ───────────────────────────────────────────

    /**
     * loadAttendanceSessions
     * Fetches attendance sessions matching active filter selections.
     */
    async function loadAttendanceSessions() {
        const params = new URLSearchParams();
        const yearId = document.getElementById('filterYear')?.value;
        const classId = document.getElementById('filterClass')?.value;
        const termId = document.getElementById('filterTerm')?.value;
        const fromDate = document.getElementById('filterFromDate')?.value;
        const toDate = document.getElementById('filterToDate')?.value;

        if (yearId) params.set('academic_year_id', yearId);
        if (classId) params.set('class_id', classId);
        if (termId) params.set('term_id', termId);
        if (fromDate) params.set('from_date', fromDate);
        if (toDate) params.set('to_date', toDate);

        try {
            const res = await apiFetch(`/api/attendance/sessions?${params}`);
            if (!res || !res.ok) throw new Error('Failed to load sessions');
            const sessions = await res.json();
            renderSessionsTable(sessions);
        } catch (err) {
            console.error('loadAttendanceSessions error:', err);
            showError('Unable to load recent sessions.');
        }
    }

    /**
     * filterAttendanceSessions
     * Alias wrapper for loadAttendanceSessions triggered by filter control change events.
     */
    function filterAttendanceSessions() {
        loadAttendanceSessions();
    }

    /**
     * renderSessionsTable
     * Renders sessions list into sessionsTableBody and updates badges/empty states.
     * @param {Array} sessions
     */
    function renderSessionsTable(sessions) {
        const tbody = document.getElementById('sessionsTableBody');
        const emptyState = document.getElementById('sessionsEmptyState');
        const badge = document.getElementById('sessionCountBadge');

        if (badge) {
            badge.textContent = `${sessions.length} session${sessions.length === 1 ? '' : 's'}`;
        }

        if (!sessions || !sessions.length) {
            if (tbody) tbody.innerHTML = '';
            if (emptyState) emptyState.hidden = false;
            return;
        }

        if (emptyState) emptyState.hidden = true;
        if (!tbody) return;

        tbody.innerHTML = sessions.map(s => {
            const rate = calcAttendanceRate(s);
            const rateStyle = rate >= 90 ? 'aa-rate-good' : (rate >= 75 ? 'aa-rate-ok' : 'aa-rate-low');

            return `
            <tr>
              <td>${formatDate(s.attendance_date)}</td>
              <td><strong>${escapeHtml(s.class_name)}</strong></td>
              <td>${escapeHtml(s.period || 'General')}</td>
              <td>${escapeHtml(s.teacher_name || 'Staff')}</td>
              <td><span class="aa-badge aa-badge-success">${s.present_count || 0}</span></td>
              <td><span class="aa-badge aa-badge-danger">${s.absent_count || 0}</span></td>
              <td><span class="aa-badge aa-badge-warning">${s.late_count || 0}</span></td>
              <td><span class="aa-badge aa-badge-info">${s.excused_count || 0}</span></td>
              <td><span class="aa-rate-pill ${rateStyle}">${rate}%</span></td>
              <td class="aa-table-actions">
                <button class="aa-link-btn" data-action="view" data-id="${s.id}">View</button>
                <button class="aa-link-btn" data-action="edit" data-id="${s.id}">Edit</button>
                <button class="aa-link-btn aa-link-danger" data-action="delete" data-id="${s.id}">Delete</button>
              </td>
            </tr>`;
        }).join('');

        // Event delegation for table action buttons
        tbody.querySelectorAll('[data-action="view"]').forEach(btn =>
            btn.addEventListener('click', () => viewAttendanceSession(btn.dataset.id))
        );
        tbody.querySelectorAll('[data-action="edit"]').forEach(btn =>
            btn.addEventListener('click', () => editAttendanceSession(btn.dataset.id))
        );
        tbody.querySelectorAll('[data-action="delete"]').forEach(btn =>
            btn.addEventListener('click', () => deleteAttendanceSession(btn.dataset.id))
        );
    }

    // ─── Actions — View, Edit, Delete Session ─────────────────────────────────

    /**
     * viewAttendanceSession
     * Fetches details of a session and displays them inside viewSessionModal.
     * @param {string|number} sessionId
     */
    async function viewAttendanceSession(sessionId) {
        try {
            const res = await apiFetch(`/api/attendance/sessions/${sessionId}`);
            if (!res || !res.ok) throw new Error('Session details not found');
            const { session, records } = await res.json();

            const container = document.getElementById('viewSessionContent');
            if (!container) return;

            const total = records.length;
            const present = records.filter(r => r.status === 'present').length;
            const absent = records.filter(r => r.status === 'absent').length;
            const late = records.filter(r => r.status === 'late').length;
            const excused = records.filter(r => r.status === 'excused').length;
            const rate = total ? ((present / total) * 100).toFixed(1) : '0.0';

            container.innerHTML = `
            <div class="aa-summary-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem;">
              <div class="aa-card" style="padding:0.75rem 1rem;">
                <span class="aa-text-muted" style="font-size:0.75rem;">CLASS & PERIOD</span>
                <p style="font-weight:600;margin:0.2rem 0 0 0;">${escapeHtml(session.class_name)} (${escapeHtml(session.period)})</p>
              </div>
              <div class="aa-card" style="padding:0.75rem 1rem;">
                <span class="aa-text-muted" style="font-size:0.75rem;">DATE</span>
                <p style="font-weight:600;margin:0.2rem 0 0 0;">${formatDate(session.attendance_date)}</p>
              </div>
              <div class="aa-card" style="padding:0.75rem 1rem;">
                <span class="aa-text-muted" style="font-size:0.75rem;">TEACHER</span>
                <p style="font-weight:600;margin:0.2rem 0 0 0;">${escapeHtml(session.teacher_name)}</p>
              </div>
              <div class="aa-card" style="padding:0.75rem 1rem;">
                <span class="aa-text-muted" style="font-size:0.75rem;">ATTENDANCE RATE</span>
                <p style="font-weight:700;margin:0.2rem 0 0 0;font-size:1.2rem;color:var(--aa-primary);">${rate}%</p>
              </div>
            </div>

            <div style="display:flex;gap:1rem;margin-bottom:1rem;font-size:0.85rem;">
              <span><strong>Present:</strong> ${present}</span>
              <span><strong>Absent:</strong> ${absent}</span>
              <span><strong>Late:</strong> ${late}</span>
              <span><strong>Excused:</strong> ${excused}</span>
            </div>

            <div class="aa-table-wrap">
              <table class="aa-table">
                <thead>
                  <tr>
                    <th>Adm No</th>
                    <th>Student Name</th>
                    <th>Status</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  ${records.map(r => `
                    <tr>
                      <td>${escapeHtml(r.admission_number)}</td>
                      <td><strong>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</strong></td>
                      <td><span class="aa-status-pill aa-status-${r.status}">${r.status}</span></td>
                      <td>${escapeHtml(r.remarks || '—')}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>`;

            ModalManager.open('viewSessionModal');
        } catch (err) {
            console.error('viewAttendanceSession error:', err);
            showError('Unable to view attendance session.');
        }
    }

    /**
     * editAttendanceSession
     * Loads existing session data into takeAttendanceModal for editing.
     * @param {string|number} sessionId
     */
    async function editAttendanceSession(sessionId) {
        try {
            const res = await apiFetch(`/api/attendance/sessions/${sessionId}`);
            if (!res || !res.ok) throw new Error('Failed to load session for editing');
            const { session } = await res.json();

            editingSessionId = session.id;

            // Pre-populate modal fields
            const yearSelect = document.getElementById('sessionYear');
            const termSelect = document.getElementById('sessionTerm');
            const classSelect = document.getElementById('sessionClass');
            const dateInput = document.getElementById('sessionDate');
            const periodInput = document.getElementById('sessionPeriod');
            const subjectSelect = document.getElementById('sessionSubject');

            if (yearSelect) yearSelect.value = session.academic_year_id;
            await loadTerms(session.academic_year_id);
            if (termSelect) termSelect.value = session.term_id;
            if (classSelect) classSelect.value = session.class_id;
            if (dateInput) dateInput.value = session.attendance_date ? session.attendance_date.split('T')[0] : '';
            if (periodInput) periodInput.value = session.period || 'General';
            await loadSubjects(session.class_id);
            if (subjectSelect) subjectSelect.value = session.subject_id || '';

            loadClassInfo(session.class_id);

            // Open modal and load register
            ModalManager.open('takeAttendanceModal', { opener: document.activeElement });
            await loadRoster();

        } catch (err) {
            console.error('editAttendanceSession error:', err);
            showError('Unable to edit session.');
        }
    }

    /**
     * deleteAttendanceSession
     * Prompts for confirmation and deletes the session.
     * @param {string|number} sessionId
     */
    async function deleteAttendanceSession(sessionId) {
        if (!confirm('Are you sure you want to delete this attendance session and all its records? This action cannot be undone.')) {
            return;
        }

        try {
            const res = await apiFetch(`/api/attendance/sessions/${sessionId}`, { method: 'DELETE' });
            if (!res || !res.ok) throw new Error('Delete failed');
            showSuccess('Attendance session deleted successfully.');
            await loadAttendanceSessions();
        } catch (err) {
            console.error('deleteAttendanceSession error:', err);
            showError('Unable to delete attendance session.');
        }
    }

    // ─── Modal Reset & Step Navigation ───────────────────────────────────────

    /**
     * resetAttendanceModal
     * Resets the Take Attendance modal form to initial clean state.
     */
    function resetAttendanceModal() {
        editingSessionId = null;
        rosterStudents = [];

        const yearSelect = document.getElementById('sessionYear');
        const termSelect = document.getElementById('sessionTerm');
        const classSelect = document.getElementById('sessionClass');
        const dateInput = document.getElementById('sessionDate');
        const periodInput = document.getElementById('sessionPeriod');
        const subjectSelect = document.getElementById('sessionSubject');
        const rosterList = document.getElementById('rosterList');
        const banner = document.getElementById('classInfoBanner');
        const editBanner = document.getElementById('editingSessionBanner');

        if (classSelect) classSelect.value = '';
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
        if (periodInput) periodInput.value = 'General';
        if (subjectSelect) subjectSelect.value = '';
        if (rosterList) rosterList.innerHTML = '';
        if (banner) banner.hidden = true;
        if (editBanner) editBanner.hidden = true;

        // Reset year select to current year
        const currentYear = allYears.find(y => y.is_current);
        if (currentYear && yearSelect) {
            yearSelect.value = currentYear.id;
            loadTerms(currentYear.id);
        }

        showStep(1);
    }

    /**
     * showStep
     * Switches between Step 1 (Filters/Details) and Step 2 (Mark Roster).
     * @param {number} stepNumber
     */
    function showStep(stepNumber) {
        const step1 = document.getElementById('step1');
        const step2 = document.getElementById('step2');
        if (step1) step1.hidden = (stepNumber !== 1);
        if (step2) step2.hidden = (stepNumber !== 2);
    }

    // ─── Event Binding ────────────────────────────────────────────────────────

    function bindFilterEvents() {
        ['filterYear', 'filterClass', 'filterTerm', 'filterFromDate', 'filterToDate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', filterAttendanceSessions);
        });

        const clearBtn = document.getElementById('clearFiltersBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                ['filterYear', 'filterClass', 'filterTerm', 'filterFromDate', 'filterToDate'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                filterAttendanceSessions();
            });
        }
    }

    function bindModalEvents() {
        // Open Take Attendance Modal
        const openBtn = document.getElementById('openTakeAttendanceBtn');
        if (openBtn) {
            openBtn.addEventListener('click', async () => {
                resetAttendanceModal();
                await loadSubjects();
                ModalManager.open('takeAttendanceModal', { opener: openBtn });
            });
        }

        // Close / Cancel buttons
        const closeBtn = document.getElementById('closeModalBtn');
        if (closeBtn) closeBtn.addEventListener('click', () => ModalManager.close('takeAttendanceModal'));

        const cancelBtn = document.getElementById('cancelTakeAttBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', () => ModalManager.close('takeAttendanceModal'));

        const closeViewBtn = document.getElementById('closeViewModalBtn');
        if (closeViewBtn) closeViewBtn.addEventListener('click', () => ModalManager.close('viewSessionModal'));

        // Cascade listeners inside modal
        const yearSelect = document.getElementById('sessionYear');
        if (yearSelect) {
            yearSelect.addEventListener('change', (e) => loadTerms(e.target.value));
        }

        const classSelect = document.getElementById('sessionClass');
        if (classSelect) {
            classSelect.addEventListener('change', (e) => {
                loadClassInfo(e.target.value);
                loadSubjects(e.target.value);
            });
        }

        // Roster Load & Navigation
        const loadBtn = document.getElementById('loadRosterBtn');
        if (loadBtn) loadBtn.addEventListener('click', loadRoster);

        const backBtn = document.getElementById('backToStep1Btn');
        if (backBtn) backBtn.addEventListener('click', () => showStep(1));

        const submitBtn = document.getElementById('submitAttendanceBtn');
        if (submitBtn) submitBtn.addEventListener('click', submitAttendance);

        // Bulk mark chips
        document.querySelectorAll('[data-bulk]').forEach(btn => {
            btn.addEventListener('click', () => setBulkAttendance(btn.dataset.bulk));
        });
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function classLabel(c) {
        return c.class_name || `${c.grade_level || ''}${c.stream ? ' ' + c.stream : ''}`.trim();
    }

    function termLabel(t) {
        return `${t.term_name || 'Term'} (${t.year_label || ''})`.trim();
    }

    function populateSelect(id, items, valueKey, labelFn, placeholder) {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML =
            `<option value="">${placeholder}</option>` +
            items.map(item => `<option value="${item[valueKey]}">${escapeHtml(labelFn(item))}</option>`).join('');
    }

    function calcAttendanceRate(session) {
        const total = (session.present_count || 0) + (session.absent_count || 0) +
            (session.late_count || 0) + (session.excused_count || 0);
        if (!total) return '0.0';
        return (((session.present_count || 0) / total) * 100).toFixed(1);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch {
            return dateStr;
        }
    }

    function escapeHtml(val) {
        return String(val ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function showError(msg) {
        if (typeof ModalManager !== 'undefined' && ModalManager.toast) {
            ModalManager.toast(msg, 'error');
        } else {
            console.error('Error:', msg);
        }
    }

    function showSuccess(msg) {
        if (typeof ModalManager !== 'undefined' && ModalManager.toast) {
            ModalManager.toast(msg, 'success');
        } else {
            console.log('Success:', msg);
        }
    }

    // Expose orchestrator functions to window for clean module access & debugging
    window.AttendanceManager = {
        initAttendancePage,
        loadAcademicYears,
        loadTerms,
        loadClasses,
        loadSubjects,
        loadClassInfo,
        loadRoster,
        renderRoster,
        setBulkAttendance,
        submitAttendance,
        loadAttendanceSessions,
        filterAttendanceSessions,
        viewAttendanceSession,
        editAttendanceSession,
        deleteAttendanceSession,
        resetAttendanceModal,
        showError,
        showSuccess,
    };

})();