// student-transcript.js — Sprint 5 (proper PDF/CSV export via jsPDF, no window.print)
// Depends on: auth.js (apiFetch), auth-guard.js, navigation.js
// CDN required: jsPDF 2.5.x + jspdf-autotable 3.8.x (loaded in HTML)

(function () {
    'use strict';

    let searchTimer  = null;
    let currentData  = null;   // stores the last loaded transcript data object

    // ── Role detection ───────────────────────────────────────────────────────
    let _userRole = 'user';
    let _userStudentId = null;
    try {
        var _u = JSON.parse(localStorage.getItem('user'));
        _userRole = (_u && _u.role) ? _u.role : 'user';
        _userStudentId = (_u && _u.student_id) ? _u.student_id : null;
    } catch (e) {}

    document.addEventListener('DOMContentLoaded', async () => {
        await loadYears();

        if (_userRole === 'user') {
            // Student/parent account: hide search bar, auto-load own transcript
            var searchSection = document.getElementById('studentSearch')?.closest('.search-section') ||
                                document.getElementById('studentSearch')?.parentElement;
            if (searchSection) searchSection.style.display = 'none';
            var searchInput = document.getElementById('studentSearch');
            if (searchInput) searchInput.style.display = 'none';

            // Try using student_id stored in user session
            if (_userStudentId) {
                await loadTranscript(_userStudentId);
            } else {
                // Fallback: call getMe to get student_id
                try {
                    const meRes = await apiFetch('/api/users/me');
                    if (meRes && meRes.ok) {
                        const meData = await meRes.json();
                        const sid = (meData.user || meData).student_id;
                        if (sid) {
                            await loadTranscript(sid);
                        }
                    }
                } catch (err) {
                    console.warn('student-transcript: could not resolve student_id from /me:', err.message);
                }
            }
        } else {
            // Staff / admin: expose search and check URL params
            bindEvents();
            const urlParams = new URLSearchParams(window.location.search);
            const sid = urlParams.get('id') || urlParams.get('studentId');
            if (sid) {
                loadTranscript(sid);
            }
        }
    });

    // ─── Year filter ─────────────────────────────────────────────────────────

    async function loadYears() {
        try {
            const res = await apiFetch('/api/attendance/academic-years');
            if (!res || !res.ok) return;
            const years = await res.json();
            const sel = document.getElementById('yearFilter');
            sel.innerHTML =
                `<option value="">All Years</option>` +
                years.map(y => `<option value="${y.id}">${esc(y.year_label)}</option>`).join('');
        } catch (err) {
            console.error('loadYears:', err);
        }
    }

    // ─── Event binding ────────────────────────────────────────────────────────

    function bindEvents() {
        const input = document.getElementById('studentSearch');

        input.addEventListener('input', () => {
            clearTimeout(searchTimer);
            const q = input.value.trim();
            if (q.length < 2) { hideSuggestions(); return; }
            searchTimer = setTimeout(() => searchStudents(q), 300);
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Escape') hideSuggestions();
        });

        document.addEventListener('click', e => {
            if (!document.getElementById('suggestions').contains(e.target) && e.target !== input) {
                hideSuggestions();
            }
        });

        document.getElementById('yearFilter').addEventListener('change', () => {
            const studentId = document.getElementById('transcriptCard').dataset.studentId;
            if (studentId) loadTranscript(studentId);
        });

        document.getElementById('downloadPdfBtn').addEventListener('click', () => {
            if (currentData) downloadPDF(currentData);
        });

        document.getElementById('downloadCsvBtn').addEventListener('click', () => {
            if (currentData) downloadCSV(currentData);
        });
    }

    // ─── Student search ───────────────────────────────────────────────────────

    async function searchStudents(q) {
        try {
            const res = await apiFetch(`/api/search/students?q=${encodeURIComponent(q)}`);
            if (!res || !res.ok) return;
            const data = await res.json();
            showSuggestions(data.students || []);
        } catch (err) {
            console.error('searchStudents:', err);
        }
    }

    function showSuggestions(students) {
        const box  = document.getElementById('suggestions');
        const list = document.getElementById('suggestionsList');

        if (!students.length) {
            list.innerHTML = `<div style="padding:.75rem 1rem;color:var(--aa-text-muted);font-size:.875rem">No students found.</div>`;
            box.style.display = 'block';
            return;
        }

        list.innerHTML = students.map(s => `
      <div class="aa-suggestion-item" data-id="${s.id}"
           style="padding:.65rem 1rem;cursor:pointer;border-bottom:1px solid var(--aa-border);
                  font-size:.875rem;display:flex;justify-content:space-between;align-items:center">
        <span><strong>${esc(s.last_name)}, ${esc(s.first_name)}</strong></span>
        <span style="color:var(--aa-text-muted)">${esc(s.admission_number)} &nbsp;·&nbsp; ${esc(s.class_name || 'No class')}</span>
      </div>`).join('');

        list.querySelectorAll('.aa-suggestion-item').forEach(item => {
            item.addEventListener('mouseenter', () => item.style.background = 'var(--aa-bg)');
            item.addEventListener('mouseleave', () => item.style.background = '');
            item.addEventListener('click', () => {
                const student = students.find(s => String(s.id) === item.dataset.id);
                selectStudent(item.dataset.id, student);
            });
        });

        box.style.display = 'block';
    }

    function hideSuggestions() {
        document.getElementById('suggestions').style.display = 'none';
    }

    function selectStudent(id, student) {
        hideSuggestions();
        document.getElementById('studentSearch').value = student
            ? `${student.last_name}, ${student.first_name} (${student.admission_number})`
            : id;
        loadTranscript(id);
    }

    // ─── Load transcript from API ─────────────────────────────────────────────

    async function loadTranscript(studentId) {
        const yearId = document.getElementById('yearFilter').value;
        const params = yearId ? `?academic_year_id=${yearId}` : '';

        try {
            const res = await apiFetch(`/api/results/transcript/${studentId}${params}`);
            if (!res || !res.ok) throw new Error('Unable to load transcript');
            const data = await res.json();
            currentData = data;
            renderTranscript(data, studentId);
        } catch (err) {
            if (window.AANotify) window.AANotify.error(err.message || 'Failed to load transcript.');
            else alert(err.message || 'Failed to load transcript.');
        }
    }

    // ─── Render transcript to page ────────────────────────────────────────────

    function renderTranscript(data, studentId) {
        const { student, terms, attendance_summary } = data;
        const card    = document.getElementById('transcriptCard');
        const blank   = document.getElementById('placeholderState');
        const exports = document.getElementById('exportBar');

        card.dataset.studentId = studentId;

        if (!terms.length) {
            card.innerHTML = `<p class="aa-empty-state" style="padding:2rem">
                <span style="font-size:1rem;font-weight:600">No results recorded</span><br>
                <span style="color:var(--aa-text-muted)">No academic results found for this student.</span>
            </p>`;
            card.hidden = false;
            blank.hidden = true;
            exports.hidden = true;
            return;
        }

        // Attendance summary block
        const attHtml = attendance_summary
            ? `<div class="transcript-term" style="margin-bottom:1.25rem">
                 <h3>🗓 Attendance Summary</h3>
                 <div class="att-summary-grid">
                   <div class="att-stat"><span>Total Sessions</span><strong>${attendance_summary.total_sessions}</strong></div>
                   <div class="att-stat"><span>Present</span><strong style="color:#16a34a">${attendance_summary.present}</strong></div>
                   <div class="att-stat"><span>Absent</span><strong style="color:#dc2626">${attendance_summary.absent}</strong></div>
                   <div class="att-stat"><span>Late</span><strong style="color:#d97706">${attendance_summary.late}</strong></div>
                   <div class="att-stat"><span>Excused</span><strong style="color:#6366f1">${attendance_summary.excused}</strong></div>
                   <div class="att-stat"><span>Rate</span><strong>${attendance_summary.attendance_rate}%</strong></div>
                 </div>
               </div>`
            : '';

        const termBlocks = terms.map(t => `
      <div class="transcript-term">
        <h3>${esc(t.term_name)} — ${esc(t.year_label)}</h3>
        <div class="aa-table-wrap">
          <table class="aa-table">
            <thead>
              <tr><th>Subject</th><th>Mid-Term</th><th>Final Term</th><th>Final Mark</th><th>Grade</th><th>Position</th><th>Remarks</th></tr>
            </thead>
            <tbody>
              ${t.subjects.map(r => {
                const midVal = (r.mid_term_score != null) ? r.mid_term_score : (r.test_mark != null ? r.test_mark : '—');
                const finVal = (r.final_term_score != null) ? r.final_term_score : (r.exam_mark != null ? r.exam_mark : '—');
                const finalMark = (r.final_mark != null)
                    ? `${parseFloat(r.final_mark).toFixed(1)}%`
                    : (r.percentage != null && r.status === 'COMPLETE' ? `${parseFloat(r.percentage).toFixed(1)}%` : '—');
                return `
                <tr>
                  <td><strong>${esc(r.subject_name)}</strong></td>
                  <td>${midVal}</td>
                  <td>${finVal}</td>
                  <td style="font-weight:700">${finalMark}</td>
                  <td><span class="aa-grade-pill">${esc(r.grade_classification || 'Pending')}</span></td>
                  <td>${r.class_position || '—'}</td>
                  <td>${esc(r.remarks || r.teacher_comment || '—')}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="transcript-avg">Term Average: <strong>${t.average_percentage}%</strong></div>
      </div>`).join('');

        const schoolName = data.school_name || 'Admin Assist School';
        const className = student.class_name || (student.grade ? `${student.grade} ${student.section || ''}`.trim() : 'Not assigned');

        card.innerHTML = `
      <div class="official-transcript-header">
        <div class="school-crest-badge">
          <span>🏛️</span> Official Academic Document
        </div>
        <h1 class="transcript-school-title">${esc(schoolName)}</h1>
        <div class="transcript-doc-subtitle">Official Student Academic Transcript</div>

        <div class="transcript-meta-grid">
          <div class="transcript-meta-item">
            <span class="transcript-meta-label">Student Name</span>
            <span class="transcript-meta-value">${esc(student.first_name)} ${esc(student.last_name)}</span>
          </div>
          <div class="transcript-meta-item">
            <span class="transcript-meta-label">Class</span>
            <span class="transcript-meta-value"><span class="transcript-class-pill">${esc(className)}</span></span>
          </div>
          <div class="transcript-meta-item">
            <span class="transcript-meta-label">Admission Number</span>
            <span class="transcript-meta-value" style="font-family:monospace">${esc(student.admission_number)}</span>
          </div>
          <div class="transcript-meta-item">
            <span class="transcript-meta-label">Gender / Status</span>
            <span class="transcript-meta-value">${esc(student.gender || '—')} &nbsp;·&nbsp; ${esc(student.status || 'Active')}</span>
          </div>
          <div class="transcript-meta-item">
            <span class="transcript-meta-label">Date Issued</span>
            <span class="transcript-meta-value">${new Date(data.generated_at || Date.now()).toLocaleDateString('en-GB')}</span>
          </div>
        </div>
      </div>
      ${attHtml}
      ${termBlocks}
      <div class="transcript-footer-cert">
        <span>✓ Verified Official Transcript — Generated by Admin Assist School Management System</span>
        <span>School Stamp / Signature: ______________________</span>
      </div>`;

        card.hidden   = false;
        blank.hidden  = true;
        exports.hidden = false;
    }

    // ─── PDF Export (jsPDF + AutoTable) ──────────────────────────────────────

    function downloadPDF(data) {
        if (!window.jspdf) {
            if (window.AANotify) window.AANotify.warning('PDF library not loaded. Please check your internet connection.');
            else alert('PDF library not loaded. Please check your internet connection.');
            return;
        }

        const { jsPDF }      = window.jspdf;
        const { student, terms, attendance_summary, school_name, generated_at } = data;

        const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW  = doc.internal.pageSize.getWidth();
        const pageH  = doc.internal.pageSize.getHeight();
        const margin = 14;
        let y = 0;

        // ── Header banner ────────────────────────────────────────────────────
        doc.setFillColor(30, 58, 138);
        doc.rect(0, 0, pageW, 34, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(school_name || 'Admin Assist School', pageW / 2, 12, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('OFFICIAL ACADEMIC TRANSCRIPT', pageW / 2, 21, { align: 'center' });

        doc.setFontSize(7);
        doc.text(`Generated: ${new Date(generated_at).toLocaleDateString('en-GB')}`, pageW / 2, 29, { align: 'center' });

        y = 40;
        doc.setTextColor(0, 0, 0);

        // ── Student info box ─────────────────────────────────────────────────
        doc.setFillColor(243, 244, 246);
        doc.roundedRect(margin, y, pageW - margin * 2, 28, 2, 2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(`${student.first_name} ${student.last_name}`, margin + 4, y + 9);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Admission No: ${student.admission_number}`, margin + 4, y + 17);
        doc.text(`Class: ${student.class_name || 'Not assigned'}`, margin + 4, y + 24);

        // ── Attendance summary (right column of info box) ─────────────────────
        if (attendance_summary) {
            const ax = pageW / 2 + 8;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('Attendance Summary', ax, y + 9);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.text(`Total Sessions: ${attendance_summary.total_sessions}`, ax, y + 16);
            doc.text(
                `Present: ${attendance_summary.present}   Absent: ${attendance_summary.absent}   Late: ${attendance_summary.late}`,
                ax, y + 22
            );
            doc.text(`Attendance Rate: ${attendance_summary.attendance_rate}%`, ax, y + 28);
        }

        y += 34;

        // ── Term tables ───────────────────────────────────────────────────────
        for (const term of terms) {
            if (y > pageH - 50) { doc.addPage(); y = margin; }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(30, 58, 138);
            doc.text(`${term.term_name} — ${term.year_label}`, margin, y);
            y += 2;
            doc.setTextColor(0, 0, 0);

            doc.autoTable({
                startY        : y,
                margin        : { left: margin, right: margin },
                head          : [['Subject', 'Mid-Term', 'Final Term', 'Final Mark', 'Grade', 'Position', 'Remarks']],
                body          : term.subjects.map(s => [
                    s.subject_name,
                    s.mid_term_score != null ? s.mid_term_score : (s.test_mark != null ? s.test_mark : '—'),
                    s.final_term_score != null ? s.final_term_score : (s.exam_mark != null ? s.exam_mark : '—'),
                    s.final_mark != null ? `${parseFloat(s.final_mark).toFixed(1)}%` : (s.percentage != null && s.status === 'COMPLETE' ? `${parseFloat(s.percentage).toFixed(1)}%` : '—'),
                    s.grade_classification || 'Pending',
                    s.class_position || '—',
                    s.remarks || s.teacher_comment || '—',
                ]),
                foot          : [[`Term Average`, '', '', `${term.average_percentage}%`, '', '', '']],
                styles        : { fontSize: 7.5, cellPadding: 2 },
                headStyles    : { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
                footStyles    : { fillColor: [229, 231, 235], textColor: [50, 50, 50], fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [249, 250, 251] },
                columnStyles  : { 0: { cellWidth: 42 }, 6: { cellWidth: 30 } },
            });

            y = doc.lastAutoTable.finalY + 10;
        }

        // ── Footer on every page ──────────────────────────────────────────────
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 6, { align: 'right' });
            doc.text('This is an official document. Any alterations render it invalid.', margin, pageH - 6);
        }

        const filename = `transcript_${student.last_name}_${student.first_name}_${new Date().getFullYear()}.pdf`;
        doc.save(filename);
    }

    // ─── CSV Export ───────────────────────────────────────────────────────────

    function downloadCSV(data) {
        const { student, terms, attendance_summary } = data;
        const rows = [];

        rows.push(['OFFICIAL ACADEMIC TRANSCRIPT']);
        rows.push(['School Name',  data.school_name || 'Admin Assist School']);
        rows.push([]);
        rows.push(['Student Name', `${student.first_name} ${student.last_name}`]);
        rows.push(['Admission No', student.admission_number]);
        rows.push(['Class',        student.class_name || 'Not assigned']);
        rows.push(['Generated',    new Date(data.generated_at).toLocaleDateString('en-GB')]);
        rows.push([]);

        if (attendance_summary) {
            rows.push(['ATTENDANCE SUMMARY']);
            rows.push(['Total Sessions', 'Present', 'Absent', 'Late', 'Excused', 'Rate (%)']);
            rows.push([
                attendance_summary.total_sessions,
                attendance_summary.present,
                attendance_summary.absent,
                attendance_summary.late,
                attendance_summary.excused,
                attendance_summary.attendance_rate,
            ]);
            rows.push([]);
        }

        rows.push(['ACADEMIC RESULTS']);

        for (const term of terms) {
            rows.push([]);
            rows.push([`${term.term_name} — ${term.year_label}`]);
            rows.push(['Subject', 'Mid-Term', 'Final Term', 'Final Mark', 'Grade', 'Position', 'Remarks']);
            for (const s of term.subjects) {
                rows.push([
                    s.subject_name,
                    s.mid_term_score != null ? s.mid_term_score : (s.test_mark != null ? s.test_mark : ''),
                    s.final_term_score != null ? s.final_term_score : (s.exam_mark != null ? s.exam_mark : ''),
                    s.final_mark != null ? `${parseFloat(s.final_mark).toFixed(1)}%` : (s.percentage != null && s.status === 'COMPLETE' ? `${parseFloat(s.percentage).toFixed(1)}%` : ''),
                    s.grade_classification || 'Pending',
                    s.class_position || '',
                    s.remarks || s.teacher_comment || '',
                ]);
            }
            rows.push(['Term Average', '', '', `${term.average_percentage}%`, '', '', '']);
        }

        const csvContent = rows.map(row =>
            row.map(cell => {
                const s = String(cell ?? '');
                return s.includes(',') || s.includes('"') || s.includes('\n')
                    ? `"${s.replace(/"/g, '""')}"`
                    : s;
            }).join(',')
        ).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `transcript_${student.last_name}_${student.first_name}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ─── Utility ─────────────────────────────────────────────────────────────

    const esc = v => String(v ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');

})();