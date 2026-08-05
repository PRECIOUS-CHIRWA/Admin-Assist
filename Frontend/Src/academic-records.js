(function () {
    'use strict';

    let allClasses = [];
    let allSubjects = [];
    let allTerms = [];
    let allStudents = [];   // full list, used as fallback when no class selected

    document.addEventListener('DOMContentLoaded', async () => {
        await loadMeta();
        await loadResults();
        await loadStats();
        bindEvents();
    });

    /* ─── ECZ Grade preview (mirrors backend) ─────────────────────────────── */
    function eczGrade(pct) {
        if (pct >= 75) return 'Distinction 1';
        if (pct >= 70) return 'Distinction 2';
        if (pct >= 64) return 'Merit';
        if (pct >= 60) return 'Merit (B)';
        if (pct >= 54) return 'Credit';
        if (pct >= 50) return 'Credit (6)';
        if (pct >= 40) return 'Satisfactory';
        if (pct >= 30) return 'Satisfactory (8)';
        return 'Fail';
    }

    /* ─── Meta loads ─────────────────────────────────────────────────────── */
    async function loadMeta() {
        try {
            const [cr, sr, tr, stR] = await Promise.all([
                apiFetch('/api/attendance/classes'),
                apiFetch('/api/subjects?is_active=1'),
                apiFetch('/api/attendance/terms'),
                apiFetch('/api/search/students'),
            ]);

            allClasses = await cr.json();
            allSubjects = await sr.json();
            allTerms = await tr.json();
            const sd = await stR.json();
            allStudents = sd.students || [];

            // Filter bar dropdowns
            _populate('filterClass', allClasses, 'id', c => _classLabel(c), 'All Classes');
            _populate('filterSubject', allSubjects, 'id', s => s.subject_name, 'All Subjects');
            _populate('filterTerm', allTerms, 'id', t => `${t.term_name} (${t.year_label})`, 'All Terms');

            // Modal dropdowns
            _populate('fClass', allClasses, 'id', c => _classLabel(c), 'Select Class…');
            _populate('fSubject', allSubjects, 'id', s => s.subject_name, 'Select Subject…');
            _populate('fTerm', allTerms, 'id', t => `${t.term_name} (${t.year_label})`, 'Select Term…');
            _populateStudents(allStudents);  // initial full list

            const cur = allTerms.find(t => t.is_current);
            if (cur) document.getElementById('filterTerm').value = cur.id;
        } catch (err) { console.error('loadMeta:', err); }
    }

    /* ─── Cascade: when class changes in modal, reload student dropdown ─────── */
    async function reloadStudentsForClass(classId) {
        if (!classId) {
            _populateStudents(allStudents);
            return;
        }
        try {
            const res = await apiFetch(`/api/search/students?class_id=${classId}`);
            if (!res || !res.ok) { _populateStudents(allStudents); return; }
            const data = await res.json();
            _populateStudents(data.students || []);
        } catch (err) {
            console.error('reloadStudentsForClass:', err);
            _populateStudents(allStudents);
        }
    }

    function _populateStudents(students) {
        _populate('fStudent', students, 'id',
            s => `${s.last_name}, ${s.first_name} (${s.admission_number})`,
            students.length ? 'Select Student…' : '— No students in this class —'
        );
    }

    /* ─── Results table ──────────────────────────────────────────────────── */
    async function loadResults() {
        const p = new URLSearchParams();
        const v = id => document.getElementById(id)?.value || '';
        if (v('filterClass')) p.set('class_id', v('filterClass'));
        if (v('filterSubject')) p.set('subject_id', v('filterSubject'));
        if (v('filterTerm')) p.set('term_id', v('filterTerm'));

        try {
            const res = await apiFetch(`/api/results?${p}`);
            if (!res || !res.ok) return;
            const rows = await res.json();
            renderTable(rows);
        } catch (err) { console.error('loadResults:', err); }
    }

    function renderTable(rows) {
        const tbody = document.getElementById('tableBody');
        const empty = document.getElementById('emptyState');
        const badge = document.getElementById('countBadge');
        if (badge) badge.textContent = `${rows.length} result${rows.length !== 1 ? 's' : ''}`;

        if (!rows.length) {
            if (tbody) tbody.innerHTML = '';
            if (empty) empty.hidden = false;
            return;
        }
        if (empty) empty.hidden = true;

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>${_esc(r.first_name)} ${_esc(r.last_name)}</td>
                <td>${_esc(r.admission_number)}</td>
                <td>${_esc(r.class_name)}</td>
                <td>${_esc(r.subject_name)}</td>
                <td>${r.test_mark}</td>
                <td>${r.assignment_mark}</td>
                <td>${r.exam_mark}</td>
                <td>${r.total_marks}</td>
                <td>${parseFloat(r.percentage).toFixed(1)}%</td>
                <td><span class="aa-grade-pill">${_esc(r.grade_classification)}</span></td>
                <td>${r.class_position || '—'}</td>
                <td class="aa-table-actions">
                    <button class="aa-link-btn" data-edit='${JSON.stringify(r).replace(/'/g, "&#39;")}'>Edit</button>
                    <button class="aa-link-btn aa-link-danger" data-del="${r.id}">Delete</button>
                </td>
            </tr>`).join('');

        tbody.querySelectorAll('[data-edit]').forEach(btn =>
            btn.addEventListener('click', () => openEdit(JSON.parse(btn.dataset.edit)))
        );
        tbody.querySelectorAll('[data-del]').forEach(btn =>
            btn.addEventListener('click', () => deleteResult(btn.dataset.del))
        );
    }

    async function loadStats() {
        try {
            const res = await apiFetch('/api/results/analytics/summary');
            if (!res || !res.ok) return;
            const data = await res.json();
            _setText('statTotal', data.overall?.total_entries || 0);
            _setText('statAvg', `${parseFloat(data.overall?.overall_average || 0).toFixed(1)}%`);
            _setText('statPass', `${data.overall?.pass_rate || 0}%`);
            _setText('statFail', data.overall?.failures || 0);
        } catch { /* non-critical */ }
    }

    /* ─── Modal: Add / Edit ──────────────────────────────────────────────── */
    function openAdd() {
        _setText('modalTitle', 'Add Result');
        document.getElementById('editingId').value = '';
        ['fStudent', 'fSubject', 'fClass', 'fTerm', 'fTest', 'fAssign', 'fExam', 'fComment']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        _setText('fTotalPreview', '');
        document.getElementById('resultModal').hidden = false;
    }

    function openEdit(r) {
        _setText('modalTitle', 'Edit Result');
        document.getElementById('editingId').value = r.id;
        document.getElementById('fSubject').value = r.subject_id;
        document.getElementById('fClass').value = r.class_id;
        document.getElementById('fTerm').value = r.term_id;
        document.getElementById('fTest').value = r.test_mark;
        document.getElementById('fAssign').value = r.assignment_mark;
        document.getElementById('fExam').value = r.exam_mark;
        document.getElementById('fComment').value = r.teacher_comment || '';

        // Reload students for this class, then set selected student
        reloadStudentsForClass(r.class_id).then(() => {
            document.getElementById('fStudent').value = r.student_id;
        });

        updatePreview();
        document.getElementById('resultModal').hidden = false;
    }

    function updatePreview() {
        const t = parseFloat(document.getElementById('fTest')?.value || 0);
        const a = parseFloat(document.getElementById('fAssign')?.value || 0);
        const e = parseFloat(document.getElementById('fExam')?.value || 0);
        const total = t + a + e;
        const pct = Math.min(total, 100);
        const el = document.getElementById('fTotalPreview');
        if (el) el.value = `${total.toFixed(1)} / 100 → ${pct.toFixed(1)}% → ${eczGrade(pct)}`;
    }

    function closeModal() {
        document.getElementById('resultModal').hidden = true;
    }

    async function saveResult() {
        const id = document.getElementById('editingId').value;
        const isEdit = !!id;
        const payload = {
            student_id: document.getElementById('fStudent').value,
            subject_id: document.getElementById('fSubject').value,
            class_id: document.getElementById('fClass').value,
            term_id: document.getElementById('fTerm').value,
            test_mark: parseFloat(document.getElementById('fTest').value || 0),
            assignment_mark: parseFloat(document.getElementById('fAssign').value || 0),
            exam_mark: parseFloat(document.getElementById('fExam').value || 0),
            teacher_comment: document.getElementById('fComment').value || null,
        };

        const term = allTerms.find(t => String(t.id) === String(payload.term_id));
        if (term) payload.academic_year_id = term.academic_year_id;

        if (!payload.student_id || !payload.subject_id || !payload.class_id || !payload.term_id) {
            return alert('Please fill in all required fields.');
        }

        const btn = document.getElementById('saveResultBtn');
        btn.disabled = true; btn.textContent = 'Saving…';

        try {
            const res = await apiFetch(isEdit ? `/api/results/${id}` : '/api/results', {
                method: isEdit ? 'PUT' : 'POST',
                body: JSON.stringify(payload),
            });
            if (!res || !res.ok) { const d = await res.json(); throw new Error(d.error); }
            closeModal();
            await loadResults();
            await loadStats();
        } catch (err) {
            alert(err.message || 'Failed to save result.');
        } finally {
            btn.disabled = false; btn.textContent = 'Save Result';
        }
    }

    async function deleteResult(id) {
        if (!confirm('Delete this result? This cannot be undone.')) return;
        try {
            const res = await apiFetch(`/api/results/${id}`, { method: 'DELETE' });
            if (!res || !res.ok) throw new Error('Delete failed');
            await loadResults();
            await loadStats();
        } catch { alert('Unable to delete result.'); }
    }

    /* ─── Event wiring ───────────────────────────────────────────────────── */
    function bindEvents() {
        document.getElementById('addResultBtn')?.addEventListener('click', openAdd);
        document.getElementById('addResultBtnEmpty')?.addEventListener('click', openAdd);
        document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
        document.getElementById('cancelModalBtn')?.addEventListener('click', closeModal);
        document.getElementById('saveResultBtn')?.addEventListener('click', saveResult);
        document.getElementById('resultModal')?.addEventListener('click', e => {
            if (e.target.id === 'resultModal') closeModal();
        });

        // Live grade preview
        ['fTest', 'fAssign', 'fExam'].forEach(id =>
            document.getElementById(id)?.addEventListener('input', updatePreview)
        );

        // ── KEY FIX: cascade class → students dropdown ──────────────────────
        document.getElementById('fClass')?.addEventListener('change', e => {
            reloadStudentsForClass(e.target.value);
        });

        // Filter bar
        ['filterClass', 'filterSubject', 'filterTerm'].forEach(id =>
            document.getElementById(id)?.addEventListener('change', loadResults)
        );
        document.getElementById('clearBtn')?.addEventListener('click', () => {
            ['filterClass', 'filterSubject', 'filterTerm']
                .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            loadResults();
        });
    }

    /* ─── Helpers ────────────────────────────────────────────────────────── */
    function _classLabel(c) { return c.class_name || `${c.grade_level}${c.stream ? ' ' + c.stream : ''}`; }
    function _populate(id, items, vk, lf, ph) {
        const s = document.getElementById(id); if (!s) return;
        s.innerHTML = `<option value="">${ph}</option>` +
            items.map(i => `<option value="${i[vk]}">${_esc(lf(i))}</option>`).join('');
    }
    function _setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
    function _esc(v) {
        return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();