// reports-dashboard.js — Sprint 5 (full CSV + PDF export, live KPIs)
// Depends on: auth.js (apiFetch), navigation.js, jsPDF + jspdf-autotable CDN

(function () {
    'use strict';

    // ─── Bootstrap ────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', async () => {
        await Promise.all([loadMeta(), loadSummary()]);
        bindEvents();
    });

    // ─── Meta data (dropdowns) ────────────────────────────────────────────────

    async function loadMeta() {
        try {
            const [classRes, termRes] = await Promise.all([
                apiFetch('/api/attendance/classes'),
                apiFetch('/api/attendance/academic-years'),
            ]);

            if (classRes && classRes.ok) {
                const classes = await classRes.json();
                populateSelect('filterClass', classes, 'id', c =>
                    c.class_name || `${c.grade_level}${c.stream ? ' ' + c.stream : ''}`, 'All Classes');
            }

            if (termRes && termRes.ok) {
                const years = await termRes.json();
                populateSelect('filterYear', years, 'id', y => y.year_label, 'All Years');
            }

            // Terms (all, not year-filtered here — user can choose)
            const allTermRes = await apiFetch('/api/attendance/terms');
            if (allTermRes && allTermRes.ok) {
                const terms = await allTermRes.json();
                populateSelect('filterTerm', terms, 'id', t =>
                    `${t.term_name} (${t.year_label})`, 'All Terms');
            }
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
        // Enrollment
        btn('dlEnrollCsvBtn', () => downloadCSV(REPORTS.enrollment.endpoint, REPORTS.enrollment.csvFile));
        btn('dlEnrollPdfBtn', () => downloadPDF(REPORTS.enrollment.endpoint, REPORTS.enrollment.pdfFile, REPORTS.enrollment.pdf));

        // Attendance
        btn('dlAttendCsvBtn', () => downloadCSV(REPORTS.attendance.endpoint, REPORTS.attendance.csvFile));
        btn('dlAttendPdfBtn', () => downloadPDF(REPORTS.attendance.endpoint, REPORTS.attendance.pdfFile, REPORTS.attendance.pdf));

        // Academic
        btn('dlAcadCsvBtn', () => downloadCSV(REPORTS.academic.endpoint, REPORTS.academic.csvFile));
        btn('dlAcadPdfBtn', () => downloadPDF(REPORTS.academic.endpoint, REPORTS.academic.pdfFile, REPORTS.academic.pdf));

        // Top Performers
        btn('dlTopCsvBtn', () => downloadCSV(REPORTS.top.endpoint, REPORTS.top.csvFile));
        btn('dlTopPdfBtn', () => downloadPDF(REPORTS.top.endpoint, REPORTS.top.pdfFile, REPORTS.top.pdf));

        // Subject Performance
        btn('dlSubjCsvBtn', () => downloadCSV(REPORTS.subject.endpoint, REPORTS.subject.csvFile));
        btn('dlSubjPdfBtn', () => downloadPDF(REPORTS.subject.endpoint, REPORTS.subject.pdfFile, REPORTS.subject.pdf));

        // Students at Risk
        btn('dlRiskCsvBtn', () => downloadCSV(REPORTS.risk.endpoint, REPORTS.risk.csvFile));
        btn('dlRiskPdfBtn', () => downloadPDF(REPORTS.risk.endpoint, REPORTS.risk.pdfFile, REPORTS.risk.pdf));
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

})();
