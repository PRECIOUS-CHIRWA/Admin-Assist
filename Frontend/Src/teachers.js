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
    let currentUser = null;
    let isAdmin = false;
    try {
        currentUser = (typeof getUser === 'function' ? getUser() : null) || JSON.parse(localStorage.getItem('user'));
        isAdmin = currentUser && currentUser.role === 'admin';
    } catch (e) {}

    document.addEventListener('DOMContentLoaded', async function () {
        if (!isAdmin) {
            const addBtn = document.getElementById('addTeacherBtn');
            if (addBtn) addBtn.style.display = 'none';
        }
        await Promise.all([loadSubjects(), loadTeachers()]);
        bindEvents();
    });

    /* ── Data loading ─────────────────────────────────────────────── */

    let allDepartments = [];

    async function loadSubjects() {
        try {
            const [subRes, clsRes, deptRes] = await Promise.all([
                apiFetch('/api/subjects?is_active=1').catch(() => null),
                apiFetch('/api/attendance/classes').catch(() => null),
                apiFetch('/api/teachers/departments').catch(() => null),
            ]);

            if (subRes && subRes.ok) {
                allSubjects = await subRes.json();
                const sel = document.getElementById('fTSubject');
                if (sel) {
                    sel.innerHTML = '<option value="">Select Subject…</option>';
                    allSubjects.forEach(function (s) {
                        const opt = document.createElement('option');
                        opt.value = s.id;
                        opt.textContent = s.subject_code + ' — ' + s.subject_name;
                        sel.appendChild(opt);
                    });
                }
            }

            if (clsRes && clsRes.ok) {
                const classes = await clsRes.json();
                const clsSel = document.getElementById('fTClass');
                if (clsSel) {
                    clsSel.innerHTML = '<option value="">Select Class (optional)…</option>';
                    classes.forEach(function (c) {
                        const opt = document.createElement('option');
                        opt.value = c.id;
                        opt.textContent = c.class_name || (c.grade_level + (c.stream ? ' ' + c.stream : ''));
                        clsSel.appendChild(opt);
                    });
                }
            }

            const deptSel = document.getElementById('fTDepartment');
            if (deptSel) {
                deptSel.innerHTML = '<option value="">Select Department (optional)…</option>';
                let depts = [
                    'Languages', 'Natural Sciences', 'Social Sciences',
                    'Mathematics & ICT', 'Practical & Creative Arts',
                    'Guidance & Counselling', 'Administration'
                ];
                if (deptRes && deptRes.ok) {
                    const data = await deptRes.json();
                    if (data && data.departments && data.departments.length) {
                        depts = data.departments.map(function (d) { return d.name || d; });
                    }
                }
                depts.forEach(function (d) {
                    const opt = document.createElement('option');
                    opt.value = d;
                    opt.textContent = d;
                    deptSel.appendChild(opt);
                });
            }
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
            allTeachers = tData.teachers || [];
            totalTeachers = tData.total || 0;
            allAssignments = aRes && aRes.ok ? await aRes.json() : [];

            // Update stat cards (totals from server)
            _setText('statTotal', totalTeachers);
            _setText('statActive', allTeachers.filter(function (t) { return t.is_active !== 0; }).length);
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
        searchQuery = (document.getElementById('teacherSearch').value || '').trim();
        statusFilter = document.getElementById('statusFilter').value;
        currentPage = 1;
        loadTeachers();
    }

    function renderTable() {
        const tbody = document.getElementById('teachersBody');
        const page = allTeachers; // server already returns the correct page
        const count = document.getElementById('teacherCount');
        if (count) count.textContent = totalTeachers + ' teacher' + (totalTeachers !== 1 ? 's' : '');

        if (!page.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="pg-empty-cell">No teachers match your search.</td></tr>';
            return;
        }

        const start = (currentPage - 1) * PAGE_SIZE;

        tbody.innerHTML = page.map(function (t, i) {
            const rowNum = start + i + 1;
            const initials = (t.name || 'T').split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
            const active = t.is_active !== 0;
            const badgeCls = active ? 'badge-active' : 'badge-inactive';
            const badgeTxt = active ? 'Active' : 'Inactive';

            // School Position & Department
            const pos = t.school_position || 'Teacher';
            const dept = t.department || '—';
            const ctBadge = t.class_teacher_of
                ? '<div style="margin-top:4px"><span class="aa-badge" style="font-size:11px;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;padding:2px 7px;border-radius:10px;font-weight:600">Class Teacher: ' + _esc(t.class_teacher_of) + '</span></div>'
                : '';
            const posDeptHtml = '<div><div style="font-weight:600;color:var(--aa-text,#1e293b);font-size:13px">' + _esc(pos) + '</div>' +
                '<div style="font-size:11.5px;color:var(--aa-text-muted,#64748b)">' + _esc(dept) + '</div>' +
                ctBadge + '</div>';

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
                '<td>' + posDeptHtml + '</td>' +
                '<td>' + subjectHtml + '</td>' +
                '<td>' + _esc(t.email || '—') + '</td>' +
                '<td><span class="' + badgeCls + '">' + badgeTxt + '</span></td>' +
                (isAdmin ? (
                    '<td>' +
                    '<div class="pg-dropdown" id="dd-' + t.id + '">' +
                    '<div class="pg-action-split">' +
                    '<button class="pg-action-split-main" data-view="' + t.id + '">View</button>' +
                    '<button class="pg-action-split-caret" data-toggle="' + t.id + '">▾</button>' +
                    '</div>' +
                    '<div class="pg-dropdown-menu" id="ddm-' + t.id + '">' +
                    '<button data-edit="' + t.id + '">Edit</button>' +
                    '<a href="subject-management.html?teacher_id=' + t.id + '" style="display:block;padding:8px 14px;text-align:left;font-size:13px;color:var(--aa-text,#1e293b);text-decoration:none;font-weight:500;">Assign Subject</a>' +
                    '<button class="danger" data-deactivate="' + t.id + '" data-name="' + _esc(t.name || '') + '" data-active="' + (active ? '1' : '0') + '">' +
                    (active ? 'Deactivate' : 'Activate') +
                    '</button>' +
                    '</div>' +
                    '</div>' +
                    '</td>'
                ) : (
                    '<td>' +
                    '<button class="pg-action-split-main" data-view="' + t.id + '" style="border-radius:6px;width:100%;padding:6px 12px;background:#fff;border:1px solid var(--aa-border,#cbd5e1);cursor:pointer;font-weight:600;font-size:12.5px;">View</button>' +
                    '</td>'
                )) +
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
        const info = document.getElementById('paginationInfo');
        const btns = document.getElementById('paginationBtns');
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
            '<div class="pg-view-row"><span>System Access</span><strong style="color:var(--aa-blue,#2563eb)">' + (t.role === 'admin' ? 'Administrator' : (t.role === 'headmaster' ? 'Headmaster' : 'Staff')) + '</strong></div>' +
            '<div class="pg-view-row"><span>Position</span><strong>' + _esc(t.school_position || 'Teacher') + '</strong></div>' +
            '<div class="pg-view-row"><span>Department</span><strong>' + _esc(t.department || '—') + '</strong></div>' +
            (t.class_teacher_of ? '<div class="pg-view-row"><span>Class Teacher</span><strong style="color:var(--aa-blue,#2563eb)">' + _esc(t.class_teacher_of) + '</strong></div>' : '') +
            '<div class="pg-view-row"><span>Email</span><strong>' + _esc(t.email) + '</strong></div>' +
            '<div class="pg-view-row"><span>Subjects</span><strong>' +
            (subjectList.length ? subjectList.join(', ') : '—') + '</strong></div>' +
            '<div class="pg-view-row"><span>Classes</span><strong>' +
            (assigns.length ? [...new Set(assigns.map(function (a) { return a.class_name; }))].join(', ') : '—') +
            '</strong></div>' +
            '</div>' +
            (isAdmin ? (
                '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--aa-border,#e2e8f0);display:flex;justify-content:flex-end;">' +
                '<a href="subject-management.html?teacher_id=' + t.id + '" class="pg-btn-primary" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-size:13px;padding:8px 16px;border-radius:6px;background:#2563EB;color:#fff;">+ Assign to Subject / Class</a>' +
                '</div>'
            ) : '');

        document.getElementById('viewTeacherModal').hidden = false;
    }

    /* ── Add / Edit modal ────────────────────────────────────────── */

    function openAddModal() {
        document.getElementById('editTeacherId').value = '';
        document.getElementById('teacherModalTitle').textContent = 'Add Teacher';
        document.getElementById('fTName').value = '';
        document.getElementById('fTEmail').value = '';
        document.getElementById('fTPhone').value = '';
        document.getElementById('fTSubject').value = '';
        const clsEl = document.getElementById('fTClass');
        if (clsEl) clsEl.value = '';
        const posEl = document.getElementById('fTPosition');
        if (posEl) posEl.value = 'Teacher';
        const roleEl = document.getElementById('fTRole');
        if (roleEl) roleEl.value = 'staff';
        const deptEl = document.getElementById('fTDepartment');
        if (deptEl) deptEl.value = '';
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
        document.getElementById('fTPhone').value = t.phone || '';
        const posEl = document.getElementById('fTPosition');
        if (posEl) posEl.value = t.school_position || 'Teacher';
        const roleEl = document.getElementById('fTRole');
        if (roleEl) roleEl.value = t.role || 'staff';
        const deptEl = document.getElementById('fTDepartment');
        if (deptEl) deptEl.value = t.department || '';
        document.getElementById('passwordGroup').style.display = 'none'; // hide on edit
        // Set primary subject from assignments
        const assigns = allAssignments.filter(function (a) { return a.teacher_id === t.id; });
        if (assigns.length) {
            document.getElementById('fTSubject').value = assigns[0].subject_id || '';
            const clsEl = document.getElementById('fTClass');
            if (clsEl) clsEl.value = assigns[0].class_id || '';
        }
        document.getElementById('teacherModal').hidden = false;
    }

    async function saveTeacher() {
        const id = document.getElementById('editTeacherId').value;
        const btn = document.getElementById('saveTeacherBtn');
        const isEdit = !!id;

        const name = document.getElementById('fTName').value.trim();
        const email = document.getElementById('fTEmail').value.trim();
        const school_position = document.getElementById('fTPosition')?.value || 'Teacher';
        const role = document.getElementById('fTRole')?.value || (isEdit ? undefined : 'staff');
        const department = document.getElementById('fTDepartment')?.value || '';
        const subjectId = document.getElementById('fTSubject').value;
        const classId = document.getElementById('fTClass')?.value || '';

        if (!name || !email) { _toast('Name and email are required.', 'error'); return; }

        btn.disabled = true; btn.textContent = 'Saving…';

        try {
            let res;
            if (isEdit) {
                res = await apiFetch('/api/teachers/' + id, {
                    method: 'PUT',
                    body: JSON.stringify({ name, email, role, school_position, department })
                });
            } else {
                const payload = { name, email, role: role || 'staff', school_position, department };
                if (subjectId && classId) {
                    payload.subject_id = subjectId;
                    payload.class_id = classId;
                }
                res = await apiFetch('/api/teachers', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
            }

            if (!res || !res.ok) {
                const d = await res.json().catch(function () { return {}; });
                throw new Error(d.error || 'Save failed');
            }

            const data = await res.json().catch(function () { return {}; });

            document.getElementById('teacherModal').hidden = true;

            if (isEdit) {
                _toast('Teacher updated.', 'success');
            } else {
                openTempPasswordModal(name, email, data.tempPassword);
                if (subjectId && classId) {
                    _toast('Teacher created and assigned to subject.', 'success');
                } else if (subjectId && !classId) {
                    _toast('Teacher created. Select a class on Subject Management to complete assignment.', 'info');
                }
            }

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

    /* ── Temp password (shown once, right after Add Teacher) ────────── */

    function openTempPasswordModal(name, email, tempPassword) {
        document.getElementById('tpName').value = name || '';
        document.getElementById('tpEmail').textContent = email || '';
        document.getElementById('tpPassword').value = tempPassword || '(email delivery only — not returned by the server)';
        document.getElementById('tempPasswordModal').hidden = false;
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
                const d = await res.json().catch(function () { return {}; });
                const nowActive = d.is_active !== 0;
                _toast(deactivateTargetName + ' has been ' + (nowActive ? 'activated' : 'deactivated') + '.', 'success');
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

        // Temp password modal
        document.getElementById('closeTempPasswordBtn').addEventListener('click', function () { document.getElementById('tempPasswordModal').hidden = true; });
        document.getElementById('closeTempPasswordFooterBtn').addEventListener('click', function () { document.getElementById('tempPasswordModal').hidden = true; });
        document.getElementById('copyTempPasswordBtn').addEventListener('click', function () {
            const field = document.getElementById('tpPassword');
            field.select();
            navigator.clipboard && navigator.clipboard.writeText(field.value).then(function () {
                _toast('Password copied.', 'success');
            }).catch(function () { });
        });

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
        if (window.AANotify && window.AANotify.show) {
            window.AANotify.show(msg, type);
            return;
        }
        const c = document.getElementById('aa-toast-container') || document.getElementById('toast-container');
        if (!c) return;
        const el = document.createElement('div');
        el.className = 'aa-toast aa-toast-' + (type || 'info');
        el.textContent = msg;
        c.appendChild(el);
        setTimeout(function () { el.remove(); }, 4000);
    }

})();