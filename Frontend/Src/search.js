(function () {
  'use strict';

  let searchTimer = null;
  let lastQuery = '';
  let lastType = 'all';

  document.addEventListener('DOMContentLoaded', async () => {
    await loadClasses();
    bindEvents();
  });

  /* ─── Populate class filter dropdown ─────────────────────────────────────── */
  async function loadClasses() {
    try {
      const res = await apiFetch('/api/attendance/classes');
      if (!res || !res.ok) return;
      const classes = await res.json();
      const sel = document.getElementById('filterClass');
      if (!sel) return;
      sel.innerHTML = '<option value="">All Classes</option>' +
        classes.map(c =>
          `<option value="${c.id}">${_esc(c.class_name || `${c.grade_level}${c.stream ? ' ' + c.stream : ''}`)}</option>`
        ).join('');
    } catch (err) { console.error('loadClasses:', err); }
  }

  /* ─── Event wiring ───────────────────────────────────────────────────────── */
  function bindEvents() {
    const input = document.getElementById('searchInput');
    const btn = document.getElementById('searchBtn');
    const clearBtn = document.getElementById('clearFilters');

    // Live debounced search
    if (input) {
      input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        const q = input.value.trim();
        if (!q) { showPlaceholder(); return; }
        if (q.length < 2) return;
        searchTimer = setTimeout(() => runSearch(q), 320);
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          clearTimeout(searchTimer);
          const q = input.value.trim();
          if (q.length >= 1) runSearch(q);
        }
      });
    }

    if (btn) {
      btn.addEventListener('click', () => {
        const q = document.getElementById('searchInput')?.value.trim();
        if (q && q.length >= 1) runSearch(q);
      });
    }

    // Re-search when type radio changes
    document.querySelectorAll('input[name="searchType"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const q = document.getElementById('searchInput')?.value.trim();
        if (q && q.length >= 1) runSearch(q);
      });
    });

    // Filter changes — re-search
    ['filterClass', 'filterGender'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => {
        const q = document.getElementById('searchInput')?.value.trim();
        if (q && q.length >= 1) runSearch(q);
        else if (!q) doStudentSearch('');
      });
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const classEl = document.getElementById('filterClass');
        const genderEl = document.getElementById('filterGender');
        if (classEl) classEl.value = '';
        if (genderEl) genderEl.value = '';
        const q = document.getElementById('searchInput')?.value.trim();
        if (q && q.length >= 2) runSearch(q);
        else showPlaceholder();
      });
    }
  }

  /* ─── Core search ────────────────────────────────────────────────────────── */
  async function runSearch(q) {
    const type = document.querySelector('input[name="searchType"]:checked')?.value || 'all';
    const classId = document.getElementById('filterClass')?.value || '';
    const gender = document.getElementById('filterGender')?.value || '';

    // If any filter is active, use the dedicated student search
    if (classId || gender) {
      return doStudentSearch(q);
    }

    if (type === 'students') return doStudentSearch(q);

    // Global search
    showLoading();
    try {
      const p = new URLSearchParams({ q, type });
      const res = await apiFetch(`/api/search?${p}`);
      if (!res || !res.ok) throw new Error('Search failed');
      const data = await res.json();
      renderResults(data, q);
    } catch (err) {
      renderError(err.message || 'Search failed. Please try again.');
    }
  }

  async function doStudentSearch(q) {
    showLoading();
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    const classId = document.getElementById('filterClass')?.value;
    const gender = document.getElementById('filterGender')?.value;
    if (classId) p.set('class_id', classId);
    if (gender) p.set('gender', gender);

    try {
      const res = await apiFetch(`/api/search/students?${p}`);
      if (!res || !res.ok) throw new Error('Student search failed');
      const data = await res.json();
      renderResults({ students: data.students || [], classes: [], subjects: [] }, q || '(filtered)');
    } catch (err) {
      renderError(err.message || 'Search failed.');
    }
  }

  /* ─── Render helpers ─────────────────────────────────────────────────────── */
  function renderResults(data, q) {
    const area = document.getElementById('resultsArea');
    if (!area) return;
    const students = data.students || [];
    const classes = data.classes || [];
    const subjects = data.subjects || [];
    const total = students.length + classes.length + subjects.length;

    if (!total) {
      area.innerHTML = `
                <div class="aa-no-results">
                    <strong>No results for "${_esc(q)}"</strong>
                    <p>Try a different name, admission number, or subject code.</p>
                </div>`;
      return;
    }

    let html = `<p style="font-size:.82rem;color:#64748b;margin:0 0 1rem">
            <strong>${total}</strong> result${total !== 1 ? 's' : ''} for <strong>"${_esc(q)}"</strong>
        </p>`;

    if (students.length) {
      html += `
            <div class="aa-result-section">
                <h3>Students (${students.length})</h3>
                <div class="aa-card" style="padding:0;overflow:hidden">
                    <div class="aa-table-wrap">
                        <table class="aa-table">
                            <thead>
                                <tr>
                                    <th>Adm No</th><th>Name</th><th>Class</th>
                                    <th>Gender</th><th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${students.map(s => `
                                <tr>
                                    <td>${_esc(s.admission_number)}</td>
                                    <td><strong>${_esc(s.first_name)} ${_esc(s.last_name)}</strong></td>
                                    <td>${_esc(s.class_name || '—')}</td>
                                    <td>${_esc(s.gender || '—')}</td>
                                    <td class="aa-table-actions">
                                        <a class="aa-link-btn" href="student-transcript.html?studentId=${s.id}">Transcript</a>
                                        <a class="aa-link-btn" href="attendance-summary.html">Attendance</a>
                                    </td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }

    if (classes.length) {
      html += `
            <div class="aa-result-section">
                <h3>Classes (${classes.length})</h3>
                <div class="aa-card" style="padding:0;overflow:hidden">
                    <div class="aa-table-wrap">
                        <table class="aa-table">
                            <thead><tr><th>Class</th><th>Grade Level</th><th>Stream</th></tr></thead>
                            <tbody>
                                ${classes.map(c => `
                                <tr>
                                    <td><strong>${_esc(c.class_name)}</strong></td>
                                    <td>${_esc(c.grade_level)}</td>
                                    <td>${_esc(c.stream || '—')}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }

    if (subjects.length) {
      html += `
            <div class="aa-result-section">
                <h3>Subjects (${subjects.length})</h3>
                <div class="aa-card" style="padding:0;overflow:hidden">
                    <div class="aa-table-wrap">
                        <table class="aa-table">
                            <thead><tr><th>Code</th><th>Subject Name</th><th>Actions</th></tr></thead>
                            <tbody>
                                ${subjects.map(s => `
                                <tr>
                                    <td><strong>${_esc(s.subject_code)}</strong></td>
                                    <td>${_esc(s.subject_name)}</td>
                                    <td class="aa-table-actions">
                                        <a class="aa-link-btn" href="subject-management.html">Manage</a>
                                    </td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }

    area.innerHTML = html;
  }

  function showLoading() {
    const area = document.getElementById('resultsArea');
    if (area) area.innerHTML = `<p style="color:#94a3b8;font-size:.875rem;padding:1rem 0">Searching…</p>`;
  }

  function showPlaceholder() {
    const area = document.getElementById('resultsArea');
    if (area) area.innerHTML = `
            <div class="aa-empty-state">
                <h3>Start typing to search</h3>
                <p>Results appear live as you type. Minimum 2 characters.</p>
            </div>`;
  }

  function renderError(msg) {
    const area = document.getElementById('resultsArea');
    if (area) area.innerHTML = `<div class="aa-alert aa-alert-danger">${_esc(msg)}</div>`;
  }

  function _esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();