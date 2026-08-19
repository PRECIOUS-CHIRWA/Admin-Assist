(function () {
    'use strict';

    let allClasses = [];
    let allTerms = [];
    let allSubjects = [];
    let allTeachers = [];

    document.addEventListener('DOMContentLoaded', async () => {
        await loadMeta();
        await Promise.all([loadSubjects(), loadAssignments()]);
        bindEvents();

        // If URL has teacher_id query param, open Assign Modal with that teacher pre-selected
        const urlParams = new URLSearchParams(window.location.search);
        const preselectTeacherId = urlParams.get('teacher_id') || urlParams.get('teacherId');
        if (preselectTeacherId) {
            openAssignModal(preselectTeacherId);
        }
    });

    /* ─── Meta ─────────────────────────────────────────────────────────────── */
    async function loadMeta() {
        try {
            const [cr, tr, yrRes, teacherRes] = await Promise.all([
                apiFetch('/api/attendance/classes').catch(() => null),
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
                <td class="aa-table-actions">
                    <button class="aa-link-btn" data-edit='${JSON.stringify(s).replace(/'/g, "&#39;")}'>Edit</button>
                    <button class="aa-link-btn aa-link-danger"
                        data-toggle="${s.id}" data-active="${s.is_active ? '1' : '0'}">
                        ${s.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                </td>
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
                <td class="aa-table-actions">
                    <button class="aa-link-btn aa-link-danger" data-rem="${r.id}">Remove</button>
                </td>
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
            return alert('All fields (Teacher, Subject, Class, Academic Year) are required.');
        }

        const btn = document.getElementById('saveAssignBtn');
        btn.disabled = true; btn.textContent = 'Assigning…';
        try {
            const res = await apiFetch('/api/subjects/assign', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            if (!res || !res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to assign teacher'); }
            _hideModal('assignModal');
            await Promise.all([loadAssignments(), loadSubjects()]);
        } catch (err) { alert(err.message || 'Failed to assign teacher.'); }
        finally { btn.disabled = false; btn.textContent = 'Assign'; }
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
})();