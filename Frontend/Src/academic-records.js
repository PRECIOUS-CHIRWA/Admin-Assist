(function () {
    let allClasses = [], allSubjects = [], allTerms = [], allStudents = [];

    document.addEventListener("DOMContentLoaded", async () => {
        await loadMeta();
        await loadResults();
        await loadStats();
        bindEvents();
    });

    // ─── ECZ Grade (mirrors backend logic) ──────────────────────
    function eczGrade(pct) {
        if (pct >= 75) return "Distinction 1";
        if (pct >= 70) return "Distinction 2";
        if (pct >= 64) return "Merit";
        if (pct >= 60) return "Merit (B)";
        if (pct >= 54) return "Credit";
        if (pct >= 50) return "Credit (6)";
        if (pct >= 40) return "Satisfactory";
        if (pct >= 30) return "Satisfactory (8)";
        return "Fail";
    }

    // ─── Meta ────────────────────────────────────────────────────
    async function loadMeta() {
        try {
            const [cr, sr, tr, stR] = await Promise.all([
                apiFetch("/api/attendance/classes"),
                apiFetch("/api/subjects?is_active=1"),
                apiFetch("/api/attendance/terms"),
                apiFetch("/api/search/students"),
            ]);
            allClasses = await cr.json();
            allSubjects = await sr.json();
            allTerms = await tr.json();
            const sd = await stR.json();
            allStudents = sd.students || [];

            populateSelect("filterClass", allClasses, "id", (c) => c.class_name || `${c.grade_level}${c.stream ? " " + c.stream : ""}`, "All Classes");
            populateSelect("filterSubject", allSubjects, "id", (s) => s.subject_name, "All Subjects");
            populateSelect("filterTerm", allTerms, "id", (t) => `${t.term_name} (${t.year_label})`, "All Terms");

            populateSelect("fClass", allClasses, "id", (c) => c.class_name || `${c.grade_level}${c.stream ? " " + c.stream : ""}`, "Select Class…");
            populateSelect("fSubject", allSubjects, "id", (s) => s.subject_name, "Select Subject…");
            populateSelect("fTerm", allTerms, "id", (t) => `${t.term_name} (${t.year_label})`, "Select Term…");
            populateSelect("fStudent", allStudents, "id", (s) => `${s.last_name}, ${s.first_name} (${s.admission_number})`, "Select Student…");

            const current = allTerms.find((t) => t.is_current);
            if (current) document.getElementById("filterTerm").value = current.id;
        } catch (err) { console.error(err); }
    }

    // ─── Results table ───────────────────────────────────────────
    async function loadResults() {
        const p = new URLSearchParams();
        const v = (id) => document.getElementById(id).value;
        if (v("filterClass")) p.set("class_id", v("filterClass"));
        if (v("filterSubject")) p.set("subject_id", v("filterSubject"));
        if (v("filterTerm")) p.set("term_id", v("filterTerm"));
        try {
            const res = await apiFetch(`/api/results?${p}`);
            const rows = await res.json();
            renderTable(rows);
        } catch (err) { console.error(err); }
    }

    function renderTable(rows) {
        const tbody = document.getElementById("tableBody");
        const empty = document.getElementById("emptyState");
        document.getElementById("countBadge").textContent = `${rows.length} result${rows.length !== 1 ? "s" : ""}`;
        if (!rows.length) { tbody.innerHTML = ""; empty.hidden = false; return; }
        empty.hidden = true;

        tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>${esc(r.first_name)} ${esc(r.last_name)}</td>
        <td>${esc(r.admission_number)}</td>
        <td>${esc(r.class_name)}</td>
        <td>${esc(r.subject_name)}</td>
        <td>${r.test_mark}</td>
        <td>${r.assignment_mark}</td>
        <td>${r.exam_mark}</td>
        <td>${r.total_marks}</td>
        <td>${parseFloat(r.percentage).toFixed(1)}%</td>
        <td><span class="aa-grade-pill">${esc(r.grade_classification)}</span></td>
        <td>${r.class_position || "—"}</td>
        <td class="aa-table-actions">
          <button class="aa-link-btn" data-edit='${JSON.stringify(r)}'>Edit</button>
          <button class="aa-link-btn aa-link-danger" data-del="${r.id}">Delete</button>
        </td>
      </tr>`).join("");

        tbody.querySelectorAll("[data-edit]").forEach((btn) =>
            btn.addEventListener("click", () => openEdit(JSON.parse(btn.dataset.edit)))
        );
        tbody.querySelectorAll("[data-del]").forEach((btn) =>
            btn.addEventListener("click", () => deleteResult(btn.dataset.del))
        );
    }

    async function loadStats() {
        try {
            const res = await apiFetch("/api/results/analytics/summary");
            const data = await res.json();
            document.getElementById("statTotal").textContent = data.overall?.total_entries || 0;
            document.getElementById("statAvg").textContent = `${parseFloat(data.overall?.overall_average || 0).toFixed(1)}%`;
            document.getElementById("statPass").textContent = `${data.overall?.pass_rate || 0}%`;
            document.getElementById("statFail").textContent = data.overall?.failures || 0;
        } catch { /* non-critical */ }
    }

    // ─── Modal ───────────────────────────────────────────────────
    function openAdd() {
        document.getElementById("editingId").value = "";
        document.getElementById("modalTitle").textContent = "Add Result";
        ["fStudent", "fSubject", "fClass", "fTerm", "fTest", "fAssign", "fExam", "fComment"].forEach((id) => {
            const el = document.getElementById(id); if (el) el.value = "";
        });
        document.getElementById("fTotalPreview").value = "";
        document.getElementById("resultModal").hidden = false;
    }

    function openEdit(r) {
        document.getElementById("editingId").value = r.id;
        document.getElementById("modalTitle").textContent = "Edit Result";
        document.getElementById("fStudent").value = r.student_id;
        document.getElementById("fSubject").value = r.subject_id;
        document.getElementById("fClass").value = r.class_id;
        document.getElementById("fTerm").value = r.term_id;
        document.getElementById("fTest").value = r.test_mark;
        document.getElementById("fAssign").value = r.assignment_mark;
        document.getElementById("fExam").value = r.exam_mark;
        document.getElementById("fComment").value = r.teacher_comment || "";
        updatePreview();
        document.getElementById("resultModal").hidden = false;
    }

    function updatePreview() {
        const t = parseFloat(document.getElementById("fTest").value || 0);
        const a = parseFloat(document.getElementById("fAssign").value || 0);
        const e = parseFloat(document.getElementById("fExam").value || 0);
        const total = t + a + e;
        const pct = Math.min(total, 100);
        document.getElementById("fTotalPreview").value = `${total} / 100 → ${pct.toFixed(1)}% → ${eczGrade(pct)}`;
    }

    function closeModal() { document.getElementById("resultModal").hidden = true; }

    async function saveResult() {
        const id = document.getElementById("editingId").value;
        const isEdit = !!id;
        const payload = {
            student_id: document.getElementById("fStudent").value,
            subject_id: document.getElementById("fSubject").value,
            class_id: document.getElementById("fClass").value,
            term_id: document.getElementById("fTerm").value,
            test_mark: parseFloat(document.getElementById("fTest").value || 0),
            assignment_mark: parseFloat(document.getElementById("fAssign").value || 0),
            exam_mark: parseFloat(document.getElementById("fExam").value || 0),
            teacher_comment: document.getElementById("fComment").value || null,
        };

        // Auto-set academic_year_id from selected term
        const term = allTerms.find((t) => String(t.id) === String(payload.term_id));
        if (term) payload.academic_year_id = term.academic_year_id;

        if (!payload.student_id || !payload.subject_id || !payload.class_id || !payload.term_id) {
            return alert("Please fill in all required fields.");
        }

        const btn = document.getElementById("saveResultBtn");
        btn.disabled = true; btn.textContent = "Saving…";

        try {
            const res = await apiFetch(isEdit ? `/api/results/${id}` : "/api/results", {
                method: isEdit ? "PUT" : "POST",
                body: JSON.stringify(payload),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            closeModal();
            await loadResults();
            await loadStats();
        } catch (err) {
            alert(err.message || "Failed to save result.");
        } finally {
            btn.disabled = false; btn.textContent = "Save Result";
        }
    }

    async function deleteResult(id) {
        if (!confirm("Delete this result? This cannot be undone.")) return;
        try {
            await apiFetch(`/api/results/${id}`, { method: "DELETE" });
            await loadResults();
            await loadStats();
        } catch { alert("Unable to delete result."); }
    }

    // ─── Events ──────────────────────────────────────────────────
    function bindEvents() {
        document.getElementById("addResultBtn").addEventListener("click", openAdd);
        document.getElementById("addResultBtnEmpty")?.addEventListener("click", openAdd);
        document.getElementById("closeModalBtn").addEventListener("click", closeModal);
        document.getElementById("cancelModalBtn").addEventListener("click", closeModal);
        document.getElementById("saveResultBtn").addEventListener("click", saveResult);
        document.getElementById("resultModal").addEventListener("click", (e) => {
            if (e.target.id === "resultModal") closeModal();
        });

        ["fTest", "fAssign", "fExam"].forEach((id) =>
            document.getElementById(id).addEventListener("input", updatePreview)
        );

        ["filterClass", "filterSubject", "filterTerm"].forEach((id) =>
            document.getElementById(id).addEventListener("change", loadResults)
        );
        document.getElementById("clearBtn").addEventListener("click", () => {
            ["filterClass", "filterSubject", "filterTerm"].forEach((id) => document.getElementById(id).value = "");
            loadResults();
        });
    }

    function populateSelect(id, items, valKey, labelFn, placeholder) {
        const s = document.getElementById(id); if (!s) return;
        s.innerHTML = `<option value="">${placeholder}</option>` +
            items.map((i) => `<option value="${i[valKey]}">${esc(labelFn(i))}</option>`).join("");
    }
    const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
})();