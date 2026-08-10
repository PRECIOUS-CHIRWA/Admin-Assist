/**
 * students.js — Admin Assist Students Page
 * Full CRUD: list, search, filter, paginate, edit, delete.
 * Depends on: auth.js (apiFetch)
 */

(function () {
  'use strict';

  const PAGE_SIZE = 10;
  let allStudents = [];
  let filtered = [];
  let currentPage = 1;
  let allClasses = [];
  let deleteTargetId = null;

  document.addEventListener('DOMContentLoaded', async function () {
    await Promise.all([loadClasses(), loadStudents()]);
    bindEvents();
  });

  /* ── Data loading ─────────────────────────────────────────────── */
  async function loadClasses() {
    try {
      const res = await apiFetch('/api/attendance/classes');
      if (!res || !res.ok) return;
      allClasses = await res.json();
      const sel = document.getElementById('classFilter');
      allClasses.forEach(function (c) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.class_name || (c.grade_level + (c.stream ? ' ' + c.stream : ''));
        sel.appendChild(opt);
      });
      // Also populate the modal class select
      const fClass = document.getElementById('fClass');
      allClasses.forEach(function (c) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.class_name || (c.grade_level + (c.stream ? ' ' + c.stream : ''));
        fClass.appendChild(opt);
      });
    } catch (err) { console.error('loadClasses:', err); }
  }

  async function loadStudents() {
    try {
      const res = await apiFetch('/api/search/students');
      if (!res || !res.ok) throw new Error('Failed');
      const data = await res.json();
      allStudents = data.students || [];
      applyFilters();
    } catch (err) {
      console.error('loadStudents:', err);
      document.getElementById('studentsBody').innerHTML =
        '<tr><td colspan="8" class="pg-empty-cell">Unable to load students. Please try again.</td></tr>';
    }
  }

  /* ── Filtering & pagination ────────────────────────────────────── */
  function applyFilters() {
    const q = (document.getElementById('studentSearch').value || '').toLowerCase().trim();
    const classId = document.getElementById('classFilter').value;
    const status = document.getElementById('statusFilter').value;

    filtered = allStudents.filter(function (s) {
      const name = (s.first_name + ' ' + s.last_name).toLowerCase();
      const adm = (s.admission_number || '').toLowerCase();
      const matchQ = !q || name.includes(q) || adm.includes(q);
      const matchC = !classId || String(s.class_id) === classId;
      const matchS = !status || (s.status || 'Active') === status;
      return matchQ && matchC && matchS;
    });

    currentPage = 1;
    renderTable();
    renderPagination();
  }

  function renderTable() {
    const tbody = document.getElementById('studentsBody');
    const start = (currentPage - 1) * PAGE_SIZE;
    const page = filtered.slice(start, start + PAGE_SIZE);
    const count = document.getElementById('studentCount');

    if (count) count.textContent = filtered.length + ' student' + (filtered.length !== 1 ? 's' : '');

    if (!page.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="pg-empty-cell">No students match your search.</td></tr>';
      return;
    }

    tbody.innerHTML = page.map(function (s, i) {
      const rowNum = start + i + 1;
      const name = _esc(s.first_name) + ' ' + _esc(s.last_name);
      const initials = (s.first_name[0] || '') + (s.last_name[0] || '');
      const cls = _esc(s.class_name || '—');
      const gender = _esc(s.gender || '—');
      const enrolled = _fmtDate(s.enrollment_date);
      const status = s.status || 'Active';
      const badgeCls = status === 'Active' ? 'badge-active' : status === 'Suspended' ? 'badge-suspended' : 'badge-inactive';

      return '<tr>' +
        '<td class="row-num">' + rowNum + '</td>' +
        '<td><div class="pg-student-cell">' +
        '<div class="pg-student-avatar">' + _esc(initials.toUpperCase()) + '</div>' +
        '<div><div class="pg-student-name">' + name + '</div></div>' +
        '</div></td>' +
        '<td>' + _esc(s.admission_number || '—') + '</td>' +
        '<td>' + cls + '</td>' +
        '<td>' + gender + '</td>' +
        '<td>' + enrolled + '</td>' +
        '<td><span class="' + badgeCls + '">' + _esc(status) + '</span></td>' +
        '<td class="pg-actions-cell">' +
        '<button class="pg-action-btn" data-view="' + s.id + '">View</button>' +
        '<button class="pg-action-btn pg-action-btn-danger" data-del="' + s.id + '" data-name="' + name + '">Remove</button>' +
        '</td>' +
        '</tr>';
    }).join('');

    tbody.querySelectorAll('[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () { openViewModal(btn.dataset.view); });
    });
    tbody.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () { openDeleteModal(btn.dataset.del, btn.dataset.name); });
    });
  }

  function renderPagination() {
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const info = document.getElementById('paginationInfo');
    const btns = document.getElementById('paginationBtns');
    if (!info || !btns) return;

    const start = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
    const end = Math.min(currentPage * PAGE_SIZE, filtered.length);
    info.textContent = 'Showing ' + start + '–' + end + ' of ' + filtered.length;

    let html = '<button class="pg-page-btn" id="prevPage" ' + (currentPage <= 1 ? 'disabled' : '') + '>‹</button>';
    for (let p = 1; p <= totalPages; p++) {
      if (totalPages > 7 && p > 3 && p < totalPages - 1 && Math.abs(p - currentPage) > 1) {
        if (p === 4 || p === totalPages - 2) html += '<span class="pg-page-ellipsis">…</span>';
        continue;
      }
      html += '<button class="pg-page-btn' + (p === currentPage ? ' pg-active' : '') + '" data-pg="' + p + '">' + p + '</button>';
    }
    html += '<button class="pg-page-btn" id="nextPage" ' + (currentPage >= totalPages ? 'disabled' : '') + '>›</button>';
    btns.innerHTML = html;

    btns.querySelectorAll('[data-pg]').forEach(function (btn) {
      btn.addEventListener('click', function () { currentPage = parseInt(btn.dataset.pg); renderTable(); renderPagination(); });
    });
    const prev = btns.querySelector('#prevPage');
    const next = btns.querySelector('#nextPage');
    if (prev) prev.addEventListener('click', function () { if (currentPage > 1) { currentPage--; renderTable(); renderPagination(); } });
    if (next) next.addEventListener('click', function () { if (currentPage < totalPages) { currentPage++; renderTable(); renderPagination(); } });
  }

  /* ── View / Edit Modal ─────────────────────────────────────────── */
  async function openViewModal(id) {
    const student = allStudents.find(function (s) { return String(s.id) === String(id); });
    if (!student) return;

    document.getElementById('modalTitle').textContent = 'Edit Student';
    document.getElementById('editStudentId').value = student.id;
    document.getElementById('fFirstName').value = student.first_name || '';
    document.getElementById('fLastName').value = student.last_name || '';
    document.getElementById('fAdmNo').value = student.admission_number || '';
    document.getElementById('fGender').value = student.gender || '';
    document.getElementById('fDOB').value = student.date_of_birth ? student.date_of_birth.split('T')[0] : '';
    document.getElementById('fClass').value = student.class_id || '';
    document.getElementById('fGuardian').value = student.guardian_name || '';
    document.getElementById('fGuardianPhone').value = student.guardian_phone || '';
    document.getElementById('fStatus').value = student.status || 'Active';
    document.getElementById('studentModal').hidden = false;
  }

  async function saveStudent() {
    const id = document.getElementById('editStudentId').value;
    const btn = document.getElementById('saveStudentBtn');

    const payload = {
      first_name: document.getElementById('fFirstName').value.trim(),
      last_name: document.getElementById('fLastName').value.trim(),
      admission_number: document.getElementById('fAdmNo').value.trim(),
      gender: document.getElementById('fGender').value,
      date_of_birth: document.getElementById('fDOB').value || null,
      class_id: document.getElementById('fClass').value || null,
      guardian_name: document.getElementById('fGuardian').value.trim() || null,
      guardian_phone: document.getElementById('fGuardianPhone').value.trim() || null,
      status: document.getElementById('fStatus').value,
    };

    if (!payload.first_name || !payload.last_name || !payload.admission_number) {
      _toast('First name, last name and admission number are required.', 'error'); return;
    }

    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const res = await apiFetch('/api/students/' + id, { method: 'PUT', body: JSON.stringify(payload) });
      if (!res || !res.ok) { const d = await res.json(); throw new Error(d.error || 'Save failed'); }
      _toast('Student updated successfully.', 'success');
      document.getElementById('studentModal').hidden = true;
      await loadStudents();
    } catch (err) {
      _toast(err.message || 'Failed to save student.', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Changes';
    }
  }

  /* ── Delete Modal ──────────────────────────────────────────────── */
  function openDeleteModal(id, name) {
    deleteTargetId = id;
    document.getElementById('deleteStudentName').textContent = name;
    document.getElementById('deleteModal').hidden = false;
  }

  async function confirmDelete() {
    if (!deleteTargetId) return;
    const btn = document.getElementById('confirmDeleteBtn');
    btn.disabled = true; btn.textContent = 'Removing…';
    try {
      const res = await apiFetch('/api/students/' + deleteTargetId, { method: 'DELETE' });
      if (!res || !res.ok) { const d = await res.json(); throw new Error(d.error); }
      _toast('Student removed successfully.', 'success');
      document.getElementById('deleteModal').hidden = true;
      deleteTargetId = null;
      await loadStudents();
    } catch (err) {
      _toast(err.message || 'Failed to remove student.', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Yes, Remove';
    }
  }

  /* ── Event binding ─────────────────────────────────────────────── */
  function bindEvents() {
    let debounceTimer;
    document.getElementById('studentSearch').addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(applyFilters, 300);
    });
    document.getElementById('classFilter').addEventListener('change', applyFilters);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);

    document.getElementById('closeModalBtn').addEventListener('click', function () { document.getElementById('studentModal').hidden = true; });
    document.getElementById('cancelModalBtn').addEventListener('click', function () { document.getElementById('studentModal').hidden = true; });
    document.getElementById('saveStudentBtn').addEventListener('click', saveStudent);
    document.getElementById('studentModal').addEventListener('click', function (e) { if (e.target.id === 'studentModal') document.getElementById('studentModal').hidden = true; });

    document.getElementById('closeDeleteBtn').addEventListener('click', function () { document.getElementById('deleteModal').hidden = true; });
    document.getElementById('cancelDeleteBtn').addEventListener('click', function () { document.getElementById('deleteModal').hidden = true; });
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
    document.getElementById('deleteModal').addEventListener('click', function (e) { if (e.target.id === 'deleteModal') document.getElementById('deleteModal').hidden = true; });
  }

  /* ── Helpers ───────────────────────────────────────────────────── */
  function _fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return d; }
  }
  function _esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function _toast(msg, type) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }
})();