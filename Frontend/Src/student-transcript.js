(function () {
    let searchTimer = null;

    document.addEventListener("DOMContentLoaded", async () => {
        await loadYears();
        bindEvents();
    });

    async function loadYears() {
        try {
            const res = await apiFetch("/api/attendance/terms");
            const terms = await res.json();
            const years = [...new Map(terms.map((t) => [t.academic_year_id, { id: t.academic_year_id, label: t.year_label }])).values()];
            const sel = document.getElementById("yearFilter");
            sel.innerHTML = `<option value="">All Years</option>` +
                years.map((y) => `<option value="${y.id}">${esc(y.label)}</option>`).join("");
        } catch (err) { console.error(err); }
    }

    function bindEvents() {
        const input = document.getElementById("studentSearch");
        input.addEventListener("input", () => {
            clearTimeout(searchTimer);
            const q = input.value.trim();
            if (q.length < 2) { hideSuggestions(); return; }
            searchTimer = setTimeout(() => searchStudents(q), 300);
        });

        input.addEventListener("keydown", (e) => {
            if (e.key === "Escape") hideSuggestions();
        });

        document.addEventListener("click", (e) => {
            if (!document.getElementById("suggestions").contains(e.target) && e.target !== input) hideSuggestions();
        });

        document.getElementById("yearFilter").addEventListener("change", () => {
            const selectedId = document.getElementById("transcriptCard").dataset.studentId;
            if (selectedId) loadTranscript(selectedId);
        });

        document.getElementById("printBtn").addEventListener("click", () => window.print());
    }

    async function searchStudents(q) {
        try {
            const res = await apiFetch(`/api/search/students?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            showSuggestions(data.students || []);
        } catch (err) { console.error(err); }
    }

    function showSuggestions(students) {
        const box = document.getElementById("suggestions");
        const list = document.getElementById("suggestionsList");

        if (!students.length) {
            list.innerHTML = `<div style="padding:.75rem 1rem;color:var(--aa-text-muted);font-size:.875rem">No students found.</div>`;
            box.style.display = "block"; return;
        }

        list.innerHTML = students.map((s) => `
      <div class="aa-suggestion-item" data-id="${s.id}" style="padding:.65rem 1rem;cursor:pointer;border-bottom:1px solid var(--aa-border);font-size:.875rem;display:flex;justify-content:space-between;align-items:center">
        <span><strong>${esc(s.last_name)}, ${esc(s.first_name)}</strong></span>
        <span style="color:var(--aa-text-muted)">${esc(s.admission_number)} &nbsp;·&nbsp; ${esc(s.class_name || "No class")}</span>
      </div>`).join("");

        list.querySelectorAll(".aa-suggestion-item").forEach((item) => {
            item.addEventListener("mouseenter", () => item.style.background = "var(--aa-bg)");
            item.addEventListener("mouseleave", () => item.style.background = "");
            item.addEventListener("click", () => selectStudent(item.dataset.id, students.find((s) => String(s.id) === item.dataset.id)));
        });
        box.style.display = "block";
    }

    function hideSuggestions() {
        document.getElementById("suggestions").style.display = "none";
    }

    function selectStudent(id, student) {
        hideSuggestions();
        document.getElementById("studentSearch").value = student
            ? `${student.last_name}, ${student.first_name} (${student.admission_number})`
            : id;
        loadTranscript(id);
    }

    async function loadTranscript(studentId) {
        const yearId = document.getElementById("yearFilter").value;
        const p = yearId ? `?academic_year_id=${yearId}` : "";
        try {
            const res = await apiFetch(`/api/results/transcript/${studentId}${p}`);
            if (!res.ok) throw new Error("Unable to load transcript");
            const data = await res.json();
            renderTranscript(data, studentId);
        } catch (err) { alert(err.message || "Failed to load transcript."); }
    }

    function renderTranscript({ student, terms, generated_at }, studentId) {
        const card = document.getElementById("transcriptCard");
        const blank = document.getElementById("placeholderState");
        card.dataset.studentId = studentId;

        if (!terms.length) {
            card.innerHTML = `<p class="aa-empty-state" style="padding:2rem"><span style="font-size:1rem;font-weight:600">No results recorded</span><br><span style="color:var(--aa-text-muted)">No academic results found for this student.</span></p>`;
            card.hidden = false; blank.hidden = true; return;
        }

        const termBlocks = terms.map((t) => `
      <div class="transcript-term">
        <h3>${esc(t.term_name)} — ${esc(t.year_label)}</h3>
        <div class="aa-table-wrap">
          <table class="aa-table">
            <thead>
              <tr><th>Subject</th><th>Test</th><th>Assign</th><th>Exam</th><th>Total</th><th>%</th><th>Grade</th><th>Position</th><th>Remarks</th></tr>
            </thead>
            <tbody>
              ${t.subjects.map((r) => `
                <tr>
                  <td>${esc(r.subject_name)}</td>
                  <td>${r.test_mark}</td>
                  <td>${r.assignment_mark}</td>
                  <td>${r.exam_mark}</td>
                  <td>${r.total_marks}</td>
                  <td>${parseFloat(r.percentage).toFixed(1)}%</td>
                  <td><span class="aa-grade-pill">${esc(r.grade_classification)}</span></td>
                  <td>${r.class_position || "—"}</td>
                  <td>${esc(r.remarks)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div class="transcript-avg">Term Average: ${t.average_percentage}%</div>
      </div>`).join("");

        card.innerHTML = `
      <div class="transcript-header">
        <h2>${esc(student.first_name)} ${esc(student.last_name)}</h2>
        <p>Admission No: ${esc(student.admission_number)} &nbsp;·&nbsp; Class: ${esc(student.class_name || "Not assigned")} &nbsp;·&nbsp; Generated: ${new Date(generated_at).toLocaleDateString("en-GB")}</p>
      </div>
      ${termBlocks}`;

        card.hidden = false;
        blank.hidden = true;
    }

    const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
})();