(function () {
    'use strict';

    let allClasses = [];
    let allTerms = [];
    let allSubjects = [];
    let allTeachers = [];

    document.addEventListener('DOMContentLoaded', async () => {
        await loadMeta();
        
        const user = (typeof getUser === 'function' && getUser()) || {};
        const role = user.role || 'user';
        const position = user.school_position || '';
        const isHeadTeacher = (role === 'headmaster') || (position === 'Head Teacher');
        const isAdmin = (role === 'admin');

        if (isHeadTeacher && !isAdmin) {
            // Adapt UI for Head Teacher: Supervisory Mode
            const titleEl = document.querySelector('.aa-page-header h1');
            if (titleEl) titleEl.textContent = 'Classes & Subjects';
            const kickerEl = document.querySelector('.aa-page-header .aa-kicker');
            if (kickerEl) kickerEl.textContent = 'Supervisory';
            const subtitleEl = document.querySelector('.aa-page-header .aa-subtitle');
            if (subtitleEl) subtitleEl.textContent = 'View and inspect school classes, student rosters, and subject allocations.';

            // Hide write/mutation buttons
            const assignBtn = document.getElementById('assignBtn');
            if (assignBtn) assignBtn.style.display = 'none';
            const addSubBtn = document.getElementById('addSubjectBtn');
            if (addSubBtn) addSubBtn.style.display = 'none';
            const editFocusBtn = document.getElementById('editFocusBtn');
            if (editFocusBtn) editFocusBtn.style.display = 'none';

            await Promise.all([loadSubjects(), loadAssignments()]);

            // Auto-select first class to display roster immediately
            if (allClasses.length > 0) {
                const sel = document.getElementById('recordClassSelect');
                if (sel) {
                    sel.value = allClasses[0].id;
                    loadClassRecord(allClasses[0].id);
                }
            }
        } else if (role === 'staff') {
            // Adapt UI for Teacher: Display as "Classes"
            const titleEl = document.querySelector('.aa-page-header h1');
            if (titleEl) titleEl.textContent = 'Classes';
            const kickerEl = document.querySelector('.aa-page-header .aa-kicker');
            if (kickerEl) kickerEl.textContent = 'Teaching';
            const subtitleEl = document.querySelector('.aa-page-header .aa-subtitle');
            if (subtitleEl) subtitleEl.textContent = 'View your assigned classes, student rosters, and subjects.';

            // Hide Admin-only controls
            const assignBtn = document.getElementById('assignBtn');
            if (assignBtn) assignBtn.style.display = 'none';
            const addSubBtn = document.getElementById('addSubjectBtn');
            if (addSubBtn) addSubBtn.style.display = 'none';
            const editFocusBtn = document.getElementById('editFocusBtn');
            if (editFocusBtn) editFocusBtn.style.display = 'none';

            // Hide global subjects management and assignment registry
            const detailGrid = document.querySelector('.aa-detail-grid');
            if (detailGrid) detailGrid.style.display = 'none';

            // Auto-select first assigned class
            if (allClasses.length > 0) {
                const sel = document.getElementById('recordClassSelect');
                if (sel) {
                    sel.value = allClasses[0].id;
                    loadClassRecord(allClasses[0].id);
                }
            }
        } else {
            await Promise.all([loadSubjects(), loadAssignments()]);
        }

        bindEvents();

        // If URL has teacher_id query param, open Assign Modal with that teacher pre-selected
        const urlParams = new URLSearchParams(window.location.search);
        const preselectTeacherId = urlParams.get('teacher_id') || urlParams.get('teacherId');
        if (preselectTeacherId && (role === 'admin' || role === 'headmaster')) {
            openAssignModal(preselectTeacherId);
        }
    });

    /* ─── Meta ─────────────────────────────────────────────────────────────── */
    async function loadMeta() {
        try {
            const [cr, tr, yrRes, teacherRes] = await Promise.all([
                apiFetch('/api/classes').catch(() => null),
                apiFetch('/api/attendance/terms').catch(() => null),
                apiFetch('/api/attendance/academic-years').catch(() => null),
                apiFetch('/api/teachers?limit=100&status=active').catch(() => null),
            ]);

            allClasses = (cr && cr.ok) ? await cr.json().catch(() => []) : [];
            allTerms = (tr && tr.ok) ? await tr.json().catch(() => []) : [];
            const fetchedYears = (yrRes && yrRes.ok) ? await yrRes.json().catch(() => []) : [];
            
            const teacherData = (teacherRes && teacherRes.ok) ? await teacherRes.json().catch(() => ({})) : {};
            allTeachers = teacherData.teachers || (Array.isArray(teacherData) ? teacherData : []);

            let years = fetchedYears.map(y => ({ id: y.id, label: y.year_label || String(y.year || y.id) }));
            if (!years.length && allTerms.length) {
                years = [...new Map(allTerms.map(t =>
                    [t.academic_year_id, { id: t.academic_year_id, label: t.year_label }]
                )).values()];
            }
            if (!years.length) {
                years = [{ id: 1, label: '2026' }];
            }

            _populate('filterAssignClass', allClasses, 'id', _classLabel, 'All Classes');
            _populate('filterAssignYear', years, 'id', y => y.label, 'All Years');
            _populate('recordClassSelect', allClasses, 'id', _classLabel, 'Choose a class…');
            _populate('aTeacher', allTeachers, 'id', u => u.name, 'Select Teacher…');
            _populate('aClass', allClasses, 'id', _classLabel, 'Select Class…');
            _populate('aYear', years, 'id', y => y.label, 'Select Year…');
        } catch (err) {
            console.error('loadMeta:', err);
        }
    }

    /* ─── Subjects ──────────────────────────────────────────────────────────── */
    async function loadSubjects() {
        try {
            const res = await apiFetch('/api/subjects');
            if (!res || !res.ok) return;
            allSubjects = await res.json();
            renderSubjects(allSubjects);
            // Only populate modal dropdown with active subjects
            _populate('aSubject',
                allSubjects.filter(s => s.is_active),
                'id',
                s => `${s.subject_code} — ${s.subject_name}`,
                'Select Subject…'
            );
        } catch (err) { console.error('loadSubjects:', err); }
    }

    function renderSubjects(subjects) {
        const tbody = document.getElementById('subjectBody');
        const empty = document.getElementById('subjectEmpty');
        const count = document.getElementById('subjectCount');
        if (count) count.textContent = subjects.length;

        if (!subjects.length) {
            if (tbody) tbody.innerHTML = '';
            if (empty) empty.hidden = false;
            return;
        }
        if (empty) empty.hidden = true;

        tbody.innerHTML = subjects.map(s => `
            <tr>
                <td><strong>${_esc(s.subject_code)}</strong></td>
                <td>${_esc(s.subject_name)}</td>
                <td><span class="aa-status-pill aa-status-${s.is_active ? 'active' : 'inactive'}">
                    ${s.is_active ? 'Active' : 'Inactive'}
                </span></td>
                <td>${s.teacher_assignments || 0}</td>
                ${isAdmin ? `
                <td class="aa-table-actions">
                    <button class="aa-link-btn" data-edit='${JSON.stringify(s).replace(/'/g, "&#39;")}'>Edit</button>
                    <button class="aa-link-btn aa-link-danger"
                        data-toggle="${s.id}" data-active="${s.is_active ? '1' : '0'}">
                        ${s.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                </td>` : `<td class="aa-table-actions"><span style="color:var(--aa-text-muted);font-size:12px;">View only</span></td>`}
            </tr>`).join('');

        tbody.querySelectorAll('[data-edit]').forEach(btn =>
            btn.addEventListener('click', () => openEditSubject(JSON.parse(btn.dataset.edit)))
        );
        tbody.querySelectorAll('[data-toggle]').forEach(btn =>
            btn.addEventListener('click', () => toggleSubject(btn.dataset.toggle, btn.dataset.active === '1'))
        );
    }

    function openAddSubject() {
        document.getElementById('editSubjectId').value = '';
        document.getElementById('subjectModalTitle').textContent = 'Add Subject';
        ['fCode', 'fName', 'fDesc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        _showModal('subjectModal');
    }

    function openEditSubject(s) {
        document.getElementById('editSubjectId').value = s.id;
        document.getElementById('subjectModalTitle').textContent = 'Edit Subject';
        document.getElementById('fCode').value = s.subject_code;
        document.getElementById('fName').value = s.subject_name;
        document.getElementById('fDesc').value = s.description || '';
        _showModal('subjectModal');
    }

    async function saveSubject() {
        const id = document.getElementById('editSubjectId').value;
        const code = document.getElementById('fCode').value.trim().toUpperCase();
        const name = document.getElementById('fName').value.trim();
        const desc = document.getElementById('fDesc').value.trim();
        if (!code || !name) return alert('Subject code and name are required.');

        const btn = document.getElementById('saveSubjectBtn');
        btn.disabled = true; btn.textContent = 'Saving…';
        try {
            const res = await apiFetch(id ? `/api/subjects/${id}` : '/api/subjects', {
                method: id ? 'PUT' : 'POST',
                body: JSON.stringify({ subject_code: code, subject_name: name, description: desc }),
            });
            if (!res || !res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to save subject'); }
            _hideModal('subjectModal');
            await loadSubjects();
        } catch (err) { alert(err.message || 'Failed to save subject.'); }
        finally { btn.disabled = false; btn.textContent = 'Save Subject'; }
    }

    async function toggleSubject(id, currentlyActive) {
        const action = currentlyActive ? 'Deactivate' : 'Activate';
        if (!confirm(`${action} this subject?`)) return;
        try {
            const res = await apiFetch(`/api/subjects/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ is_active: currentlyActive ? 0 : 1 }),
            });
            if (!res || !res.ok) throw new Error('Update failed');
            await loadSubjects();
        } catch { alert('Failed to update subject.'); }
    }

    /* ─── Teacher Assignments ───────────────────────────────────────────────── */
    async function loadAssignments() {
        const p = new URLSearchParams();
        const classVal = document.getElementById('filterAssignClass')?.value;
        const yearVal = document.getElementById('filterAssignYear')?.value;
        if (classVal) p.set('class_id', classVal);
        if (yearVal) p.set('academic_year_id', yearVal);

        try {
            const res = await apiFetch(`/api/subjects/assignments/list?${p}`);
            if (!res || !res.ok) return;
            const rows = await res.json();
            renderAssignments(rows);
        } catch (err) { console.error('loadAssignments:', err); }
    }

    function renderAssignments(rows) {
        const tbody = document.getElementById('assignBody');
        const empty = document.getElementById('assignEmpty');
        const count = document.getElementById('assignCount');
        if (count) count.textContent = rows.length;

        if (!rows.length) {
            if (tbody) tbody.innerHTML = '';
            if (empty) empty.hidden = false;
            return;
        }
        if (empty) empty.hidden = true;

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td><strong>${_esc(r.teacher_name)}</strong></td>
                <td><span class="aa-badge aa-badge-info" style="font-weight:600">${_esc(r.subject_code ? r.subject_code + ' — ' + r.subject_name : r.subject_name)}</span></td>
                <td>${_esc(r.class_name)}</td>
                <td>${_esc(r.year_label)}</td>
                ${isAdmin ? `
                <td class="aa-table-actions">
                    <button class="aa-link-btn aa-link-danger" data-rem="${r.id}">Remove</button>
                </td>` : `<td class="aa-table-actions"><span style="color:var(--aa-text-muted);font-size:12px;">Active</span></td>`}
            </tr>`).join('');

        tbody.querySelectorAll('[data-rem]').forEach(btn =>
            btn.addEventListener('click', () => removeAssignment(btn.dataset.rem))
        );
    }

    function openAssignModal(preselectTeacherId) {
        if (preselectTeacherId) {
            const teacherSelect = document.getElementById('aTeacher');
            if (teacherSelect) teacherSelect.value = preselectTeacherId;
        }
        _showModal('assignModal');
    }

    async function saveAssignment() {
        const payload = {
            teacher_id: document.getElementById('aTeacher')?.value,
            subject_id: document.getElementById('aSubject')?.value,
            class_id: document.getElementById('aClass')?.value,
            academic_year_id: document.getElementById('aYear')?.value,
        };
        if (!payload.teacher_id || !payload.subject_id || !payload.class_id || !payload.academic_year_id) {
            return _showAssignStatus('All fields (Teacher, Subject, Class, Academic Year) are required.', 'error');
        }

        const btn = document.getElementById('saveAssignBtn');
        btn.disabled = true; btn.textContent = 'Assigning…';
        try {
            const res = await apiFetch('/api/subjects/assign', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res || !res.ok) {
                // Surface the server's error message clearly:
                // 409 = already assigned, 400 = missing field, 500 = server error
                const msg = data.error || `Assignment failed (HTTP ${res ? res.status : 'unknown'})`;
                return _showAssignStatus(msg, 'error');
            }
            _hideModal('assignModal');
            await Promise.all([loadAssignments(), loadSubjects()]);
        } catch (err) {
            _showAssignStatus(err.message || 'Failed to assign teacher.', 'error');
        } finally {
            btn.disabled = false; btn.textContent = 'Assign';
        }
    }

    async function removeAssignment(id) {
        if (!confirm('Remove this teacher assignment?')) return;
        try {
            const res = await apiFetch(`/api/subjects/assign/${id}`, { method: 'DELETE' });
            if (!res || !res.ok) throw new Error('Delete failed');
            await Promise.all([loadAssignments(), loadSubjects()]);
        } catch { alert('Unable to remove assignment.'); }
    }

    /* ─── Modal Helpers ───────────────────────────────────────────────────────── */
    function _showModal(id) {
        const m = document.getElementById(id);
        if (!m) return;
        m.hidden = false;
        m.classList.add('aa-modal-visible');
    }

    function _hideModal(id) {
        const m = document.getElementById(id);
        if (!m) return;
        m.hidden = true;
        m.classList.remove('aa-modal-visible');
    }

    /* ─── Events ─────────────────────────────────────────────────────────────── */
    function bindEvents() {
        // Subject modal
        document.getElementById('addSubjectBtn')?.addEventListener('click', openAddSubject);
        document.getElementById('closeSubjectModal')?.addEventListener('click', () => _hideModal('subjectModal'));
        document.getElementById('cancelSubjectBtn')?.addEventListener('click', () => _hideModal('subjectModal'));
        document.getElementById('saveSubjectBtn')?.addEventListener('click', saveSubject);

        // Assign modal
        document.getElementById('assignBtn')?.addEventListener('click', () => openAssignModal());
        document.getElementById('closeAssignModal')?.addEventListener('click', () => _hideModal('assignModal'));
        document.getElementById('cancelAssignBtn')?.addEventListener('click', () => _hideModal('assignModal'));
        document.getElementById('saveAssignBtn')?.addEventListener('click', saveAssignment);

        // Assignment filters
        ['filterAssignClass', 'filterAssignYear'].forEach(id =>
            document.getElementById(id)?.addEventListener('change', loadAssignments)
        );

        // Class record selector
        document.getElementById('recordClassSelect')?.addEventListener('change', (e) => loadClassRecord(e.target.value));

        // Manage Class Timetable button
        document.getElementById('manageClassTimetableBtn')?.addEventListener('click', () => {
            if (currentClassRecord && currentClassRecord.class) {
                window.location.href = `timetable-management.html?classId=${currentClassRecord.class.id}`;
            }
        });

        // Assign Class Teacher modal
        document.getElementById('assignClassTeacherBtn')?.addEventListener('click', openClassTeacherModal);
        document.getElementById('quickChangeTeacherBtn')?.addEventListener('click', openClassTeacherModal);
        document.getElementById('closeClassTeacherModalBtn')?.addEventListener('click', closeClassTeacherModal);
        document.getElementById('cancelClassTeacherBtn')?.addEventListener('click', closeClassTeacherModal);
        document.getElementById('saveClassTeacherBtn')?.addEventListener('click', saveClassTeacher);

        // Focus modal
        document.getElementById('editFocusBtn')?.addEventListener('click', openFocusModal);
        document.getElementById('closeFocusModal')?.addEventListener('click', closeFocusModal);
        document.getElementById('cancelFocusBtn')?.addEventListener('click', closeFocusModal);
        document.getElementById('saveFocusBtn')?.addEventListener('click', saveCoreFocus);
        document.getElementById('focusSelect')?.addEventListener('change', (e) => {
            if (e.target.value) {
                document.getElementById('focusCustom').value = e.target.value;
            }
        });
    }

    /* ─── Class Record & Core Focus ─────────────────────────────────────────── */
    let currentClassRecord = null;

    async function loadClassRecord(classId) {
        const placeholder = document.getElementById('classRecordPlaceholder');
        const overview = document.getElementById('classOverviewCard');
        const empty = document.getElementById('classRecordEmpty');
        const tableWrap = document.getElementById('classRecordTableWrap');
        const editBtn = document.getElementById('editFocusBtn');

        if (!classId) {
            if (placeholder) placeholder.hidden = false;
            if (overview) overview.style.display = 'none';
            if (empty) empty.hidden = true;
            if (tableWrap) tableWrap.hidden = true;
            if (editBtn) editBtn.style.display = 'none';
            currentClassRecord = null;
            return;
        }

        try {
            const res = await apiFetch(`/api/classes/${classId}/students`);
            if (!res || !res.ok) throw new Error('Failed to load class record');
            const data = await res.json();
            currentClassRecord = data;
            renderClassRecord(data);
        } catch (err) {
            console.error('loadClassRecord:', err);
            alert('Failed to load class record: ' + err.message);
        }
    }

    function renderClassRecord(data) {
        const placeholder = document.getElementById('classRecordPlaceholder');
        const overview = document.getElementById('classOverviewCard');
        const empty = document.getElementById('classRecordEmpty');
        const tableWrap = document.getElementById('classRecordTableWrap');
        const editBtn = document.getElementById('editFocusBtn');
        const timetableBtn = document.getElementById('manageClassTimetableBtn');
        const assignTeacherBtn = document.getElementById('assignClassTeacherBtn');
        const quickChangeBtn = document.getElementById('quickChangeTeacherBtn');

        const user = (typeof getUser === 'function' && getUser()) || {};
        const isPureAdmin = (user.role === 'admin');
        const { class: cls, subjects, students } = data;

        if (placeholder) placeholder.hidden = true;
        if (overview) overview.style.display = 'block';
        if (editBtn) editBtn.style.display = isPureAdmin ? 'inline-flex' : 'none';
        if (timetableBtn) timetableBtn.style.display = (isPureAdmin || user.role === 'headmaster') ? 'inline-flex' : 'none';
        if (assignTeacherBtn) assignTeacherBtn.style.display = isPureAdmin ? 'inline-flex' : 'none';
        if (quickChangeBtn) quickChangeBtn.style.display = isPureAdmin ? 'inline-flex' : 'none';

        // Title and teacher
        const titleEl = document.getElementById('classTitle');
        if (titleEl) titleEl.textContent = cls.class_name || `${cls.grade_level} ${cls.stream}`.trim();

        const countEl = document.getElementById('classRosterCount');
        if (countEl) countEl.textContent = `${students.length} ${students.length === 1 ? 'student' : 'students'}`;

        const teacherEl = document.getElementById('classTeacherName');
        if (teacherEl) teacherEl.textContent = cls.class_teacher_name || 'Not assigned';

        // Focus
        const focusEl = document.getElementById('classFocusText');
        if (focusEl) focusEl.textContent = cls.core_focus || 'General Secondary Core';

        // Subjects chips
        const chipsEl = document.getElementById('classSubjectChips');
        if (chipsEl) {
            if (!subjects.length) {
                chipsEl.innerHTML = '<span style="font-size:12.5px;color:var(--aa-text-muted);font-style:italic">No teacher-subject assignments for this class yet.</span>';
            } else {
                chipsEl.innerHTML = subjects.map(s => `
                    <span class="aa-badge" style="background:var(--aa-surface);border:1px solid var(--aa-border);color:var(--aa-text);padding:4px 10px;font-size:12px">
                        <strong>${_esc(s.subject_code)}</strong>: ${_esc(s.subject_name)} <span style="opacity:.7">(${_esc(s.teacher_name)})</span>
                    </span>
                `).join('');
            }
        }

        // Students table
        const tbody = document.getElementById('classRecordBody');
        if (!students.length) {
            if (empty) empty.hidden = false;
            if (tableWrap) tableWrap.hidden = true;
            if (tbody) tbody.innerHTML = '';
            return;
        }

        if (empty) empty.hidden = true;
        if (tableWrap) tableWrap.hidden = false;

        const focusLabel = cls.core_focus || 'General Secondary Core';
        tbody.innerHTML = students.map((s, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td><strong style="font-family:monospace;color:var(--aa-blue)">${_esc(s.admission_number)}</strong></td>
                <td><strong>${_esc(s.last_name)}, ${_esc(s.first_name)}</strong></td>
                <td>${_esc(s.gender || '—')}</td>
                <td><span class="aa-status-pill aa-status-${(s.status || 'active').toLowerCase()}">${_esc(s.status || 'Active')}</span></td>
                <td><span class="aa-badge" style="background:rgba(37,99,235,.08);color:var(--aa-blue);font-weight:600">${_esc(focusLabel)}</span></td>
                <td class="aa-table-actions">
                    <a class="aa-btn aa-btn-sm aa-btn-secondary" href="student-transcript.html?id=${s.id}">
                        📄 Transcript
                    </a>
                    <a class="aa-btn aa-btn-sm aa-btn-primary" href="academic-records.html?student_id=${s.id}" style="margin-left:6px;background:#2563EB;color:#fff;">
                        📊 Results
                    </a>
                </td>
            </tr>
        `).join('');
    }

    function openFocusModal() {
        if (!currentClassRecord) return;
        const cls = currentClassRecord.class;
        document.getElementById('focusClassId').value = cls.id;
        document.getElementById('focusCustom').value = cls.core_focus || '';
        document.getElementById('focusSelect').value = '';
        _showModal('focusModal');
    }

    function closeFocusModal() {
        _hideModal('focusModal');
    }

    function openClassTeacherModal() {
        if (!currentClassRecord) return;
        const cls = currentClassRecord.class;
        document.getElementById('classTeacherClassId').value = cls.id;
        const nameEl = document.getElementById('classTeacherClassName');
        if (nameEl) nameEl.textContent = cls.class_name || `${cls.grade_level} ${cls.stream}`.trim();

        // Populate teachers dropdown
        const select = document.getElementById('classTeacherSelect');
        if (select) {
            select.innerHTML = '<option value="">No Class Teacher (Unassigned)</option>' +
                allTeachers.map(t => `<option value="${t.id}" ${String(t.id) === String(cls.class_teacher_id) ? 'selected' : ''}>${_esc(t.name)}</option>`).join('');
        }
        _showModal('classTeacherModal');
    }

    function closeClassTeacherModal() {
        _hideModal('classTeacherModal');
    }

    async function saveClassTeacher() {
        const classId = document.getElementById('classTeacherClassId').value;
        const teacherId = document.getElementById('classTeacherSelect').value;
        const saveBtn = document.getElementById('saveClassTeacherBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';

        try {
            const res = await apiFetch(`/api/classes/${classId}`, {
                method: 'PUT',
                body: JSON.stringify({ class_teacher_id: teacherId ? parseInt(teacherId, 10) : null }),
            });
            if (!res || !res.ok) throw new Error('Failed to assign class teacher');
            closeClassTeacherModal();
            await loadClassRecord(classId);
        } catch (err) {
            alert('Failed to assign class teacher: ' + err.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Class Teacher';
        }
    }

    async function saveCoreFocus() {
        const classId = document.getElementById('focusClassId').value;
        const customVal = document.getElementById('focusCustom').value.trim();
        const selectVal = document.getElementById('focusSelect').value;
        const focus = customVal || selectVal || 'General Secondary Core';

        if (!focus) {
            alert('Please specify a core focus label.');
            return;
        }

        const saveBtn = document.getElementById('saveFocusBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';

        try {
            const res = await apiFetch(`/api/classes/${classId}`, {
                method: 'PUT',
                body: JSON.stringify({ core_focus: focus }),
            });
            if (!res || !res.ok) throw new Error('Failed to update core focus');
            closeFocusModal();
            await loadClassRecord(classId);
        } catch (err) {
            alert('Failed to save focus: ' + err.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Focus';
        }
    }

    /* ─── Helpers ─────────────────────────────────────────────────────────────── */
    function _classLabel(c) { return c.class_name || `${c.grade_level}${c.stream ? ' ' + c.stream : ''}`; }
    function _populate(id, items, vk, lf, ph) {
        const s = document.getElementById(id); if (!s) return;
        s.innerHTML = `<option value="">${ph}</option>` +
            items.map(i => `<option value="${i[vk]}">${_esc(lf(i))}</option>`).join('');
    }
    function _esc(v) {
        return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Shows an inline status message inside the assign modal.
     * type: 'error' | 'success'
     * Auto-clears after 6s for errors (keeps 'success' visible until modal closes).
     */
    function _showAssignStatus(msg, type) {
        let el = document.getElementById('assignStatusMsg');
        if (!el) {
            // Create status element dynamically if not already in HTML
            el = document.createElement('p');
            el.id = 'assignStatusMsg';
            el.style.cssText = 'margin:8px 0 0;padding:8px 12px;border-radius:6px;font-size:13px;font-weight:600;';
            const footer = document.querySelector('#assignModal .aa-modal-footer') ||
                           document.getElementById('saveAssignBtn')?.parentElement;
            if (footer) footer.insertBefore(el, footer.firstChild);
        }
        el.textContent = msg;
        el.style.background = type === 'error' ? 'rgba(220,38,38,.1)' : 'rgba(22,163,74,.1)';
        el.style.color       = type === 'error' ? '#dc2626'           : '#16a34a';
        el.style.display     = 'block';
        if (type === 'error') {
            clearTimeout(el._timer);
            el._timer = setTimeout(() => { el.style.display = 'none'; }, 6000);
        }
    }
})();