/**
 * teachers.js — Admin Assist Teachers Page
 * Loads teachers from /api/search/users?role=teacher,
 * joins subject assignments, renders paginated table matching Image 2.
 */

(function () {
    'use strict';

    const PAGE_SIZE = 10;

    let allTeachers = [];    // current page only (for modal lookups)
    let allAssignments = [];
    let allSubjects = [];
    let filtered = [];
    let currentPage = 1;
    let totalTeachers = 0;  // server-reported total
    let deactivateTargetId = null;
    let deactivateTargetName = '';
    let searchQuery = '';
    let statusFilter = '';

    document.addEventListener('DOMContentLoaded', async function () {
        await Promise.all([loadSubjects(), loadTeachers()]);
        bindEvents();
    });

    /* ── Data loading ─────────────────────────────────────────────── */

    async function loadSubjects() {
        try {
            const res = await apiFetch('/api/subjects?is_active=1');
            if (!res || !res.ok) return;
            allSubjects = await res.json();
            const sel = document.getElementById('fTSubject');
            if (!sel) return;
            allSubjects.forEach(function (s) {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.subject_code + ' — ' + s.subject_name;
                sel.appendChild(opt);
            });
        } catch (err) { console.error('loadSubjects:', err); }
    }

    async function loadTeachers() {
        try {
            const qs = new URLSearchParams({
                page: currentPage,
                limit: PAGE_SIZE,
            });
            if (searchQuery) qs.set('search', searchQuery);
            if (statusFilter) qs.set('status', statusFilter);

            const [tRes, aRes] = await Promise.all([
                apiFetch('/api/teachers?' + qs.toString()),
                apiFetch('/api/subjects/assignments/list'),
            ]);

            const tData = tRes && tRes.ok ? await tRes.json() : { teachers: [], total: 0 };
            allTeachers    = tData.teachers || [];
            totalTeachers  = tData.total    || 0;
            allAssignments = aRes && aRes.ok ? await aRes.json() : [];

            // Update stat cards (totals from server)
            _setText('statTotal',    totalTeachers);
            _setText('statActive',   allTeachers.filter(function (t) { return t.is_active !== 0; }).length);
            _setText('statSubjects', allAssignments.length);

            renderTable();
            renderPagination();
        } catch (err) {
            console.error('loadTeachers:', err);
            document.getElementById('teachersBody').innerHTML =
                '<tr><td colspan="6" class="pg-empty-cell">Unable to load teachers.</td></tr>';
        }
    }

    /* ── Filter & render ──────────────────────────────────────────── */

    function applyFilters() {
        searchQuery  = (document.getElementById('teacherSearch').value || '').trim();
        statusFilter = document.getElementById('statusFilter').value;
        currentPage  = 1;
        loadTeachers();
    }

    // renderTable and renderPagination now use server-page data directly

    function renderTable() {
        const tbody = document.getElementById('teachersBody');
        const page  = allTeachers; // server already returns the correct page
        const count = document.getElementById('teacherCount');
        if (count) count.textContent = totalTeachers + ' teacher' + (totalTeachers !== 1 ? 's' : '');

        if (!page.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="pg-empty-cell">No teachers match your search.</td></tr>';
            return;
        }

        const start = (currentPage - 1) * PAGE_SIZE;

        tbody.innerHTML = page.map(function (t, i) {
            const rowNum = start + i + 1;
            const initials = (t.name || 'T').split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
            const active = t.is_active !== 0;
            const badgeCls = active ? 'badge-active' : 'badge-inactive';
            const badgeTxt = active ? 'Active' : 'Inactive';

            // Subject assignments for this teacher
            const teacherAssigns = allAssignments.filter(function (a) { return a.teacher_id === t.id; });
            const uniqueSubjects = [...new Set(teacherAssigns.map(function (a) { return a.subject_name; }))];
            let subjectHtml = '—';
            if (uniqueSubjects.length) {
                subjectHtml = '<span class="pg-subject-tag">' + _esc(uniqueSubjects[0]) + '</span>';
                if (uniqueSubjects.length > 1) {
                    subjectHtml += '<span class="pg-subject-tag-more">+' + (uniqueSubjects.length - 1) + '</span>';
                }
            }

            return '<tr>' +
                '<td class="row-num">' + rowNum + '</td>' +
                '<td><div class="pg-teacher-cell">' +
                '<div class="pg-teacher-avatar">' + _esc(initials) + '</div>' +
                '<div><div class="pg-teacher-name">' + _esc(t.name || '—') + '</div>' +
                '<div class="pg-teacher-email">' + _esc(t.email || '') + '</div></div>' +
                '</div></td>' +
                '<td>' + subjectHtml + '</td>' +
                '<td>' + _esc(t.email || '—') + '</td>' +
                '<td><span class="' + badgeCls + '">' + badgeTxt + '</span></td>' +
                '<td>' +
                '<div class="pg-dropdown" id="dd-' + t.id + '">' +
                '<div class="pg-action-split">' +
                '<button class="pg-action-split-main" data-view="' + t.id + '">View</button>' +
                '<button class="pg-action-split-caret" data-toggle="' + t.id + '">▾</button>' +
                '</div>' +
                '<div class="pg-dropdown-menu" id="ddm-' + t.id + '">' +
                '<button data-edit="' + t.id + '">Edit</button>' +
                '<button class="danger" data-deactivate="' + t.id + '" data-name="' + _esc(t.name || '') + '" data-active="' + (active ? '1' : '0') + '">' +
                (active ? 'Deactivate' : 'Activate') +
                '</button>' +
                '</div>' +
                '</div>' +
                '</td>' +
                '</tr>';
        }).join('');

        // Wire up table actions
        tbody.querySelectorAll('[data-view]').forEach(function (btn) {
            btn.addEventListener('click', function () { openViewModal(btn.dataset.view); });
        });
        tbody.querySelectorAll('[data-toggle]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                document.querySelectorAll('.pg-dropdown-menu').forEach(function (m) { m.classList.remove('open'); });
                document.getElementById('ddm-' + btn.dataset.toggle).classList.toggle('open');
            });
        });
        tbody.querySelectorAll('[data-edit]').forEach(function (btn) {
            btn.addEventListener('click', function () { openEditModal(btn.dataset.edit); });
        });
        tbody.querySelectorAll('[data-deactivate]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                deactivateTargetId = btn.dataset.deactivate;
                deactivateTargetName = btn.dataset.name;
                const isActive = btn.dataset.active === '1';
                document.getElementById('deactivateModalTitle').textContent = isActive ? 'Deactivate Teacher' : 'Activate Teacher';
                document.getElementById('deactivateConfirmText').textContent = (isActive ? 'Deactivate ' : 'Activate ') + (btn.dataset.name || 'this teacher') + '?';
                document.getElementById('confirmDeactivateBtn').textContent = isActive ? 'Deactivate' : 'Activate';
                document.getElementById('deactivateModal').hidden = false;
            });
        });
    }

    function renderPagination() {
        const total = Math.ceil(totalTeachers / PAGE_SIZE);
        const info  = document.getElementById('paginationInfo');
        const btns  = document.getElementById('paginationBtns');
        if (!info || !btns) return;

        const s = totalTeachers ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
        const e = Math.min(currentPage * PAGE_SIZE, totalTeachers);
        info.textContent = 'Showing ' + s + ' to ' + e + ' of ' + totalTeachers + ' teachers';

        let html = '<button class="pg-page-btn" id="prevPg"' + (currentPage <= 1 ? ' disabled' : '') + '>‹</button>';
        for (let p = 1; p <= total; p++) {
            if (total > 7 && p > 3 && p < total - 1 && Math.abs(p - currentPage) > 1) {
                if (p === 4 || p === total - 2) html += '<span class="pg-page-ellipsis">…</span>';
                continue;
            }
            html += '<button class="pg-page-btn' + (p === currentPage ? ' pg-active' : '') + '" data-pg="' + p + '">' + p + '</button>';
        }
        html += '<button class="pg-page-btn" id="nextPg"' + (currentPage >= total ? ' disabled' : '') + '>›</button>';
        btns.innerHTML = html;

        btns.querySelectorAll('[data-pg]').forEach(function (b) {
            b.addEventListener('click', function () { currentPage = parseInt(b.dataset.pg); loadTeachers(); });
        });
        const prev = document.getElementById('prevPg');
        const next = document.getElementById('nextPg');
        if (prev) prev.addEventListener('click', function () { if (currentPage > 1) { currentPage--; loadTeachers(); } });
        if (next) next.addEventListener('click', function () { if (currentPage < total) { currentPage++; loadTeachers(); } });
    }

    /* ── View modal ──────────────────────────────────────────────── */

    function openViewModal(id) {
        const t = allTeachers.find(function (x) { return String(x.id) === String(id); });
        if (!t) return;
        const assigns = allAssignments.filter(function (a) { return a.teacher_id === t.id; });
        const subjectList = [...new Set(assigns.map(function (a) { return a.subject_name; }))];

        document.getElementById('viewTeacherContent').innerHTML =
            '<div class="pg-teacher-cell" style="gap:16px;margin-bottom:20px">' +
            '<div class="pg-teacher-avatar" style="width:54px;height:54px;font-size:18px">' +
            (t.name || 'T').split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase() +
            '</div>' +
            '<div><div class="pg-teacher-name" style="font-size:17px">' + _esc(t.name) + '</div>' +
            '<div class="pg-teacher-email">' + _esc(t.email) + '</div>' +
            '<div style="margin-top:4px"><span class="' + (t.is_active !== 0 ? 'badge-active' : 'badge-inactive') + '">' +
            (t.is_active !== 0 ? 'Active' : 'Inactive') + '</span></div>' +
            '</div>' +
            '</div>' +
            '<div class="pg-view-rows">' +
            '<div class="pg-view-row"><span>Role</span><strong>Teacher</strong></div>' +
            '<div class="pg-view-row"><span>Email</span><strong>' + _esc(t.email) + '</strong></div>' +
            '<div class="pg-view-row"><span>Subjects</span><strong>' +
            (subjectList.length ? subjectList.join(', ') : '—') + '</strong></div>' +
            '<div class="pg-view-row"><span>Classes</span><strong>' +
            (assigns.length ? [...new Set(assigns.map(function (a) { return a.class_name; }))].join(', ') : '—') +
            '</strong></div>' +
            '</div>';

        document.getElementById('viewTeacherModal').hidden = false;
    }

    /* ── Add / Edit modal ────────────────────────────────────────── */

    function openAddModal() {
        document.getElementById('editTeacherId').value = '';
        document.getElementById('teacherModalTitle').textContent = 'Add Teacher';
        document.getElementById('fTName').value = '';
        document.getElementById('fTEmail').value = '';
        document.getElementById('fTPassword').value = '';
        document.getElementById('fTPhone').value = '';
        document.getElementById('fTSubject').value = '';
        document.getElementById('passwordGroup').style.display = '';
        document.getElementById('teacherModal').hidden = false;
    }

    function openEditModal(id) {
        const t = allTeachers.find(function (x) { return String(x.id) === String(id); });
        if (!t) return;
        document.getElementById('editTeacherId').value = t.id;
        document.getElementById('teacherModalTitle').textContent = 'Edit Teacher';
        document.getElementById('fTName').value = t.name || '';
        document.getElementById('fTEmail').value = t.email || '';
        document.getElementById('fTPassword').value = '';
        document.getElementById('fTPhone').value = t.phone || '';
        document.getElementById('passwordGroup').style.display = 'none'; // hide pwd on edit
        // Set primary subject from assignments
        const assigns = allAssignments.filter(function (a) { return a.teacher_id === t.id; });
        if (assigns.length) document.getElementById('fTSubject').value = assigns[0].subject_id || '';
        document.getElementById('teacherModal').hidden = false;
    }

    async function saveTeacher() {
        const id = document.getElementById('editTeacherId').value;
        const btn = document.getElementById('saveTeacherBtn');
        const isEdit = !!id;

        const name = document.getElementById('fTName').value.trim();
        const email = document.getElementById('fTEmail').value.trim();
        const password = document.getElementById('fTPassword').value;
        const subjectId = document.getElementById('fTSubject').value;

        if (!name || !email) { _toast('Name and email are required.', 'error'); return; }
        if (!isEdit && !password) { _toast('Password is required for new teachers.', 'error'); return; }
        if (!isEdit && password.length < 8) { _toast('Password must be at least 8 characters.', 'error'); return; }

        btn.disabled = true; btn.textContent = 'Saving…';

        try {
            let res;
            if (isEdit) {
                res = await apiFetch('/api/teachers/' + id, { method: 'PUT', body: JSON.stringify({ name, email }) });
            } else {
                res = await apiFetch('/api/teachers', {
                    method: 'POST',
                    body: JSON.stringify({ name, email, role: 'staff' }),
                });
            }

            if (!res || !res.ok) {
                const d = await res.json().catch(function () { return {}; });
                throw new Error(d.error || 'Save failed');
            }

            // If a primary subject was selected for a new teacher, create assignment
            if (!isEdit && subjectId) {
                const userData = await res.json();
                const newId = userData.teacher?.id || userData.id;
                if (newId) {
                    const currentTerm = await _getCurrentTerm();
                    if (currentTerm) {
                        await apiFetch('/api/subjects/assign', {
                            method: 'POST',
                            body: JSON.stringify({
                                teacher_id: newId, subject_id: subjectId,
                                class_id: 1, academic_year_id: currentTerm.academic_year_id,
                            }),
                        }).catch(function () { });
                    }
                }
            }

            _toast(isEdit ? 'Teacher updated.' : 'Teacher account created successfully.', 'success');
            document.getElementById('teacherModal').hidden = true;
            await loadTeachers();
        } catch (err) {
            _toast(err.message || 'Failed to save teacher.', 'error');
        } finally {
            btn.disabled = false; btn.textContent = 'Save Teacher';
        }
    }

    async function _getCurrentTerm() {
        try {
            const res = await apiFetch('/api/attendance/terms');
            const terms = await res.json();
            return terms.find(function (t) { return t.is_current; }) || terms[0] || null;
        } catch { return null; }
    }

    /* ── Deactivate ───────────────────────────────────────────────── */

    async function confirmDeactivate() {
        if (!deactivateTargetId) return;
        const btn = document.getElementById('confirmDeactivateBtn');
        btn.disabled = true;

        try {
            const res = await apiFetch('/api/teachers/' + deactivateTargetId + '/status', {
                method: 'PATCH',
            });

            if (res && res.status === 404) {
                _toast('Teacher not found.', 'error');
            } else if (!res || !res.ok) {
                const d = await res.json().catch(function () { return {}; });
                throw new Error(d.error || 'Update failed');
            } else {
                _toast(deactivateTargetName + ' has been ' + (active ? 'deactivated' : 'activated') + '.', 'success');
            }

            document.getElementById('deactivateModal').hidden = true;
            deactivateTargetId = null;
            deactivateTargetName = '';
            await loadTeachers();
        } catch (err) {
            _toast(err.message || 'Action failed.', 'error');
        } finally {
            btn.disabled = false;
        }
    }

    /* ── Event binding ────────────────────────────────────────────── */

    function bindEvents() {
        document.getElementById('addTeacherBtn').addEventListener('click', openAddModal);

        let debounce;
        document.getElementById('teacherSearch').addEventListener('input', function () {
            clearTimeout(debounce); debounce = setTimeout(applyFilters, 280);
        });
        document.getElementById('statusFilter').addEventListener('change', applyFilters);

        // Teacher modal
        document.getElementById('closeTeacherModalBtn').addEventListener('click', function () { document.getElementById('teacherModal').hidden = true; });
        document.getElementById('cancelTeacherModalBtn').addEventListener('click', function () { document.getElementById('teacherModal').hidden = true; });
        document.getElementById('saveTeacherBtn').addEventListener('click', saveTeacher);
        document.getElementById('teacherModal').addEventListener('click', function (e) { if (e.target.id === 'teacherModal') document.getElementById('teacherModal').hidden = true; });

        // View modal
        document.getElementById('closeViewTeacherBtn').addEventListener('click', function () { document.getElementById('viewTeacherModal').hidden = true; });
        document.getElementById('closeViewTeacherFooterBtn').addEventListener('click', function () { document.getElementById('viewTeacherModal').hidden = true; });
        document.getElementById('viewTeacherModal').addEventListener('click', function (e) { if (e.target.id === 'viewTeacherModal') document.getElementById('viewTeacherModal').hidden = true; });

        // Deactivate modal
        document.getElementById('closeDeactivateBtn').addEventListener('click', function () { document.getElementById('deactivateModal').hidden = true; });
        document.getElementById('cancelDeactivateBtn').addEventListener('click', function () { document.getElementById('deactivateModal').hidden = true; });
        document.getElementById('confirmDeactivateBtn').addEventListener('click', confirmDeactivate);

        // Close all dropdowns on outside click
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.pg-dropdown')) {
                document.querySelectorAll('.pg-dropdown-menu').forEach(function (m) { m.classList.remove('open'); });
            }
        });
    }

    /* ── Helpers ──────────────────────────────────────────────────── */

    function _setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
    function _esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _toast(msg, type) {
        const c = document.getElementById('toast-container'); if (!c) return;
        const el = document.createElement('div');
        el.className = 'toast toast-' + (type || 'info');
        el.textContent = msg;
        c.appendChild(el);
        setTimeout(function () { el.remove(); }, 4000);
    }

})();