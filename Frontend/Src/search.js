(function () {
    let searchTimer = null;

    document.addEventListener("DOMContentLoaded", async () => {
        await loadClasses();
        bindEvents();
    });

    async function loadClasses() {
        try {
            const res = await apiFetch("/api/attendance/classes");
            const classes = await res.json();
            const sel = document.getElementById("filterClass");
            sel.innerHTML = `<option value="">All Classes</option>` +
                classes.map((c) => `<option value="${c.id}">${esc(c.class_name || `${c.grade_level}${c.stream ? " " + c.stream : ""}`)}</option>`).join("");
        } catch (err) { console.error(err); }
    }

    function bindEvents() {
        const input = document.getElementById("searchInput");
        const btn = document.getElementById("searchBtn");

        // Live search on input
        input.addEventListener("input", () => {
            clearTimeout(searchTimer);
            const q = input.value.trim();
            if (q.length < 2) { showPlaceholder(); return; }
            searchTimer = setTimeout(() => doSearch(q), 350);
        });

        // Button search
        btn.addEventListener("click", () => {
            const q = input.value.trim();
            if (q.length >= 2) doSearch(q);
        });

        // Enter key
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                clearTimeout(searchTimer);
                const q = input.value.trim();
                if (q.length >= 2) doSearch(q);
            }
        });

        // Filters apply to student-only search
        ["filterClass", "filterGender"].forEach((id) => {
            document.getElementById(id).addEventListener("change", () => {
                const q = input.value.trim();
                if (q.length >= 2) doSearch(q);
                else doStudentSearch(q);
            });
        });

        document.getElementById("clearFilters").addEventListener("click", () => {
            document.getElementById("filterClass").value = "";
            document.getElementById("filterGender").value = "";
            const q = input.value.trim();
            if (q.length >= 2) doSearch(q);
        });
    }

    async function doSearch(q) {
        const type = document.querySelector("input[name=searchType]:checked").value;

        // If filters are active, do student-specific search
        const classId = document.getElementById("filterClass").value;
        const gender = document.getElementById("filterGender").value;
        if ((classId || gender) && (type === "all" || type === "students")) {
            return doStudentSearch(q);
        }

        try {
            const p = new URLSearchParams({ q, type });
            const res = await apiFetch(`/api/search?${p}`);
            if (!res.ok) throw new Error("Search failed");
            const data = await res.json();
            renderResults(data, q);
        } catch (err) {
            renderError(err.message);
        }
    }

    async function doStudentSearch(q) {
        const p = new URLSearchParams();
        if (q) p.set("q", q);
        if (document.getElementById("filterClass").value) p.set("class_id", document.getElementById("filterClass").value);
        if (document.getElementById("filterGender").value) p.set("gender", document.getElementById("filterGender").value);

        try {
            const res = await apiFetch(`/api/search/students?${p}`);
            const data = await res.json();
            renderResults({ students: data.students, classes: [], subjects: [] }, q);
        } catch (err) {
            renderError(err.message);
        }
    }

    function renderResults(data, q) {
        const area = document.getElementById("resultsArea");
        const students = data.students || [];
        const classes = data.classes || [];
        const subjects = data.subjects || [];
        const total = students.length + classes.length + subjects.length;

        if (!total) {
            area.innerHTML = `<div class="aa-no-results"><strong>No results for "${esc(q)}"</strong><br><span style="font-size:.875rem;color:var(--aa-text-muted)">Try a different spelling or fewer words.</span></div>`;
            return;
        }

        let html = `<p style="font-size:.825rem;color:var(--aa-text-muted);margin:0 0 1rem">${total} result${total !== 1 ? "s" : ""} for <strong>"${esc(q)}"</strong></p>`;

        if (students.length) {
            html += `<section class="aa-result-section">
        <h3>Students (${students.length})</h3>
        <div class="aa-card" style="padding:0">
          <div class="aa-table-wrap">
            <table class="aa-table">
              <thead><tr><th>Adm No</th><th>Name</th><th>Class</th><th>Gender</th><th>Actions</th></tr></thead>
              <tbody>${students.map((s) => `
                <tr>
                  <td>${esc(s.admission_number)}</td>
                  <td>${esc(s.first_name)} ${esc(s.last_name)}</td>
                  <td>${esc(s.class_name || "—")}</td>
                  <td>${esc(s.gender || "—")}</td>
                  <td class="aa-table-actions">
                    <a class="aa-link-btn" href="student-transcript.html?studentId=${s.id}">Transcript</a>
                    <a class="aa-link-btn" href="academic-records.html">Results</a>
                  </td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </section>`;
        }

        if (classes.length) {
            html += `<section class="aa-result-section">
        <h3>Classes (${classes.length})</h3>
        <div class="aa-card" style="padding:0">
          <div class="aa-table-wrap">
            <table class="aa-table">
              <thead><tr><th>Class</th><th>Grade Level</th><th>Stream</th></tr></thead>
              <tbody>${classes.map((c) => `
                <tr>
                  <td>${esc(c.class_name)}</td>
                  <td>${esc(c.grade_level)}</td>
                  <td>${esc(c.stream || "—")}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </section>`;
        }

        if (subjects.length) {
            html += `<section class="aa-result-section">
        <h3>Subjects (${subjects.length})</h3>
        <div class="aa-card" style="padding:0">
          <div class="aa-table-wrap">
            <table class="aa-table">
              <thead><tr><th>Code</th><th>Subject Name</th></tr></thead>
              <tbody>${subjects.map((s) => `
                <tr>
                  <td><strong>${esc(s.subject_code)}</strong></td>
                  <td>${esc(s.subject_name)}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </section>`;
        }

        area.innerHTML = html;
    }

    function showPlaceholder() {
        document.getElementById("resultsArea").innerHTML = `
      <div class="aa-empty-state" id="placeholder">
        <h3>Start typing to search</h3>
        <p>Results appear as you type. Minimum 2 characters.</p>
      </div>`;
    }

    function renderError(msg) {
        document.getElementById("resultsArea").innerHTML =
            `<div class="aa-alert aa-alert-danger">${esc(msg || "Search failed. Please try again.")}</div>`;
    }

    const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
})();