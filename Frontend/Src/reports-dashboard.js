// reports-dashboard.js — Sprint 5 (full CSV + PDF export, live KPIs)
// Depends on: auth.js (apiFetch), navigation.js, jsPDF + jspdf-autotable CDN

(function () {
    'use strict';

    // ─── Per-student state ─────────────────────────────────────────────────────
    // Each tab independently tracks the selected student ID and search timer.
    const _state = {
        ac:  { studentId: null, timer: null, data: null },
        ts:  { studentId: null, timer: null, data: null },
        att: { studentId: null, timer: null },
    };

    // ─── Bootstrap ────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', async () => {
        await Promise.all([loadMeta(), loadSummary()]);
        bindEvents();
    });

    // ─── Meta data (dropdowns) ────────────────────────────────────────────────

    async function loadMeta() {
        try {
            const [classRes, yearRes, termRes] = await Promise.all([
                apiFetch('/api/attendance/classes'),
                apiFetch('/api/attendance/academic-years'),
                apiFetch('/api/attendance/terms'),
            ]);

            const classes = (classRes && classRes.ok) ? await classRes.json() : [];
            const years   = (yearRes  && yearRes.ok)  ? await yearRes.json()  : [];
            const terms   = (termRes  && termRes.ok)  ? await termRes.json()  : [];

            const classLabel = c => c.class_name || `${c.grade_level}${c.stream ? ' ' + c.stream : ''}`;
            const yearLabel  = y => y.year_label;
            const termLabel  = t => `${t.term_name} (${t.year_label})`;

            // Export tab filters
            populateSelect('filterClass', classes, 'id', classLabel, 'All Classes');
            populateSelect('filterYear',  years,   'id', yearLabel,  'All Years');
            populateSelect('filterTerm',  terms,   'id', termLabel,  'All Terms');

            // Export panel filters (duplicate selects with different IDs)
            populateSelect('expFilterClass', classes, 'id', classLabel, 'All Classes');
            populateSelect('expFilterYear',  years,   'id', yearLabel,  'All Years');
            populateSelect('expFilterTerm',  terms,   'id', termLabel,  'All Terms');

            // Per-student tab year filters
            ['acYearFilter', 'tsYearFilter', 'attYearFilter'].forEach(id =>
                populateSelect(id, years, 'id', yearLabel, 'All Years')
            );
            // Academic tab also has a term filter
            populateSelect('acTermFilter', terms, 'id', termLabel, 'All Terms');

        } catch (err) {
            console.error('loadMeta:', err);
        }
    }

    // ─── Summary KPIs ─────────────────────────────────────────────────────────

    async function loadSummary() {
        try {
            const res = await apiFetch('/api/reports/summary');
            if (!res || !res.ok) return;
            const data = await res.json();
            setText('kpiStudents',  data.total_students   || 0);
            setText('kpiClasses',   data.total_classes    || 0);
            setText('kpiAttendance', `${data.overall_attendance_rate || 0}%`);
            setText('kpiAvg',       `${data.overall_average || 0}%`);
            setText('kpiPass',      `${data.pass_rate       || 0}%`);
        } catch (err) {
            console.error('loadSummary:', err);
        }
    }

    // ─── Build query params from filter bar ───────────────────────────────────

    function buildParams(extra = {}) {
        const p = new URLSearchParams();
        const classId = document.getElementById('filterClass').value;
        const termId  = document.getElementById('filterTerm').value;
        const yearId  = document.getElementById('filterYear').value;
        if (classId) p.set('class_id',         classId);
        if (termId)  p.set('term_id',           termId);
        if (yearId)  p.set('academic_year_id',  yearId);
        Object.entries(extra).forEach(([k, v]) => p.set(k, v));
        return p;
    }

    // ─── CSV download ─────────────────────────────────────────────────────────

    async function downloadCSV(endpoint, filename) {
        showStatus('Preparing CSV…', 'info');
        try {
            const p = buildParams({ format: 'csv' });
            const res = await apiFetch(`${endpoint}?${p}`);
            if (!res || !res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error); }
            const csv = await res.text();
            triggerBlobDownload(csv, 'text/csv', filename);
            showStatus('✓ CSV download started.', 'success');
        } catch (err) {
            showStatus(err.message || 'Download failed.', 'danger');
        }
    }

    // ─── PDF download (fetch JSON → build PDF client-side) ───────────────────

    async function downloadPDF(endpoint, filename, config) {
        if (!window.jspdf) {
            alert('PDF library not loaded. Check your internet connection.');
            return;
        }
        showStatus('Generating PDF…', 'info');
        try {
            const p = buildParams({ format: 'json' });
            const res = await apiFetch(`${endpoint}?${p}`);
            if (!res || !res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error); }
            const data = await res.json();
            buildReportPDF(data, filename, config);
            showStatus('✓ PDF download started.', 'success');
        } catch (err) {
            showStatus(err.message || 'PDF generation failed.', 'danger');
        }
    }

    // ─── Generic PDF builder ──────────────────────────────────────────────────

    function buildReportPDF(data, filename, { title, subtitle, columns, rowsFn }) {
        const { jsPDF }  = window.jspdf;
        const doc        = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageW      = doc.internal.pageSize.getWidth();
        const pageH      = doc.internal.pageSize.getHeight();
        const margin     = 12;

        // Header
        doc.setFillColor(30, 58, 138);
        doc.rect(0, 0, pageW, 26, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(title, margin, 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(subtitle, margin, 20);
        doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, pageW - margin, 20, { align: 'right' });

        // Filter context
        const yearEl  = document.getElementById('filterYear');
        const termEl  = document.getElementById('filterTerm');
        const classEl = document.getElementById('filterClass');
        const filterStr = [
            yearEl.value  ? `Year: ${yearEl.options[yearEl.selectedIndex].text}`   : '',
            termEl.value  ? `Term: ${termEl.options[termEl.selectedIndex].text}`   : '',
            classEl.value ? `Class: ${classEl.options[classEl.selectedIndex].text}` : '',
        ].filter(Boolean).join('   ');
        if (filterStr) {
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(7);
            doc.text(`Filters: ${filterStr}`, margin, 32);
        }

        // Table
        const rows = Array.isArray(data) ? data : (data.students || data.subjects || data.rows || []);
        doc.autoTable({
            startY    : filterStr ? 36 : 30,
            margin    : { left: margin, right: margin },
            head      : [columns.map(c => c.label)],
            body      : rows.map(r => rowsFn(r)),
            styles    : { fontSize: 7.5, cellPadding: 2 },
            headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
            alternateRowStyles: { fillColor: [249, 250, 251] },
        });

        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 5, { align: 'right' });
            doc.text('Admin Assist SIS — Confidential', margin, pageH - 5);
        }

        doc.save(filename);
    }

    // ─── Report configurations ────────────────────────────────────────────────

    const REPORTS = {
        enrollment: {
            endpoint : '/api/reports/enrollment',
            csvFile  : 'enrollment_report.csv',
            pdfFile  : 'enrollment_report.pdf',
            pdf: {
                title    : 'Enrollment Report',
                subtitle : 'All enrolled students with class placement, gender, and enrollment date',
                columns  : [
                    { key: 'admission_number', label: 'Adm No' },
                    { key: 'first_name',        label: 'First Name' },
                    { key: 'last_name',         label: 'Last Name' },
                    { key: 'gender',            label: 'Gender' },
                    { key: 'class_name',        label: 'Class' },
                    { key: 'enrollment_date',   label: 'Enrolled' },
                    { key: 'status',            label: 'Status' },
                ],
                rowsFn: r => [r.admission_number, r.first_name, r.last_name, r.gender,
                              r.class_name, r.enrollment_date, r.status],
            },
        },
        attendance: {
            endpoint : '/api/reports/attendance',
            csvFile  : 'attendance_report.csv',
            pdfFile  : 'attendance_report.pdf',
            pdf: {
                title    : 'Attendance Report',
                subtitle : 'Per-student attendance summary: present, absent, late, excused, and rate',
                columns  : [
                    { key: 'admission_number', label: 'Adm No' },
                    { key: 'first_name',        label: 'First Name' },
                    { key: 'last_name',         label: 'Last Name' },
                    { key: 'class_name',        label: 'Class' },
                    { key: 'total_sessions',    label: 'Sessions' },
                    { key: 'present',           label: 'Present' },
                    { key: 'absent',            label: 'Absent' },
                    { key: 'late',              label: 'Late' },
                    { key: 'excused',           label: 'Excused' },
                    { key: 'attendance_rate',   label: 'Rate (%)' },
                ],
                rowsFn: r => [r.admission_number, r.first_name, r.last_name, r.class_name,
                              r.total_sessions, r.present, r.absent, r.late, r.excused, r.attendance_rate],
            },
        },
        academic: {
            endpoint : '/api/reports/academic',
            csvFile  : 'academic_report.csv',
            pdfFile  : 'academic_report.pdf',
            pdf: {
                title    : 'Academic Results Report',
                subtitle : 'Student marks, percentages, ECZ grades, and class positions by subject',
                columns  : [
                    { label: 'Adm No' }, { label: 'Name' }, { label: 'Class' },
                    { label: 'Subject' }, { label: 'Total' }, { label: '%' },
                    { label: 'Grade' }, { label: 'Position' },
                ],
                rowsFn: r => [r.admission_number, `${r.first_name} ${r.last_name}`, r.class_name,
                              r.subject_name, r.total_marks, `${parseFloat(r.percentage || 0).toFixed(1)}%`,
                              r.grade_classification, r.class_position || '—'],
            },
        },
        top: {
            endpoint : '/api/reports/top-performers',
            csvFile  : 'top_performers.csv',
            pdfFile  : 'top_performers.pdf',
            pdf: {
                title    : 'Top Performers Report',
                subtitle : 'Students ranked by overall average percentage',
                columns  : [
                    { label: '#' }, { label: 'Adm No' }, { label: 'Name' },
                    { label: 'Class' }, { label: 'Average (%)' }, { label: 'Subjects' },
                ],
                rowsFn: (r, i) => [i + 1, r.admission_number, `${r.first_name} ${r.last_name}`,
                                   r.class_name, `${r.avg_percentage}%`, r.subjects_recorded],
            },
        },
        subject: {
            endpoint : '/api/reports/subject-performance',
            csvFile  : 'subject_performance.csv',
            pdfFile  : 'subject_performance.pdf',
            pdf: {
                title    : 'Subject Performance Report',
                subtitle : 'Average marks and pass rate per subject',
                columns  : [
                    { label: 'Code' }, { label: 'Subject' }, { label: 'Entries' },
                    { label: 'Avg %' }, { label: 'Passes' }, { label: 'Pass Rate' },
                    { label: 'Min %' }, { label: 'Max %' },
                ],
                rowsFn: r => [r.subject_code, r.subject_name, r.entries,
                              `${r.avg_percentage}%`, r.passes, `${r.pass_rate}%`,
                              r.min_pct, r.max_pct],
            },
        },
        risk: {
            endpoint : '/api/reports/intervention',
            csvFile  : 'students_at_risk.csv',
            pdfFile  : 'students_at_risk.pdf',
            pdf: {
                title    : 'Students at Risk — Academic Intervention Report',
                subtitle : 'Students averaging below 50% — requires immediate academic support',
                columns  : [
                    { label: 'Adm No' }, { label: 'Name' }, { label: 'Class' },
                    { label: 'Avg %' }, { label: 'Fails' }, { label: 'Parent/Guardian' }, { label: 'Contact' },
                ],
                rowsFn: r => [r.admission_number, `${r.first_name} ${r.last_name}`, r.class_name,
                              `${r.avg_percentage}%`, r.fails, r.parent_guardian_name, r.phone_number],
            },
        },
    };

    // ─── Event binding ────────────────────────────────────────────────────────

    function bindEvents() {
        // ── Enrollment (Export tab) ──────────────────────────────────────────
        btn('dlEnrollCsvBtn', () => downloadCSV(REPORTS.enrollment.endpoint, REPORTS.enrollment.csvFile));
        btn('dlEnrollPdfBtn', () => downloadPDF(REPORTS.enrollment.endpoint, REPORTS.enrollment.pdfFile, REPORTS.enrollment.pdf));

        // Attendance (Export tab)
        btn('dlAttendCsvBtn', () => downloadCSV(REPORTS.attendance.endpoint, REPORTS.attendance.csvFile));
        btn('dlAttendPdfBtn', () => downloadPDF(REPORTS.attendance.endpoint, REPORTS.attendance.pdfFile, REPORTS.attendance.pdf));

        // Academic (Export tab)
        btn('dlAcadCsvBtn', () => downloadCSV(REPORTS.academic.endpoint, REPORTS.academic.csvFile));
        btn('dlAcadPdfBtn', () => downloadPDF(REPORTS.academic.endpoint, REPORTS.academic.pdfFile, REPORTS.academic.pdf));

        // Top Performers (Export tab)
        btn('dlTopCsvBtn', () => downloadCSV(REPORTS.top.endpoint, REPORTS.top.csvFile));
        btn('dlTopPdfBtn', () => downloadPDF(REPORTS.top.endpoint, REPORTS.top.pdfFile, REPORTS.top.pdf));

        // Subject Performance (Export tab)
        btn('dlSubjCsvBtn', () => downloadCSV(REPORTS.subject.endpoint, REPORTS.subject.csvFile));
        btn('dlSubjPdfBtn', () => downloadPDF(REPORTS.subject.endpoint, REPORTS.subject.pdfFile, REPORTS.subject.pdf));

        // Students at Risk (Export tab)
        btn('dlRiskCsvBtn', () => downloadCSV(REPORTS.risk.endpoint, REPORTS.risk.csvFile));
        btn('dlRiskPdfBtn', () => downloadPDF(REPORTS.risk.endpoint, REPORTS.risk.pdfFile, REPORTS.risk.pdf));

        // ── Per-student: Academic Report tab ────────────────────────────────
        bindStudentSearch('acStudentSearch', 'ac', 'acSuggestions');
        btn('generateAcBtn', generateAcademicReport);

        // ── Per-student: Transcript tab ─────────────────────────────────────
        bindStudentSearch('tsStudentSearch', 'ts', 'tsSuggestions');
        btn('generateTsBtn', generateTranscript);
        btn('tsPdfBtn', () => { if (_state.ts.data) downloadTranscriptPDF(_state.ts.data); });
        btn('tsCsvBtn', () => { if (_state.ts.data) downloadTranscriptCSV(_state.ts.data); });

        // ── Per-student: Attendance tab ─────────────────────────────────────
        bindStudentSearch('attStudentSearch', 'att', 'attSuggestions');
        btn('generateAttBtn', generateAttendanceReport);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function btn(id, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function populateSelect(id, items, valueKey, labelFn, placeholder) {
        const s = document.getElementById(id);
        if (!s) return;
        s.innerHTML =
            `<option value="">${placeholder}</option>` +
            items.map(i =>
                `<option value="${i[valueKey]}">${String(labelFn(i)).replaceAll('&', '&amp;')}</option>`
            ).join('');
    }

    function showStatus(msg, type) {
        const el = document.getElementById('statusMsg');
        if (!el) return;
        el.textContent = msg;
        el.className   = `aa-alert aa-alert-${type}`;
        el.hidden      = false;
        if (type === 'success') setTimeout(() => { el.hidden = true; }, 5000);
    }

    function triggerBlobDownload(content, mimeType, filename) {
        const blob = new Blob([content], { type: mimeType });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function esc(v) {
        return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ─── Per-student: shared search helpers ──────────────────────────────────

    /**
     * Wires a search input to live-search students and fill a suggestion dropdown.
     * @param {string} inputId  - The <input> element ID
     * @param {string} stateKey - Key in _state ('ac'|'ts'|'att')
     * @param {string} dropId   - The suggestions container element ID (will be created if missing)
     */
    function bindStudentSearch(inputId, stateKey, dropId) {
        const input = document.getElementById(inputId);
        if (!input) return;

        // Create suggestion container if not already in HTML
        let drop = document.getElementById(dropId);
        if (!drop) {
            drop = document.createElement('div');
            drop.id = dropId;
            drop.style.cssText = [
                'position:absolute', 'z-index:100', 'background:var(--aa-surface)',
                'border:1px solid var(--aa-border)', 'border-radius:var(--aa-radius-md)',
                'box-shadow:var(--aa-shadow-sm)', 'max-height:220px', 'overflow-y:auto',
                'display:none', 'min-width:100%',
            ].join(';');
            const wrap = input.closest('.rt-filter-field') || input.parentElement;
            wrap.style.position = 'relative';
            wrap.appendChild(drop);
        }

        input.addEventListener('input', () => {
            clearTimeout(_state[stateKey].timer);
            const q = input.value.trim();
            _state[stateKey].studentId = null;
            if (q.length < 2) { drop.style.display = 'none'; return; }
            _state[stateKey].timer = setTimeout(() => _searchStudents(q, stateKey, inputId, drop), 300);
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Escape') drop.style.display = 'none';
        });

        document.addEventListener('click', e => {
            if (!drop.contains(e.target) && e.target !== input) drop.style.display = 'none';
        });
    }

    async function _searchStudents(q, stateKey, inputId, drop) {
        try {
            const res = await apiFetch(`/api/search/students?q=${encodeURIComponent(q)}`);
            if (!res || !res.ok) return;
            const data = await res.json();
            _renderSuggestions(data.students || [], stateKey, inputId, drop);
        } catch (err) {
            console.error('_searchStudents:', err);
        }
    }

    function _renderSuggestions(students, stateKey, inputId, drop) {
        if (!students.length) {
            drop.innerHTML = `<div style="padding:.75rem 1rem;color:var(--aa-text-muted);font-size:.875rem">No students found.</div>`;
            drop.style.display = 'block';
            return;
        }
        drop.innerHTML = students.map(s => `
            <div class="rt-suggestion-item" data-id="${s.id}"
                 style="padding:.6rem 1rem;cursor:pointer;border-bottom:1px solid var(--aa-border);
                        font-size:.875rem;display:flex;justify-content:space-between;align-items:center">
                <span><strong>${esc(s.last_name)}, ${esc(s.first_name)}</strong></span>
                <span style="color:var(--aa-text-muted)">${esc(s.admission_number)} &nbsp;·&nbsp; ${esc(s.class_name || 'No class')}</span>
            </div>`).join('');

        drop.querySelectorAll('.rt-suggestion-item').forEach(item => {
            item.addEventListener('mouseenter', () => item.style.background = 'var(--aa-surface-2)');
            item.addEventListener('mouseleave', () => item.style.background = '');
            item.addEventListener('click', () => {
                const student = students.find(s => String(s.id) === item.dataset.id);
                _state[stateKey].studentId = item.dataset.id;
                const inp = document.getElementById(inputId);
                if (inp && student) inp.value = `${student.last_name}, ${student.first_name} (${student.admission_number})`;
                drop.style.display = 'none';
            });
        });
        drop.style.display = 'block';
    }

    // ─── Per-student: Academic Report tab ─────────────────────────────────────

    async function generateAcademicReport() {
        const sid = _state.ac.studentId;
        if (!sid) return _tabAlert('panel-academic', 'Please search for and select a student first.');

        const yearId = document.getElementById('acYearFilter')?.value;
        const termId = document.getElementById('acTermFilter')?.value;
        const p = new URLSearchParams({ student_id: sid });
        if (yearId) p.set('academic_year_id', yearId);
        if (termId) p.set('term_id', termId);

        const btn = document.getElementById('generateAcBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
        try {
            const res = await apiFetch(`/api/reports/academic?${p}`);
            if (!res || !res.ok) throw new Error('Failed to load academic report');
            const data = await res.json();
            const rows = data.results || data.rows || (Array.isArray(data) ? data : []);
            _state.ac.data = rows;
            _renderAcademicReport(rows);
        } catch (err) {
            _tabAlert('panel-academic', err.message || 'Failed to load report.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Generate Report'; }
        }
    }

    function _renderAcademicReport(rows) {
        const results  = document.getElementById('acResults');
        const placeholder = document.getElementById('acPlaceholder');

        if (!rows.length) {
            if (results) results.hidden = true;
            if (placeholder) {
                placeholder.innerHTML = '<h3>No results found</h3><p>No academic results are recorded for this student with the selected filters.</p>';
            }
            return;
        }

        // Summary stats
        const total   = rows.length;
        const passed  = rows.filter(r => parseFloat(r.percentage) >= 50).length;
        const failed  = total - passed;
        const avg     = (rows.reduce((s, r) => s + parseFloat(r.percentage || 0), 0) / total).toFixed(1);

        setText('acOverallPct', `${avg}%`);
        setText('acTotalSubj', total);
        setText('acPassed', passed);
        setText('acFailed', failed);

        // Table rows
        const tbody = document.getElementById('acTableBody');
        if (tbody) {
            tbody.innerHTML = rows.map(r => {
                const pct = parseFloat(r.percentage || 0);
                const gradeClass = pct >= 75 ? 'grade-a' : pct >= 50 ? 'grade-b' : pct >= 30 ? 'grade-c' : 'grade-f';
                return `<tr>
                    <td>${esc(r.subject_name)}</td>
                    <td>${pct.toFixed(1)}%</td>
                    <td><span class="grade-badge ${gradeClass}">${esc(r.grade_classification)}</span></td>
                    <td>${esc(r.remarks || '—')}</td>
                </tr>`;
            }).join('');
        }

        if (placeholder) placeholder.hidden = true;
        if (results) results.hidden = false;
    }

    // ─── Per-student: Transcript tab ──────────────────────────────────────────

    async function generateTranscript() {
        const sid = _state.ts.studentId;
        if (!sid) return _tabAlert('panel-transcript', 'Please search for and select a student first.');

        const yearId = document.getElementById('tsYearFilter')?.value;
        const p = yearId ? `?academic_year_id=${yearId}` : '';

        const btn = document.getElementById('generateTsBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
        try {
            const res = await apiFetch(`/api/results/transcript/${sid}${p}`);
            if (!res || !res.ok) throw new Error('Failed to load transcript');
            const data = await res.json();
            _state.ts.data = data;
            _renderTranscript(data);
        } catch (err) {
            _tabAlert('panel-transcript', err.message || 'Failed to load transcript.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Load Transcript'; }
        }
    }

    function _renderTranscript(data) {
        const card      = document.getElementById('tsCard');
        const placeholder = document.getElementById('tsPlaceholder');
        const exportBar = document.getElementById('tsExportBar');
        if (!card) return;

        const { student, terms } = data;

        if (!terms || !terms.length) {
            card.innerHTML = `<p class="rt-placeholder"><strong>No results recorded</strong><br>No academic results found for this student.</p>`;
            card.hidden = false;
            if (placeholder) placeholder.hidden = true;
            if (exportBar) exportBar.style.display = 'none';
            return;
        }

        const termBlocks = terms.map(t => `
            <div style="margin-bottom:24px">
                <h3 style="font-size:14px;font-weight:700;color:var(--aa-text);margin-bottom:10px">
                    ${esc(t.term_name)} — ${esc(t.year_label)}
                </h3>
                <div class="rt-table-wrap">
                    <table class="rt-table">
                        <thead><tr>
                            <th>Subject</th><th>Mid-Term</th><th>Final Term</th>
                            <th>Final Mark</th><th>Grade</th><th>Position</th><th>Remarks</th>
                        </tr></thead>
                        <tbody>
                            ${(t.subjects || []).map(r => {
                                const midVal = (r.mid_term_score != null) ? r.mid_term_score : (r.test_mark != null ? r.test_mark : '—');
                                const finVal = (r.final_term_score != null) ? r.final_term_score : (r.exam_mark != null ? r.exam_mark : '—');
                                const finalMark = (r.final_mark != null) ? `${parseFloat(r.final_mark).toFixed(1)}%` : (r.percentage != null && r.status === 'COMPLETE' ? `${parseFloat(r.percentage).toFixed(1)}%` : '—');
                                return `<tr>
                                    <td><strong>${esc(r.subject_name)}</strong></td>
                                    <td>${midVal}</td>
                                    <td>${finVal}</td>
                                    <td style="font-weight:700">${finalMark}</td>
                                    <td><span class="aa-grade-pill">${esc(r.grade_classification || 'Pending')}</span></td>
                                    <td>${r.class_position || '—'}</td>
                                    <td>${esc(r.remarks || r.teacher_comment || '')}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <p style="font-size:12.5px;color:var(--aa-text-muted);margin-top:8px;text-align:right">
                    Term Average: <strong>${t.average_percentage}%</strong>
                </p>
            </div>`).join('');

        const schoolName = data.school_name || 'Admin Assist School';
        const studentName = student ? `${esc(student.first_name)} ${esc(student.last_name)}` : '';
        const admNo = student ? `<span style="color:var(--aa-text-muted)"> · ${esc(student.admission_number)}</span>` : '';
        const className = student && student.class_name ? `<span class="aa-badge" style="margin-left:8px;background:var(--aa-blue);color:#fff">${esc(student.class_name)}</span>` : '';

        card.innerHTML = `
            <div style="margin-bottom:16px;padding:16px 20px;background:linear-gradient(135deg, #1E3A8A 0%, #172554 100%);border-radius:10px;color:#fff;">
                <div style="font-size:11px;font-weight:700;color:#FCD34D;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">
                    🏛️ ${esc(schoolName)} — Official Transcript
                </div>
                <h2 style="font-size:16px;font-weight:700;color:#fff;margin:0 0 6px">
                    ${studentName}${admNo} ${className}
                </h2>
                <div style="font-size:12px;opacity:.85">
                    Class: <strong>${esc((student && student.class_name) || 'Not assigned')}</strong> &nbsp;·&nbsp;
                    Date: ${new Date(data.generated_at || Date.now()).toLocaleDateString('en-GB')}
                </div>
            </div>
            ${termBlocks}`;
        card.hidden = false;
        if (placeholder) placeholder.hidden = true;
        if (exportBar) exportBar.style.display = 'flex';
    }

    function downloadTranscriptPDF(data) {
        if (!window.jspdf) { alert('PDF library not loaded.'); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const margin = 12;
        const { student, terms } = data;
        const schoolName = data.school_name || 'Admin Assist School';
        const className = (student && student.class_name) || 'Not assigned';

        doc.setFillColor(30, 58, 138);
        doc.rect(0, 0, pageW, 26, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
        doc.text(schoolName, margin, 10);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.text('OFFICIAL ACADEMIC TRANSCRIPT', margin, 16);
        if (student) doc.text(`${student.first_name} ${student.last_name} (${student.admission_number}) — Class: ${className}`, margin, 22);
        doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, pageW - margin, 22, { align: 'right' });

        let y = 32;
        (terms || []).forEach(t => {
            doc.setTextColor(0);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
            doc.text(`${t.term_name} — ${t.year_label}`, margin, y); y += 5;
            doc.autoTable({
                startY: y,
                margin: { left: margin, right: margin },
                head: [['Subject', 'Mid-Term', 'Final Term', 'Final Mark', 'Grade', 'Pos', 'Remarks']],
                body: (t.subjects || []).map(r => [
                    r.subject_name,
                    r.mid_term_score != null ? r.mid_term_score : (r.test_mark != null ? r.test_mark : '—'),
                    r.final_term_score != null ? r.final_term_score : (r.exam_mark != null ? r.exam_mark : '—'),
                    r.final_mark != null ? `${parseFloat(r.final_mark).toFixed(1)}%` : (r.percentage != null && r.status === 'COMPLETE' ? `${parseFloat(r.percentage).toFixed(1)}%` : '—'),
                    r.grade_classification || 'Pending',
                    r.class_position || '—',
                    r.remarks || r.teacher_comment || ''
                ]),
                styles: { fontSize: 7.5, cellPadding: 2 },
                headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [249, 250, 251] },
            });
            y = doc.lastAutoTable.finalY + 8;
        });

        const name = student ? `${student.last_name}_${student.first_name}` : 'transcript';
        doc.save(`transcript_${name}.pdf`);
    }

    function downloadTranscriptCSV(data) {
        const { student, terms } = data;
        const schoolName = data.school_name || 'Admin Assist School';
        const rows = [];
        rows.push(['OFFICIAL ACADEMIC TRANSCRIPT']);
        rows.push(['School', `"${schoolName.replace(/"/g, '""')}"`]);
        rows.push(['Student', student ? `"${student.first_name} ${student.last_name}"` : '""']);
        rows.push(['Admission No', student ? `"${student.admission_number}"` : '""']);
        rows.push(['Class', student ? `"${student.class_name || 'Not assigned'}"` : '""']);
        rows.push([]);
        rows.push(['Term,Year,Subject,Mid-Term,Final Term,Final Mark,Grade,Position,Remarks']);
        (terms || []).forEach(t => {
            (t.subjects || []).forEach(r => {
                rows.push([
                    t.term_name, t.year_label, r.subject_name,
                    r.mid_term_score != null ? r.mid_term_score : (r.test_mark != null ? r.test_mark : ''),
                    r.final_term_score != null ? r.final_term_score : (r.exam_mark != null ? r.exam_mark : ''),
                    r.final_mark != null ? `${parseFloat(r.final_mark).toFixed(1)}%` : (r.percentage != null && r.status === 'COMPLETE' ? `${parseFloat(r.percentage).toFixed(1)}%` : ''),
                    r.grade_classification || 'Pending',
                    r.class_position || '',
                    r.remarks || r.teacher_comment || ''
                ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
            });
        });
        const name = student ? `${student.last_name}_${student.first_name}` : 'transcript';
        triggerBlobDownload(rows.join('\n'), 'text/csv', `transcript_${name}.csv`);
    }

    // ─── Per-student: Attendance tab ──────────────────────────────────────────

    async function generateAttendanceReport() {
        const sid = _state.att.studentId;
        if (!sid) return _tabAlert('panel-attendance', 'Please search for and select a student first.');

        const yearId = document.getElementById('attYearFilter')?.value;
        const p = yearId ? `?academic_year_id=${yearId}` : '';

        const btn = document.getElementById('generateAttBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
        try {
            const res = await apiFetch(`/api/reports/student-attendance/${sid}${p}`);
            if (!res || !res.ok) throw new Error('Failed to load attendance data');
            const data = await res.json();
            _renderAttendanceReport(data);
        } catch (err) {
            _tabAlert('panel-attendance', err.message || 'Failed to load attendance.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Load Attendance'; }
        }
    }

    function _renderAttendanceReport(data) {
        const results     = document.getElementById('attResults');
        const placeholder = document.getElementById('attPlaceholder');

        setText('attTotal',   data.total_sessions || 0);
        setText('attPresent', data.present        || 0);
        setText('attAbsent',  data.absent         || 0);
        setText('attLate',    data.late           || 0);
        setText('attRate',    `${data.attendance_rate || 0}%`);

        if (placeholder) placeholder.hidden = true;
        if (results) results.hidden = false;
    }

    // ─── Per-student: shared alert helper ─────────────────────────────────────

    function _tabAlert(panelId, msg) {
        // Show an inline message in the panel's placeholder area instead of alert()
        const panel = document.getElementById(panelId);
        if (!panel) return;
        const placeholder = panel.querySelector('[id$="Placeholder"]');
        if (placeholder) {
            placeholder.innerHTML = `<h3>Action needed</h3><p>${esc(msg)}</p>`;
            placeholder.hidden = false;
        }
    }

})();
