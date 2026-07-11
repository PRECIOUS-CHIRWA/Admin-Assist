(function () {
    let allClasses = [], allTerms = [], allSubjects = [], allTeachers = [];

    document.addEventListener("DOMContentLoaded", async () => {
        await loadMeta();
        await Promise.all([loadSubjects(), loadAssignments()]);
        bindEvents();
    });

    async function loadMeta() {
        try {
            const [cr, tr, teacherRes] = await Promise.all([
                apiFetch("/api/attendance/classes"),
                apiFetch("/api/attendance/terms"),
                apiFetch("/api/users?role=teacher"),
            ]);
            allClasses = await cr.json();
            allTerms = await tr.json();
            allTeachers = (await teacherRes.json()) || [];

            const years = [...new Map(allTerms.map((t) => [t.academic_year_id, { id: t.academic_year_id, label: t.year_label }])).values()];

            populateSelect("filterAssignClass", allClasses, "id", classLabel, "All Classes");
            populateSelect("filterAssignYear", years, "id", (y) => y.label, "All Years");
            populateSelect("aTeacher", allTeachers, "id", (u) => u.name, "Select Teacher…");
            populateSelect("aClass", allClasses, "id", classLabel, "Select Class…");
            populateSelect("aYear", years, "id", (y) => y.label, "Select Year…");
        } catch (err) { console.error(err); }
    }

    // ─── Subjects ─────────────────────────────────────────────────
    async function loadSubjects() {
        try {
            const res = await apiFetch("/api/subjects");
            allSubjects = await res.json();
            renderSubjects(allSubjects);
            populateSelect("aSubject", allSubjects.filter((s) => s.is_active), "id", (s) => `${s.subject_code} — ${s.subject_name}`, "Select Subject…");
        } catch (err) { console.error(err); }
    }

    function renderSubjects(subjects) {
        const tbody = document.getElementById("subjectBody");
        const empty = document.getElementById("subjectEmpty");
        document.getElementById("subjectCount").textContent = subjects.length;
        if (!subjects.length) { tbody.innerHTML = ""; empty.hidden = false; return; }
        empty.hidden = true;

        tbody.innerHTML = subjects.map((s) => `
      <tr>
        <td><strong>${esc(s.subject_code)}</strong></td>
        <td>${esc(s.subject_name)}</td>
        <td><span class="aa-status-pill aa-status-${s.is_active ? "active" : "inactive"}">${s.is_active ? "Active" : "Inactive"}</span></td>
        <td>${s.teacher_assignments || 0}</td>
        <td class="aa-table-actions">
          <button class="aa-link-btn" data-edit='${JSON.stringify(s)}'>Edit</button>
          <button class="aa-link-btn aa-link-danger" data-toggle="${s.id}" data-active="${s.is_active}">${s.is_active ? "Deactivate" : "Activate"}</button>
        </td>
      </tr>`).join("");

        tbody.querySelectorAll("[data-edit]").forEach((btn) =>
            btn.addEventListener("click", () => openEditSubject(JSON.parse(btn.dataset.edit)))
        );
        tbody.querySelectorAll("[data-toggle]").forEach((btn) =>
            btn.addEventListener("click", () => toggleSubject(btn.dataset.toggle, btn.dataset.active === "1"))
        );
    }

    function openAddSubject() {
        document.getElementById("editSubjectId").value = "";
        document.getElementById("subjectModalTitle").textContent = "Add Subject";
        ["fCode", "fName", "fDesc"].forEach((id) => document.getElementById(id).value = "");
        document.getElementById("subjectModal").hidden = false;
    }

    function openEditSubject(s) {
        document.getElementById("editSubjectId").value = s.id;
        document.getElementById("subjectModalTitle").textContent = "Edit Subject";
        document.getElementById("fCode").value = s.subject_code;
        document.getElementById("fName").value = s.subject_name;
        document.getElementById("fDesc").value = s.description || "";
        document.getElementById("subjectModal").hidden = false;
    }

    async function saveSubject() {
        const id = document.getElementById("editSubjectId").value;
        const code = document.getElementById("fCode").value.trim().toUpperCase();
        const name = document.getElementById("fName").value.trim();
        const desc = document.getElementById("fDesc").value.trim();
        if (!code || !name) return alert("Subject code and name are required.");

        const btn = document.getElementById("saveSubjectBtn");
        btn.disabled = true; btn.textContent = "Saving…";
        try {
            const res = await apiFetch(id ? `/api/subjects/${id}` : "/api/subjects", {
                method: id ? "PUT" : "POST",
                body: JSON.stringify({ subject_code: code, subject_name: name, description: desc }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            document.getElementById("subjectModal").hidden = true;
            await loadSubjects();
        } catch (err) { alert(err.message || "Failed to save subject."); }
        finally { btn.disabled = false; btn.textContent = "Save Subject"; }
    }

    async function toggleSubject(id, currentlyActive) {
        const action = currentlyActive ? "deactivate" : "activate";
        if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this subject?`)) return;
        try {
            await apiFetch(`/api/subjects/${id}`, { method: "PUT", body: JSON.stringify({ is_active: currentlyActive ? 0 : 1 }) });
            await loadSubjects();
        } catch { alert("Failed to update subject."); }
    }

    // ─── Assignments ──────────────────────────────────────────────
    async function loadAssignments() {
        const p = new URLSearchParams();
        if (document.getElementById("filterAssignClass").value) p.set("class_id", document.getElementById("filterAssignClass").value);
        if (document.getElementById("filterAssignYear").value) p.set("academic_year_id", document.getElementById("filterAssignYear").value);
        try {
            const res = await apiFetch(`/api/subjects/assignments/list?${p}`);
            const rows = await res.json();
            renderAssignments(rows);
        } catch (err) { console.error(err); }
    }

    function renderAssignments(rows) {
        const tbody = document.getElementById("assignBody");
        const empty = document.getElementById("assignEmpty");
        document.getElementById("assignCount").textContent = rows.length;
        if (!rows.length) { tbody.innerHTML = ""; empty.hidden = false; return; }
        empty.hidden = true;

        tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>${esc(r.teacher_name)}</td>
        <td>${esc(r.subject_name)}</td>
        <td>${esc(r.class_name)}</td>
        <td>${esc(r.year_label)}</td>
        <td class="aa-table-actions">
          <button class="aa-link-btn aa-link-danger" data-rem="${r.id}">Remove</button>
        </td>
      </tr>`).join("");

        tbody.querySelectorAll("[data-rem]").forEach((btn) =>
            btn.addEventListener("click", () => removeAssignment(btn.dataset.rem))
        );
    }

    async function saveAssignment() {
        const payload = {
            teacher_id: document.getElementById("aTeacher").value,
            subject_id: document.getElementById("aSubject").value,
            class_id: document.getElementById("aClass").value,
            academic_year_id: document.getElementById("aYear").value,
        };
        if (!payload.teacher_id || !payload.subject_id || !payload.class_id || !payload.academic_year_id)
            return alert("All fields are required.");

        const btn = document.getElementById("saveAssignBtn");
        btn.disabled = true; btn.textContent = "Assigning…";
        try {
            const res = await apiFetch("/api/subjects/assign", { method: "POST", body: JSON.stringify(payload) });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            document.getElementById("assignModal").hidden = true;
            await loadAssignments();
        } catch (err) { alert(err.message || "Failed to assign teacher."); }
        finally { btn.disabled = false; btn.textContent = "Assign"; }
    }

    async function removeAssignment(id) {
        if (!confirm("Remove this teacher assignment?")) return;
        try {
            await apiFetch(`/api/subjects/assign/${id}`, { method: "DELETE" });
            await loadAssignments();
        } catch { alert("Unable to remove assignment."); }
    }

    // ─── Bind events ─────────────────────────────────────────────
    function bindEvents() {
        document.getElementById("addSubjectBtn").addEventListener("click", openAddSubject);
        document.getElementById("closeSubjectModal").addEventListener("click", () => document.getElementById("subjectModal").hidden = true);
        document.getElementById("cancelSubjectBtn").addEventListener("click", () => document.getElementById("subjectModal").hidden = true);
        document.getElementById("saveSubjectBtn").addEventListener("click", saveSubject);

        document.getElementById("assignBtn").addEventListener("click", () => document.getElementById("assignModal").hidden = false);
        document.getElementById("closeAssignModal").addEventListener("click", () => document.getElementById("assignModal").hidden = true);
        document.getElementById("cancelAssignBtn").addEventListener("click", () => document.getElementById("assignModal").hidden = true);
        document.getElementById("saveAssignBtn").addEventListener("click", saveAssignment);

        ["filterAssignClass", "filterAssignYear"].forEach((id) =>
            document.getElementById(id).addEventListener("change", loadAssignments)
        );
    }

    function classLabel(c) { return c.class_name || `${c.grade_level}${c.stream ? " " + c.stream : ""}`; }
    function populateSelect(id, items, valKey, labelFn, placeholder) {
        const s = document.getElementById(id); if (!s) return;
        s.innerHTML = `<option value="">${placeholder}</option>` +
            items.map((i) => `<option value="${i[valKey]}">${esc(labelFn(i))}</option>`).join("");
    }
    const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
})();