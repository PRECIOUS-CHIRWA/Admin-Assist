/**
 * timetable-management.js — Admin Timetable Management
 * Allows Admin & Headmaster to view, filter, create, edit, and delete timetable entries
 * with strict conflict validation (teacher conflict, class conflict, time ordering).
 */
(function () {
    'use strict';

    let allClasses = [];
    let allSubjects = [];
    let allTeachers = [];
    let allYears = [];
    let allTerms = [];
    let currentTimetable = [];
    let deleteTargetId = null;

    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    // Standard school periods as baseline, dynamic slots will be added if custom times exist
    const DEFAULT_PERIODS = [
        { start: '07:30', end: '08:30', label: '07:30 – 08:30' },
        { start: '08:30', end: '09:30', label: '08:30 – 09:30' },
        { start: '09:30', end: '10:30', label: '09:30 – 10:30' },
        { start: '11:00', end: '12:00', label: '11:00 – 12:00' },
        { start: '12:00', end: '13:00', label: '12:00 – 13:00' },
        { start: '14:00', end: '15:00', label: '14:00 – 15:00' },
        { start: '15:00', end: '16:00', label: '15:00 – 16:00' },
    ];

    document.addEventListener('DOMContentLoaded', async () => {
        // RBAC protection: Admin / Headmaster only
        const user = getUser();
        if (user && user.role !== 'admin' && user.role !== 'headmaster') {
            alert('Access restricted. Timetable management is reserved for school administrators.');
            window.location.replace('dashboard.html');
            return;
        }

        await loadMetadata();

        // Check if URL has ?classId= or ?class_id= (e.g. from Subjects page Class Record)
        const urlParams = new URLSearchParams(window.location.search);
        const preselectedClassId = urlParams.get('classId') || urlParams.get('class_id');
        if (preselectedClassId) {
            const classSelect = document.getElementById('filterClass');
            if (classSelect) classSelect.value = preselectedClassId;
        }

        bindEvents();
        await loadTimetable();

        if (urlParams.get('action') === 'create') {
            openEntryModal();
        }
    });

    /* ─── Metadata Loading ─────────────────────────────────────────────────── */
    async function loadMetadata() {
        try {
            const [classRes, subRes, teacherRes, yearRes, termRes] = await Promise.all([
                apiFetch('/api/attendance/classes').catch(() => null),
                apiFetch('/api/subjects').catch(() => null),
                apiFetch('/api/teachers?limit=100&status=active').catch(() => null),
                apiFetch('/api/attendance/academic-years').catch(() => null),
                apiFetch('/api/attendance/terms').catch(() => null),
            ]);

            allClasses = (classRes && classRes.ok) ? await classRes.json().catch(() => []) : [];
            allSubjects = (subRes && subRes.ok) ? await subRes.json().catch(() => []) : [];
            const teacherData = (teacherRes && teacherRes.ok) ? await teacherRes.json().catch(() => ({})) : {};
            allTeachers = teacherData.teachers || (Array.isArray(teacherData) ? teacherData : []);
            allYears = (yearRes && yearRes.ok) ? await yearRes.json().catch(() => []) : [];
            allTerms = (termRes && termRes.ok) ? await termRes.json().catch(() => []) : [];

            if (!allYears.length && allTerms.length) {
                allYears = [...new Map(allTerms.map(t => [t.academic_year_id, { id: t.academic_year_id, year_label: t.year_label }])).values()];
            }
            if (!allYears.length) {
                allYears = [{ id: 1, year_label: '2026' }];
            }

            populateDropdowns();
        } catch (err) {
            console.error('loadMetadata error:', err);
        }
    }

    function populateDropdowns() {
        // Filter Class
        const filterClass = document.getElementById('filterClass');
        if (filterClass) {
            filterClass.innerHTML = '<option value="">All Classes</option>' +
                allClasses.map(c => `<option value="${c.id}">${_esc(_classLabel(c))}</option>`).join('');
        }

        // Filter Teacher
        const filterTeacher = document.getElementById('filterTeacher');
        if (filterTeacher) {
            filterTeacher.innerHTML = '<option value="">All Teachers</option>' +
                allTeachers.map(t => `<option value="${t.id}">${_esc(t.name)}</option>`).join('');
        }

        // Filter Year
        const filterYear = document.getElementById('filterYear');
        if (filterYear) {
            filterYear.innerHTML = allYears.map(y => `<option value="${y.id}">${_esc(y.year_label || y.year || y.id)}</option>`).join('');
        }

        // Filter Term
        const filterTerm = document.getElementById('filterTerm');
        if (filterTerm) {
            filterTerm.innerHTML = '<option value="">All Terms</option>' +
                allTerms.map(t => `<option value="${t.id}">${_esc(t.term_name || 'Term ' + t.term_number)}</option>`).join('');
        }

        // Form Class
        const formClass = document.getElementById('formClass');
        if (formClass) {
            formClass.innerHTML = '<option value="">Select Class…</option>' +
                allClasses.map(c => `<option value="${c.id}">${_esc(_classLabel(c))}</option>`).join('');
        }

        // Form Subject
        const formSubject = document.getElementById('formSubject');
        if (formSubject) {
            formSubject.innerHTML = '<option value="">Select Subject…</option>' +
                allSubjects.map(s => `<option value="${s.id}">${_esc(s.subject_code)} — ${_esc(s.subject_name)}</option>`).join('');
        }

        // Form Teacher
        const formTeacher = document.getElementById('formTeacher');
        if (formTeacher) {
            formTeacher.innerHTML = '<option value="">Select Teacher…</option>' +
                allTeachers.map(t => `<option value="${t.id}">${_esc(t.name)}</option>`).join('');
        }

        // Form Year
        const formYear = document.getElementById('formYear');
        if (formYear) {
            formYear.innerHTML = allYears.map(y => `<option value="${y.id}">${_esc(y.year_label || y.year || y.id)}</option>`).join('');
        }

        // Form Term
        const formTerm = document.getElementById('formTerm');
        if (formTerm) {
            formTerm.innerHTML = '<option value="">Select Term…</option>' +
                allTerms.map(t => `<option value="${t.id}">${_esc(t.term_name || 'Term ' + t.term_number)}</option>`).join('');
        }
    }

    /* ─── Event Binding ─────────────────────────────────────────────────────── */
    function bindEvents() {
        // Filter change triggers reload
        const filterIds = ['filterClass', 'filterTeacher', 'filterDay', 'filterYear', 'filterTerm'];
        filterIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => loadTimetable());
        });

        // Reset filters
        const resetBtn = document.getElementById('resetFiltersBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                document.getElementById('filterClass').value = '';
                document.getElementById('filterTeacher').value = '';
                document.getElementById('filterDay').value = '';
                document.getElementById('filterTerm').value = '';
                loadTimetable();
            });
        }

        // Create modal button
        const openBtn = document.getElementById('openCreateEntryBtn');
        if (openBtn) {
            openBtn.addEventListener('click', () => openEntryModal());
        }

        // Close modal buttons
        const closeBtn = document.getElementById('closeEntryModalBtn');
        const cancelBtn = document.getElementById('cancelEntryBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeEntryModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeEntryModal);

        // Save entry button
        const saveBtn = document.getElementById('saveEntryBtn');
        if (saveBtn) saveBtn.addEventListener('click', saveEntry);

        // Delete confirm modal
        const closeDelBtn = document.getElementById('closeDelModalBtn');
        const cancelDelBtn = document.getElementById('cancelDelBtn');
        const confirmDelBtn = document.getElementById('confirmDelBtn');
        if (closeDelBtn) closeDelBtn.addEventListener('click', () => { _hideModal('deleteConfirmModal'); });
        if (cancelDelBtn) cancelDelBtn.addEventListener('click', () => { _hideModal('deleteConfirmModal'); });
        if (confirmDelBtn) confirmDelBtn.addEventListener('click', executeDelete);
    }

    /* ─── Load Timetable from API ───────────────────────────────────────────── */
    async function loadTimetable() {
        const classId = document.getElementById('filterClass')?.value;
        const teacherId = document.getElementById('filterTeacher')?.value;
        const day = document.getElementById('filterDay')?.value;
        const yearId = document.getElementById('filterYear')?.value;
        const termId = document.getElementById('filterTerm')?.value;

        const params = new URLSearchParams();
        if (classId) params.set('class_id', classId);
        if (teacherId) params.set('teacher_id', teacherId);
        if (day) params.set('day_of_week', day);
        if (yearId) params.set('academic_year_id', yearId);
        if (termId) params.set('term_id', termId);

        // Update view label
        const viewLabel = document.getElementById('currentViewLabel');
        if (viewLabel) {
            if (classId) {
                const c = allClasses.find(x => String(x.id) === String(classId));
                viewLabel.textContent = c ? `Class: ${_classLabel(c)}` : 'Class schedule';
            } else if (teacherId) {
                const t = allTeachers.find(x => String(x.id) === String(teacherId));
                viewLabel.textContent = t ? `Teacher: ${t.name}` : 'Teacher schedule';
            } else {
                viewLabel.textContent = 'All Classes & Teachers';
            }
        }

        try {
            const res = await apiFetch(`/api/timetable?${params.toString()}`);
            if (!res || !res.ok) throw new Error('Failed to load timetable');
            const data = await res.json();
            currentTimetable = data.timetable || [];
            renderGrid();
        } catch (err) {
            console.error('loadTimetable error:', err);
            currentTimetable = [];
            renderGrid();
        }
    }

    /* ─── Render Weekly Grid Matrix ─────────────────────────────────────────── */
    function renderGrid() {
        const countBadge = document.getElementById('timetableCountBadge');
        if (countBadge) countBadge.textContent = `${currentTimetable.length} ${currentTimetable.length === 1 ? 'Entry' : 'Entries'}`;

        const emptyEl = document.getElementById('timetableEmptyState');
        const tableWrapper = document.getElementById('timetableTableWrapper');
        const tbody = document.getElementById('timetableGridBody');

        if (!currentTimetable.length) {
            if (emptyEl) emptyEl.hidden = false;
            if (tableWrapper) tableWrapper.hidden = true;
            if (tbody) tbody.innerHTML = '';
            return;
        }

        if (emptyEl) emptyEl.hidden = true;
        if (tableWrapper) tableWrapper.hidden = false;

        // Build list of distinct time periods: Combine default periods and any custom entry slots
        const periodsMap = new Map();
        DEFAULT_PERIODS.forEach(p => {
            const key = `${p.start}-${p.end}`;
            periodsMap.set(key, { start: p.start, end: p.end, label: p.label });
        });

        // Add any custom entry time slots
        currentTimetable.forEach(e => {
            const s = (e.start_time_formatted || e.start_time || '').substring(0, 5);
            const en = (e.end_time_formatted || e.end_time || '').substring(0, 5);
            if (s && en) {
                const key = `${s}-${en}`;
                if (!periodsMap.has(key)) {
                    periodsMap.set(key, { start: s, end: en, label: `${s} – ${en}` });
                }
            }
        });

        // Sort periods by start time
        const sortedPeriods = Array.from(periodsMap.values()).sort((a, b) => a.start.localeCompare(b.start));

        // Generate rows
        tbody.innerHTML = sortedPeriods.map(period => {
            const cells = DAYS.map(day => {
                // Find all entries for this day that overlap with this period
                const matchingEntries = currentTimetable.filter(e => {
                    if (e.day_of_week !== day) return false;
                    const es = (e.start_time_formatted || e.start_time || '').substring(0, 5);
                    const ee = (e.end_time_formatted || e.end_time || '').substring(0, 5);
                    // Match either exact slot or period overlap
                    return (es < period.end && ee > period.start);
                });

                if (!matchingEntries.length) {
                    return `<td style="background:var(--aa-surface);"><div style="min-height:48px;"></div></td>`;
                }

                const entryCards = matchingEntries.map(e => `
                    <div class="tt-entry-card">
                        <div class="tt-entry-subject">${_esc(e.subject_name || e.subject_code)}</div>
                        <span class="tt-entry-class">${_esc(e.class_name)}</span>
                        <div class="tt-entry-meta">
                            <span>👤 ${_esc(e.teacher_name)}</span>
                            ${e.room ? `<span>📍 ${_esc(e.room)}</span>` : ''}
                            <span style="font-size:11px;opacity:.8;">⏱ ${(e.start_time_formatted || '').substring(0,5)}–${(e.end_time_formatted || '').substring(0,5)}</span>
                        </div>
                        <div class="tt-entry-actions">
                            <button type="button" class="tt-btn-icon edit" data-action="edit" data-id="${e.id}" title="Edit this entry">
                                ✏️ Edit
                            </button>
                            <button type="button" class="tt-btn-icon delete" data-action="delete" data-id="${e.id}" title="Delete this entry">
                                🗑️ Delete
                            </button>
                        </div>
                    </div>
                `).join('');

                return `<td>${entryCards}</td>`;
            }).join('');

            return `
                <tr>
                    <td class="time-cell">${_esc(period.label)}</td>
                    ${cells}
                </tr>
            `;
        }).join('');

        // Attach edit and delete handlers
        tbody.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const entry = currentTimetable.find(x => String(x.id) === String(id));
                if (entry) openEntryModal(entry);
            });
        });

        tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const entry = currentTimetable.find(x => String(x.id) === String(id));
                if (entry) promptDelete(entry);
            });
        });
    }

    /* ─── Create / Edit Entry Modal ─────────────────────────────────────────── */
    function openEntryModal(entry = null) {
        const modal = document.getElementById('entryModal');
        const title = document.getElementById('modalTitle');
        const alertBox = document.getElementById('modalConflictAlert');
        const msgEl = document.getElementById('conflictMessage');

        if (alertBox) alertBox.style.display = 'none';
        if (msgEl) msgEl.textContent = '';

        if (entry) {
            title.textContent = 'Edit Timetable Entry';
            document.getElementById('entryId').value = entry.id;
            document.getElementById('formYear').value = entry.academic_year_id || allYears[0]?.id || 1;
            document.getElementById('formTerm').value = entry.term_id || '';
            document.getElementById('formClass').value = entry.class_id;
            document.getElementById('formSubject').value = entry.subject_id;
            document.getElementById('formTeacher').value = entry.teacher_id;
            document.getElementById('formDay').value = entry.day_of_week;
            document.getElementById('formRoom').value = entry.room || '';
            document.getElementById('formStartTime').value = (entry.start_time_formatted || entry.start_time || '').substring(0, 5);
            document.getElementById('formEndTime').value = (entry.end_time_formatted || entry.end_time || '').substring(0, 5);
        } else {
            title.textContent = 'Create Timetable Entry';
            document.getElementById('entryId').value = '';
            document.getElementById('formYear').value = document.getElementById('filterYear')?.value || allYears[0]?.id || 1;
            document.getElementById('formTerm').value = document.getElementById('filterTerm')?.value || allTerms[0]?.id || '';
            document.getElementById('formClass').value = document.getElementById('filterClass')?.value || '';
            document.getElementById('formTeacher').value = document.getElementById('filterTeacher')?.value || '';
            document.getElementById('formSubject').value = '';
            document.getElementById('formDay').value = document.getElementById('filterDay')?.value || 'Monday';
            document.getElementById('formRoom').value = '';
            document.getElementById('formStartTime').value = '08:00';
            document.getElementById('formEndTime').value = '09:00';
        }

        _showModal('entryModal');
    }

    function closeEntryModal() {
        _hideModal('entryModal');
    }

    /* ─── Save Timetable Entry ──────────────────────────────────────────────── */
    async function saveEntry() {
        const id = document.getElementById('entryId').value;
        const academic_year_id = document.getElementById('formYear').value;
        const term_id = document.getElementById('formTerm').value || null;
        const class_id = document.getElementById('formClass').value;
        const subject_id = document.getElementById('formSubject').value;
        const teacher_id = document.getElementById('formTeacher').value;
        const day_of_week = document.getElementById('formDay').value;
        const room = document.getElementById('formRoom').value.trim();
        const start_time = document.getElementById('formStartTime').value;
        const end_time = document.getElementById('formEndTime').value;

        const alertBox = document.getElementById('modalConflictAlert');
        const msgEl = document.getElementById('conflictMessage');
        alertBox.style.display = 'none';

        // Client-side validations
        if (!class_id || !subject_id || !teacher_id || !day_of_week || !start_time || !end_time) {
            alertBox.style.display = 'block';
            msgEl.textContent = 'Please fill out all required fields (Class, Subject, Teacher, Day, Start Time, and End Time).';
            return;
        }

        if (start_time >= end_time) {
            alertBox.style.display = 'block';
            msgEl.textContent = 'End time must be after start time.';
            return;
        }

        const payload = {
            academic_year_id: parseInt(academic_year_id, 10),
            term_id: term_id ? parseInt(term_id, 10) : null,
            class_id: parseInt(class_id, 10),
            subject_id: parseInt(subject_id, 10),
            teacher_id: parseInt(teacher_id, 10),
            day_of_week,
            start_time,
            end_time,
            room: room || null,
        };

        const saveBtn = document.getElementById('saveEntryBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';

        try {
            const url = id ? `/api/timetable/${id}` : '/api/timetable';
            const method = id ? 'PUT' : 'POST';

            const res = await apiFetch(url, {
                method,
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok) {
                // Conflict or validation error
                alertBox.style.display = 'block';
                msgEl.textContent = data.details ? `${data.error} (${data.details})` : (data.error || 'Failed to save timetable entry');
                return;
            }

            closeEntryModal();
            await loadTimetable();
        } catch (err) {
            console.error('saveEntry error:', err);
            alertBox.style.display = 'block';
            msgEl.textContent = err.message || 'An unexpected error occurred.';
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Timetable Entry';
        }
    }

    /* ─── Delete Entry ──────────────────────────────────────────────────────── */
    function promptDelete(entry) {
        deleteTargetId = entry.id;
        const text = document.getElementById('delConfirmText');
        if (text) {
            text.innerHTML = `Are you sure you want to delete the schedule entry for <strong>${_esc(entry.subject_name)}</strong> with <strong>${_esc(entry.class_name)}</strong> on <strong>${_esc(entry.day_of_week)}</strong> (${(entry.start_time_formatted || '').substring(0,5)}–${(entry.end_time_formatted || '').substring(0,5)})?`;
        }
        _showModal('deleteConfirmModal');
    }

    async function executeDelete() {
        if (!deleteTargetId) return;
        const confirmBtn = document.getElementById('confirmDelBtn');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Deleting…';

        try {
            const res = await apiFetch(`/api/timetable/${deleteTargetId}`, { method: 'DELETE' });
            if (!res || !res.ok) throw new Error('Failed to delete timetable entry');
            _hideModal('deleteConfirmModal');
            deleteTargetId = null;
            await loadTimetable();
        } catch (err) {
            alert('Delete failed: ' + err.message);
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Delete Entry';
        }
    }

    /* ─── Helpers ─────────────────────────────────────────────────────────── */
    function _classLabel(c) {
        return c.class_name || `${c.grade_level}${c.stream ? ' ' + c.stream : ''}`;
    }

    function _esc(v) {
        return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _showModal(id) {
        const el = document.getElementById(id);
        if (el) el.hidden = false;
    }

    function _hideModal(id) {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
    }
})();
