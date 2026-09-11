(function () {
    'use strict';

    let allClasses = [];
    let allSubjects = [];
    let allTerms = [];
    let allStudents = [];
    let assessmentPolicy = {
        assessment_model: 'MID_TERM_FINAL',
        mid_term_weight: 20,
        final_term_weight: 80,
        continuous_assessment_enabled: 0,
        continuous_assessment_weight: 0,
        grading_scheme: 'ECZ_SECONDARY'
    };

    // ── Role detection ───────────────────────────────────────────────────────
    let _userRole = 'user';
    let _userStudentId = null;
    try {
        const _u = JSON.parse(localStorage.getItem('user'));
        _userRole = (_u && _u.role) ? _u.role : 'user';
        _userStudentId = (_u && _u.student_id) ? _u.student_id : null;
    } catch (e) {}

    document.addEventListener('DOMContentLoaded', async () => {
        await loadPolicy();
        await loadMeta();
        await loadResults();

        // Student/Parent user scoping
        if (_userRole === 'user') {
            const addBtn = document.getElementById('addResultBtn');
            if (addBtn) addBtn.style.display = 'none';
            const addBtnEmpty = document.getElementById('addResultBtnEmpty');
            if (addBtnEmpty) addBtnEmpty.style.display = 'none';

            const subtitle = document.querySelector('.aa-subtitle');
            if (subtitle) subtitle.textContent = 'View your academic performance and assessment results.';
        }

        bindEvents();
    });

    /* ─── Policy Loader ──────────────────────────────────────────────────── */
    async function loadPolicy() {
        try {
            const res = await apiFetch('/api/results/policy');
            if (res && res.ok) {
                const data = await res.json();
                assessmentPolicy = Object.assign(assessmentPolicy, data);
            }
        } catch (err) {
            console.warn('loadPolicy:', err.message);
        }

        const caGroup = document.getElementById('fCAGroup');
        if (caGroup) {
            caGroup.style.display = assessmentPolicy.continuous_assessment_enabled ? 'block' : 'none';
        }
    }

    /* ─── ECZ Grade preview helper ───────────────────────────────────────── */
    function eczGrade(pct) {
        if (pct >= 75) return 'Distinction 1';
        if (pct >= 70) return 'Distinction 2';
        if (pct >= 64) return 'Merit 3';
        if (pct >= 60) return 'B Merit 4';
        if (pct >= 54) return 'Credit 5';
        if (pct >= 50) return 'Credit 6';
        if (pct >= 40) return 'Satisfactory 7';
        if (pct >= 30) return 'Satisfactory 8';
        return 'Fail 9';
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

        const canEdit = (_userRole === 'admin' || _userRole === 'headmaster' || _userRole === 'staff');

        tbody.innerHTML = rows.map(r => {
            const midVal = (r.mid_term_score != null) ? r.mid_term_score : (r.test_mark != null ? r.test_mark : '—');
            const finVal = (r.final_term_score != null) ? r.final_term_score : (r.exam_mark != null ? r.exam_mark : '—');
            const finalMarkText = (r.final_mark != null)
                ? `${parseFloat(r.final_mark).toFixed(1)}%`
                : (r.percentage != null && r.status === 'COMPLETE' ? `${parseFloat(r.percentage).toFixed(1)}%` : '—');
            
            const isComplete = (r.status === 'COMPLETE') || (r.final_mark != null && r.mid_term_score != null && r.final_term_score != null);
            const statusBadge = isComplete
                ? '<span class="aa-badge aa-badge-success" style="font-size:11px;padding:3px 8px">Complete</span>'
                : '<span class="aa-badge aa-badge-warning" style="font-size:11px;padding:3px 8px">Incomplete</span>';

            const gradeDisplay = r.grade_classification || (isComplete ? '—' : 'Pending');

            return `
            <tr>
                <td><strong>${_esc(r.first_name)} ${_esc(r.last_name)}</strong></td>
                <td><span style="font-family:monospace;font-size:12px;color:var(--aa-text-muted)">${_esc(r.admission_number)}</span></td>
                <td>${_esc(r.class_name)}</td>
                <td>${_esc(r.subject_name)}</td>
                <td style="font-weight:600">${midVal}</td>
                <td style="font-weight:600">${finVal}</td>
                <td style="font-weight:700;color:var(--aa-primary, #1B2A4A)">${finalMarkText}</td>
                <td><span class="aa-grade-pill">${_esc(gradeDisplay)}</span></td>
                <td>${statusBadge}</td>
                <td>${r.class_position || '—'}</td>
                <td class="aa-table-actions">
                    ${canEdit ? `
                    <button class="aa-link-btn" data-edit='${JSON.stringify(r).replace(/'/g, "&#39;")}'>Edit</button>
                    <button class="aa-link-btn aa-link-danger" data-del="${r.id}">Delete</button>` : '—'}
                </td>
            </tr>`;
        }).join('');

        if (canEdit) {
            tbody.querySelectorAll('[data-edit]').forEach(btn =>
                btn.addEventListener('click', () => openEdit(JSON.parse(btn.dataset.edit)))
            );
            tbody.querySelectorAll('[data-del]').forEach(btn =>
                btn.addEventListener('click', () => deleteResult(btn.dataset.del))
            );
        }
    }

    /* ─── Modal: Add / Edit ──────────────────────────────────────────────── */
    function openAdd() {
        _setText('modalTitle', 'Add Result');
        document.getElementById('editingId').value = '';
        ['fStudent', 'fSubject', 'fClass', 'fTerm', 'fMidTerm', 'fFinalTerm', 'fCAScore', 'fComment']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        
        const preview = document.getElementById('fTotalPreview');
        if (preview) preview.value = '';

        document.getElementById('resultModal').hidden = false;
    }

    function openEdit(r) {
        _setText('modalTitle', 'Edit Result');
        document.getElementById('editingId').value = r.id;
        document.getElementById('fSubject').value = r.subject_id;
        document.getElementById('fClass').value = r.class_id;
        document.getElementById('fTerm').value = r.term_id;

        const midVal = (r.mid_term_score != null) ? r.mid_term_score : (r.test_mark != null ? r.test_mark : '');
        const finVal = (r.final_term_score != null) ? r.final_term_score : (r.exam_mark != null ? r.exam_mark : '');
        const caVal = (r.continuous_assessment_score != null) ? r.continuous_assessment_score : (r.assignment_mark != null ? r.assignment_mark : '');

        document.getElementById('fMidTerm').value = midVal;
        document.getElementById('fFinalTerm').value = finVal;
        if (document.getElementById('fCAScore')) {
            document.getElementById('fCAScore').value = caVal;
        }
        document.getElementById('fComment').value = r.teacher_comment || '';

        // Reload students for this class, then set selected student
        reloadStudentsForClass(r.class_id).then(() => {
            document.getElementById('fStudent').value = r.student_id;
        });

        updatePreview();
        document.getElementById('resultModal').hidden = false;
    }

    function updatePreview() {
        const midStr = document.getElementById('fMidTerm')?.value?.trim();
        const finStr = document.getElementById('fFinalTerm')?.value?.trim();
        const caStr = document.getElementById('fCAScore')?.value?.trim();
        const preview = document.getElementById('fTotalPreview');
        if (!preview) return;

        const hasMid = (midStr !== '' && !isNaN(midStr));
        const hasFin = (finStr !== '' && !isNaN(finStr));
        const hasCA = (caStr !== '' && !isNaN(caStr));

        if (!hasMid && !hasFin) {
            preview.value = 'Enter Mid-Term and Final Term marks (0–100)';
            return;
        }

        const mid = hasMid ? parseFloat(midStr) : null;
        const fin = hasFin ? parseFloat(finStr) : null;
        const ca = hasCA ? parseFloat(caStr) : null;

        const midW = (assessmentPolicy.mid_term_weight || 20) / 100;
        const finW = (assessmentPolicy.final_term_weight || 80) / 100;
        const caEnabled = !!assessmentPolicy.continuous_assessment_enabled;
        const caW = caEnabled ? ((assessmentPolicy.continuous_assessment_weight || 0) / 100) : 0;

        if (mid === null || fin === null || (caEnabled && ca === null)) {
            const enteredParts = [];
            if (mid !== null) enteredParts.push(`Mid: ${mid}`);
            if (fin !== null) enteredParts.push(`Final: ${fin}`);
            if (caEnabled && ca !== null) enteredParts.push(`CA: ${ca}`);
            preview.value = `${enteredParts.join(', ')} → Incomplete (Pending Final Assessment)`;
            return;
        }

        let mark = (mid * midW) + (fin * finW);
        if (caEnabled && ca !== null) {
            mark += (ca * caW);
        }
        mark = Math.round(mark * 10) / 10;
        const grade = eczGrade(mark);
        preview.value = `${mark}% — ${grade} (${midW * 100}% Mid-Term + ${finW * 100}% Final)`;
    }

    function closeModal() {
        document.getElementById('resultModal').hidden = true;
    }

    async function saveResult() {
        const id = document.getElementById('editingId').value;
        const isEdit = !!id;

        const midStr = document.getElementById('fMidTerm')?.value?.trim();
        const finStr = document.getElementById('fFinalTerm')?.value?.trim();
        const caStr = document.getElementById('fCAScore')?.value?.trim();

        const payload = {
            student_id: document.getElementById('fStudent').value,
            subject_id: document.getElementById('fSubject').value,
            class_id: document.getElementById('fClass').value,
            term_id: document.getElementById('fTerm').value,
            mid_term_score: (midStr !== '' && !isNaN(midStr)) ? parseFloat(midStr) : null,
            final_term_score: (finStr !== '' && !isNaN(finStr)) ? parseFloat(finStr) : null,
            continuous_assessment_score: (caStr !== '' && !isNaN(caStr)) ? parseFloat(caStr) : null,
            teacher_comment: document.getElementById('fComment').value || null,
        };

        const term = allTerms.find(t => String(t.id) === String(payload.term_id));
        if (term) payload.academic_year_id = term.academic_year_id;

        if (!payload.student_id || !payload.subject_id || !payload.class_id || !payload.term_id) {
            return alert('Please fill in all required fields (Student, Subject, Class, Term).');
        }

        const btn = document.getElementById('saveResultBtn');
        btn.disabled = true; btn.textContent = 'Saving…';

        try {
            const res = await apiFetch(isEdit ? `/api/results/${id}` : '/api/results', {
                method: isEdit ? 'PUT' : 'POST',
                body: JSON.stringify(payload),
            });
            const d = await res.json().catch(() => ({}));
            if (!res || !res.ok) { throw new Error(d.error || 'Failed to save result'); }
            closeModal();
            await loadResults();
        } catch (err) {
            alert(err.message || 'Failed to save result.');
        } finally {
            btn.disabled = false; btn.textContent = 'Save Result';
        }
    }

    async function deleteResult(id) {
        if (!confirm('Delete this result record? This cannot be undone.')) return;
        try {
            const res = await apiFetch(`/api/results/${id}`, { method: 'DELETE' });
            if (!res || !res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || 'Delete failed');
            }
            await loadResults();
        } catch (err) {
            alert(err.message || 'Unable to delete result.');
        }
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

        // Live calculation preview
        ['fMidTerm', 'fFinalTerm', 'fCAScore'].forEach(id =>
            document.getElementById(id)?.addEventListener('input', updatePreview)
        );

        // Cascade class → students dropdown
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