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
  let archiveTargetId = null;
  let currentUserRole = 'user';

  document.addEventListener('DOMContentLoaded', async function () {
    try {
      const u = JSON.parse(localStorage.getItem('user'));
      if (u && u.role) currentUserRole = u.role;
    } catch (e) {}

    // Show Admin-only controls
    const isAdmin = (currentUserRole === 'admin' || currentUserRole === 'headmaster');
    const createAcctBtn = document.getElementById('openCreateAccountModalBtn');
    if (createAcctBtn) {
      createAcctBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    }

    await Promise.all([loadClasses(), loadStudents()]);
    bindEvents();
    bindAccountEvents();
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
    const statusVal = document.getElementById('statusFilter').value;

    filtered = allStudents.filter(function (s) {
      const name = (s.first_name + ' ' + s.last_name).toLowerCase();
      const adm = (s.admission_number || '').toLowerCase();
      const matchQ = !q || name.includes(q) || adm.includes(q);
      const matchC = !classId || String(s.class_id) === classId;
      
      let matchS = true;
      const sStatus = s.status || 'Active';
      if (statusVal === '') {
        matchS = sStatus !== 'Archived';
      } else if (statusVal === 'All') {
        matchS = true;
      } else {
        matchS = sStatus.toLowerCase() === statusVal.toLowerCase();
      }

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

    const isAdmin = (currentUserRole === 'admin' || currentUserRole === 'headmaster');

    tbody.innerHTML = page.map(function (s, i) {
      const rowNum = start + i + 1;
      const name = _esc(s.first_name) + ' ' + _esc(s.last_name);
      const initials = ((s.first_name[0] || '') + (s.last_name[0] || '')).toUpperCase();
      const cls = _esc(s.class_name || '—');
      const gender = _esc(s.gender || '—');
      const status = s.status || 'Active';
      const badgeCls = status === 'Active' ? 'badge-active' : status === 'Suspended' ? 'badge-suspended' : status === 'Archived' ? 'badge-suspended' : 'badge-inactive';

      // Unified Account status badge
      const acctStatus = s.account_status || (s.user_id ? 'Active' : 'Not Created');
      let acctBadge = '';
      if (acctStatus === 'Active') {
        acctBadge = '<span class="aa-badge" style="background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;font-size:11.5px;padding:3px 8px;border-radius:12px;font-weight:600">Active</span>';
      } else if (acctStatus === 'Disabled') {
        acctBadge = '<span class="aa-badge" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:11.5px;padding:3px 8px;border-radius:12px;font-weight:600">Disabled</span>';
      } else if (acctStatus === 'Archived') {
        acctBadge = '<span class="aa-badge" style="background:#fef2f2;color:#991b1b;border:1px solid #fecaca;font-size:11.5px;padding:3px 8px;border-radius:12px;font-weight:600">Archived</span>';
      } else {
        acctBadge = '<span class="aa-badge" style="background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;font-size:11.5px;padding:3px 8px;border-radius:12px;font-weight:600">Not Created</span>';
      }

      // Actions
      let actionButtons = '<button class="pg-action-btn" data-view="' + s.id + '">View</button>';
      if (isAdmin) {
        if (acctStatus === 'Not Created' && status !== 'Archived') {
          actionButtons += '<button class="pg-action-btn" data-create-acct="' + s.id + '" title="Create Unified Account">+ Account</button>';
        } else if (acctStatus === 'Active') {
          actionButtons += '<button class="pg-action-btn" data-toggle-acct="' + s.id + '" data-action="disable" title="Disable account access">Disable</button>';
        } else if (acctStatus === 'Disabled') {
          actionButtons += '<button class="pg-action-btn" data-toggle-acct="' + s.id + '" data-action="enable" title="Enable account access">Enable</button>';
        }

        if (status === 'Archived') {
          actionButtons += '<button class="pg-action-btn" data-restore="' + s.id + '" data-name="' + name + '" style="color:#059669">Restore</button>';
        } else {
          actionButtons += '<button class="pg-action-btn" data-archive="' + s.id + '" data-name="' + name + '" title="Archive student record">Archive</button>';
        }

        actionButtons += '<button class="pg-action-btn pg-action-btn-danger" data-del="' + s.id + '" data-name="' + name + '">Remove</button>';
      }

      return '<tr>' +
        '<td class="row-num">' + rowNum + '</td>' +
        '<td><div class="pg-student-cell">' +
        '<div class="pg-student-avatar">' + initials + '</div>' +
        '<div>' +
          '<div class="pg-student-name">' + name + '</div>' +
          (s.account_email ? '<div style="font-size:11px;color:var(--aa-text-muted);font-family:monospace">' + _esc(s.account_email) + '</div>' : '') +
        '</div>' +
        '</div></td>' +
        '<td><span style="font-family:monospace;font-weight:600">' + _esc(s.admission_number || '—') + '</span></td>' +
        '<td>' + cls + '</td>' +
        '<td>' + gender + '</td>' +
        '<td><span class="' + badgeCls + '">' + _esc(status) + '</span></td>' +
        '<td>' + acctBadge + '</td>' +
        '<td class="pg-actions-cell">' + actionButtons + '</td>' +
        '</tr>';
    }).join('');

    tbody.querySelectorAll('[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () { openViewModal(btn.dataset.view); });
    });
    tbody.querySelectorAll('[data-create-acct]').forEach(function (btn) {
      btn.addEventListener('click', function () { openCreateAccountModal(btn.dataset.createAcct); });
    });
    tbody.querySelectorAll('[data-toggle-acct]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleToggleAccount(btn.dataset.toggleAcct, btn.dataset.action); });
    });
    tbody.querySelectorAll('[data-archive]').forEach(function (btn) {
      btn.addEventListener('click', function () { openArchiveModal(btn.dataset.archive, btn.dataset.name); });
    });
    tbody.querySelectorAll('[data-restore]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleRestoreStudent(btn.dataset.restore, btn.dataset.name); });
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
  let _currentStudentId = null;

  async function openViewModal(id) {
    const student = allStudents.find(function (s) { return String(s.id) === String(id); });
    if (!student) return;

    _currentStudentId = student.id;
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

    // Role-based visibility for portal account generation
    const accountSection = document.getElementById('portalAccountSection');
    const statusMsg = document.getElementById('accountStatusMsg');
    if (statusMsg) { statusMsg.hidden = true; statusMsg.textContent = ''; }

    let userRole = 'user';
    try {
      const u = JSON.parse(localStorage.getItem('user'));
      if (u && u.role) userRole = u.role;
    } catch (e) {}

    const isAdmin = (userRole === 'admin' || userRole === 'headmaster');
    if (accountSection) {
      accountSection.style.display = isAdmin ? 'block' : 'none';
    }

    document.getElementById('studentModal').hidden = false;
  }

  async function createStudentAccount() {
    if (!_currentStudentId) return;
    const btn = document.getElementById('createAccountBtn');
    const statusMsg = document.getElementById('accountStatusMsg');
    if (!confirm('Generate and email portal login credentials for this student / parent?')) return;

    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
    if (statusMsg) { statusMsg.hidden = true; }

    try {
      const res = await apiFetch('/api/students/' + _currentStudentId + '/account', {
        method: 'POST',
        body: JSON.stringify({})
      });
      const data = await res.json().catch(() => ({}));

      if (!res || !res.ok) {
        // 409 = student already has an account (detected via verified FK).
        // Show an informational amber message rather than a red error.
        if (res.status === 409 && (data.code === 'STUDENT_ACCOUNT_EXISTS' || data.accountExists)) {
          if (statusMsg) {
            statusMsg.hidden = false;
            statusMsg.style.background = '#fef3c7';
            statusMsg.style.color = '#92400e';
            statusMsg.style.border = '1px solid #fde68a';
            statusMsg.innerHTML = `<strong>Account already exists</strong> for this student` +
              (data.email ? ` (${_esc(data.email)})` : '') +
              `.<br><em>Use the <strong>Create Account</strong> modal to reset credentials if needed.</em>`;
          }
          return; // not an error — just inform the admin
        }
        throw new Error(data.error || data.message || 'Failed to create account');
      }

      if (statusMsg) {
        statusMsg.hidden = false;
        statusMsg.style.background = '#ecfdf5';
        statusMsg.style.color = '#065f46';
        statusMsg.style.border = '1px solid #a7f3d0';
        statusMsg.innerHTML = `<strong>Account Ready:</strong> Login email: <code>${_esc(data.email)}</code><br/>Temporary Password: <code>${_esc(data.tempPassword)}</code><br/><em>${data.emailSent ? 'Login credentials sent via email.' : 'Email service pending, credentials generated.'}</em>`;
      }
      _toast(data.message || 'Account generated successfully.', 'success');
    } catch (err) {
      if (statusMsg) {
        statusMsg.hidden = false;
        statusMsg.style.background = '#fef2f2';
        statusMsg.style.color = '#991b1b';
        statusMsg.style.border = '1px solid #fecaca';
        statusMsg.textContent = 'Error: ' + err.message;
      }
      _toast(err.message || 'Account creation failed.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔑 Create / Send Login Info'; }
    }
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
    document.getElementById('createAccountBtn')?.addEventListener('click', createStudentAccount);
    document.getElementById('studentModal').addEventListener('click', function (e) { if (e.target.id === 'studentModal') document.getElementById('studentModal').hidden = true; });

    document.getElementById('closeDeleteBtn').addEventListener('click', function () { document.getElementById('deleteModal').hidden = true; });
    document.getElementById('cancelDeleteBtn').addEventListener('click', function () { document.getElementById('deleteModal').hidden = true; });
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
    document.getElementById('deleteModal').addEventListener('click', function (e) { if (e.target.id === 'deleteModal') document.getElementById('deleteModal').hidden = true; });
  }

  /* ── Unified Student & Guardian Account Management ───────────── */
  function selectStudentForAccount(student) {
    if (!student) return;
    document.getElementById('acctTargetStudentId').value = student.id;
    document.getElementById('acctStudentName').textContent = (student.first_name || '') + ' ' + (student.last_name || '');
    document.getElementById('acctStudentClass').textContent = student.class_name || '—';
    document.getElementById('acctStudentAdm').textContent = student.admission_number || '—';
    document.getElementById('acctStudentStatus').textContent = student.status || 'Active';
    document.getElementById('acctSelectedCard').style.display = 'block';

    // Determine whether this student already has a login account.
    // account_status is set by the backend based on the actual users FK —
    // do NOT use student.user_id here since it is null for all newly enrolled
    // students (enrollment no longer auto-creates an account).
    const hasAccount = student.account_status && student.account_status !== 'Not Created';
    const existsAlert = document.getElementById('acctExistsAlert');
    const formFields = document.getElementById('acctFormFields');
    const submitBtn = document.getElementById('submitCreateAcctBtn');

    if (hasAccount) {
      existsAlert.style.display = 'block';
      document.getElementById('acctExistsEmail').textContent = student.account_email || 'Linked User';
      submitBtn.textContent = 'Update / Reset Account';
    } else {
      existsAlert.style.display = 'none';
      submitBtn.textContent = 'Create Account';
    }
    formFields.style.display = 'block';

    // Suggest email
    const admClean = (student.admission_number || 'std').toLowerCase().replace(/[^a-z0-9]/g, '.');
    const fNameClean = (student.first_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const lNameClean = (student.last_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const suggestedEmail = student.account_email || (fNameClean && lNameClean ? fNameClean + '.' + lNameClean + '@school.local' : admClean + '@school.local');
    document.getElementById('acctEmailInput').value = suggestedEmail;

    if (!document.getElementById('acctPasswordInput').value) {
      document.getElementById('acctPasswordInput').value = generateSecureTempPass();
    }
  }

  function openCreateAccountModal(studentId) {
    const modal = document.getElementById('unifiedAccountModal');
    if (!modal) return;

    const actionMsg = document.getElementById('acctActionMsg');
    if (actionMsg) { actionMsg.style.display = 'none'; actionMsg.textContent = ''; }
    document.getElementById('acctSearchInput').value = '';
    document.getElementById('acctSearchResults').style.display = 'none';
    document.getElementById('acctPasswordInput').value = generateSecureTempPass();

    if (studentId) {
      const s = allStudents.find(function (item) { return String(item.id) === String(studentId); });
      document.getElementById('acctSearchGroup').style.display = 'none';
      if (s) selectStudentForAccount(s);
    } else {
      document.getElementById('acctSearchGroup').style.display = 'block';
      document.getElementById('acctSelectedCard').style.display = 'none';
      document.getElementById('acctExistsAlert').style.display = 'none';
      document.getElementById('acctFormFields').style.display = 'none';
      document.getElementById('acctTargetStudentId').value = '';
      document.getElementById('submitCreateAcctBtn').textContent = 'Create Account';
    }

    modal.hidden = false;
  }

  function generateSecureTempPass() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let p = 'Std#';
    for (let i = 0; i < 6; i++) {
      p += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return p;
  }

  async function submitUnifiedAccount(resetMode) {
    const studentId = document.getElementById('acctTargetStudentId').value;
    const email = document.getElementById('acctEmailInput').value.trim();
    const password = document.getElementById('acctPasswordInput').value.trim();
    const allowGuardian = document.getElementById('acctGuardianAccess').checked;
    const btn = document.getElementById('submitCreateAcctBtn');
    const msgBox = document.getElementById('acctActionMsg');

    if (!studentId) {
      _toast('Please select a student first.', 'error');
      return;
    }
    if (!email || !email.includes('@')) {
      _toast('Please provide a valid login email address.', 'error');
      return;
    }
    if (!password || password.length < 6) {
      _toast('Password must be at least 6 characters.', 'error');
      return;
    }

    const s = allStudents.find(function (item) { return String(item.id) === String(studentId); });
    const hasExisting = s && s.account_status && s.account_status !== 'Not Created';
    const isReset = resetMode === true || (resetMode !== false && hasExisting);

    btn.disabled = true;
    btn.textContent = 'Saving…';
    if (msgBox) msgBox.style.display = 'none';

    try {
      const res = await apiFetch('/api/students/' + studentId + '/account', {
        method: 'POST',
        body: JSON.stringify({
          email: email,
          password: password,
          allow_guardian: allowGuardian,
          reset: isReset
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Handle 409 STUDENT_ACCOUNT_EXISTS gracefully: show the exists alert
        // panel in the modal rather than a generic error toast.
        if (res.status === 409 && data.code === 'STUDENT_ACCOUNT_EXISTS') {
          const existsAlert = document.getElementById('acctExistsAlert');
          const emailEl = document.getElementById('acctExistsEmail');
          if (existsAlert) existsAlert.style.display = 'block';
          if (emailEl) emailEl.textContent = data.email || 'Linked User';
          if (msgBox) {
            msgBox.style.display = 'block';
            msgBox.style.background = '#fef3c7';
            msgBox.style.color = '#92400e';
            msgBox.style.border = '1px solid #fde68a';
            msgBox.textContent = 'This student already has an account. Click "Update / Reset Account" to update credentials.';
          }
          return;
        }
        const errMessage = data.detail || data.error || data.message || 'Failed to create student account';
        throw new Error(errMessage);
      }

      _toast(data.message || 'Unified Student & Guardian account established successfully.', 'success');
      document.getElementById('unifiedAccountModal').hidden = true;
      await loadStudents();
    } catch (err) {
      if (msgBox) {
        msgBox.style.display = 'block';
        msgBox.style.background = '#fef2f2';
        msgBox.style.color = '#991b1b';
        msgBox.style.border = '1px solid #fecaca';
        msgBox.textContent = 'Error: ' + err.message;
      }
      _toast(err.message || 'Action failed', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  }

  async function handleToggleAccount(studentId, action) {
    const confirmText = action === 'disable'
      ? 'Disable login access for this student & guardian?'
      : 'Re-enable login access for this student & guardian?';
    if (!confirm(confirmText)) return;

    try {
      const res = await apiFetch('/api/students/' + studentId + '/account/status', {
        method: 'PUT',
        body: JSON.stringify({ is_active: action === 'enable' ? 1 : 0 })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update account status');
      _toast(data.message || 'Account status updated.', 'success');
      await loadStudents();
    } catch (err) {
      _toast(err.message || 'Failed to update account status', 'error');
    }
  }

  /* ── Archive & Restore Lifecycle ───────────────────────────────── */
  function openArchiveModal(studentId, name) {
    archiveTargetId = studentId;
    const txt = document.getElementById('archiveModalText');
    if (txt) {
      txt.innerHTML = 'Are you sure you want to archive <strong>' + _esc(name) + '</strong>? Historical academic results, transcripts, and attendance records will be retained, but the student’s portal account will be deactivated and removed from active class rosters.';
    }
    document.getElementById('archiveModal').hidden = false;
  }

  async function confirmArchive() {
    if (!archiveTargetId) return;
    const btn = document.getElementById('confirmArchiveBtn');
    btn.disabled = true;
    btn.textContent = 'Archiving…';

    try {
      const res = await apiFetch('/api/students/' + archiveTargetId + '/archive', {
        method: 'PUT',
        body: JSON.stringify({ reason: 'Admin lifecycle archive' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to archive student');
      _toast('Student archived successfully.', 'success');
      document.getElementById('archiveModal').hidden = true;
      archiveTargetId = null;
      await loadStudents();
    } catch (err) {
      _toast(err.message || 'Failed to archive student', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Yes, Archive';
    }
  }

  async function handleRestoreStudent(studentId, name) {
    if (!confirm('Restore active student record for ' + name + '?')) return;

    try {
      const res = await apiFetch('/api/students/' + studentId + '/restore', {
        method: 'PUT',
        body: JSON.stringify({})
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to restore student');
      _toast('Student record restored to active roster.', 'success');
      await loadStudents();
    } catch (err) {
      _toast(err.message || 'Failed to restore student', 'error');
    }
  }

  function bindAccountEvents() {
    const openBtn = document.getElementById('openCreateAccountModalBtn');
    if (openBtn) {
      openBtn.addEventListener('click', function () { openCreateAccountModal(null); });
    }

    const closeAcctBtn = document.getElementById('closeAcctModalBtn');
    if (closeAcctBtn) closeAcctBtn.addEventListener('click', function () { document.getElementById('unifiedAccountModal').hidden = true; });
    const cancelAcctBtn = document.getElementById('cancelAcctModalBtn');
    if (cancelAcctBtn) cancelAcctBtn.addEventListener('click', function () { document.getElementById('unifiedAccountModal').hidden = true; });

    document.getElementById('acctGenPassBtn')?.addEventListener('click', function () {
      document.getElementById('acctPasswordInput').value = generateSecureTempPass();
    });

    document.getElementById('submitCreateAcctBtn')?.addEventListener('click', function () {
      submitUnifiedAccount(false);
    });

    document.getElementById('acctResetPassBtn')?.addEventListener('click', function () {
      submitUnifiedAccount(true);
    });

    document.getElementById('acctToggleStatusBtn')?.addEventListener('click', async function () {
      const studentId = document.getElementById('acctTargetStudentId').value;
      if (!studentId) return;
      const s = allStudents.find(function (item) { return String(item.id) === String(studentId); });
      const currentActive = s && s.user_is_active === 1;
      await handleToggleAccount(studentId, currentActive ? 'disable' : 'enable');
      document.getElementById('unifiedAccountModal').hidden = true;
    });

    // Autocomplete search inside modal
    const acctSearchInput = document.getElementById('acctSearchInput');
    const acctResults = document.getElementById('acctSearchResults');
    if (acctSearchInput && acctResults) {
      acctSearchInput.addEventListener('input', function () {
        const val = acctSearchInput.value.toLowerCase().trim();
        if (!val || val.length < 2) {
          acctResults.style.display = 'none';
          acctResults.innerHTML = '';
          return;
        }

        const matches = allStudents.filter(function (s) {
          const name = (s.first_name + ' ' + s.last_name).toLowerCase();
          const adm = (s.admission_number || '').toLowerCase();
          return name.includes(val) || adm.includes(val);
        }).slice(0, 8);

        if (!matches.length) {
          acctResults.innerHTML = '<div style="padding:8px 12px;color:var(--aa-text-muted);font-size:12px">No students found</div>';
          acctResults.style.display = 'block';
          return;
        }

        acctResults.innerHTML = matches.map(function (s) {
          const name = _esc(s.first_name + ' ' + s.last_name);
          const adm = _esc(s.admission_number || 'No Adm');
          const cls = _esc(s.class_name || '—');
          return '<div class="acct-search-item" data-id="' + s.id + '" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--aa-border,#eee);font-size:13px;display:flex;justify-content:space-between;align-items:center">' +
            '<div><strong>' + name + '</strong> <span style="font-family:monospace;color:var(--aa-text-muted);font-size:11.5px">(' + adm + ')</span></div>' +
            '<span class="aa-badge" style="font-size:11px">' + cls + '</span>' +
            '</div>';
        }).join('');
        acctResults.style.display = 'block';

        acctResults.querySelectorAll('.acct-search-item').forEach(function (el) {
          el.addEventListener('click', function () {
            const sid = el.dataset.id;
            const target = allStudents.find(function (item) { return String(item.id) === String(sid); });
            if (target) {
              selectStudentForAccount(target);
              acctResults.style.display = 'none';
            }
          });
        });
      });
    }

    // Archive modal events
    document.getElementById('closeArchiveModalBtn')?.addEventListener('click', function () {
      document.getElementById('archiveModal').hidden = true;
    });
    document.getElementById('cancelArchiveBtn')?.addEventListener('click', function () {
      document.getElementById('archiveModal').hidden = true;
    });
    document.getElementById('confirmArchiveBtn')?.addEventListener('click', confirmArchive);
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