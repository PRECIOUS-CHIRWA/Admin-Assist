(function () {
    document.addEventListener("DOMContentLoaded", async () => {
        await loadMeta();
        await loadSummary();
        bindEvents();
    });

    async function loadMeta() {
        try {
            const [cr, tr] = await Promise.all([apiFetch("/api/attendance/classes"), apiFetch("/api/attendance/terms")]);
            const classes = await cr.json();
            const terms = await tr.json();
            populateSelect("filterClass", classes, "id", (c) => c.class_name || `${c.grade_level}${c.stream ? " " + c.stream : ""}`, "All Classes");
            populateSelect("filterTerm", terms, "id", (t) => `${t.term_name} (${t.year_label})`, "All Terms");

            // Unique years
            const years = [...new Map(terms.map((t) => [t.academic_year_id, { id: t.academic_year_id, label: t.year_label }])).values()];
            populateSelect("filterYear", years, "id", (y) => y.label, "All Years");

            const current = terms.find((t) => t.is_current);
            if (current) { document.getElementById("filterTerm").value = current.id; document.getElementById("filterYear").value = current.academic_year_id; }
        } catch (err) { console.error(err); }
    }

    async function loadSummary() {
        const p = new URLSearchParams();
        if (document.getElementById("filterClass").value) p.set("class_id", document.getElementById("filterClass").value);
        if (document.getElementById("filterTerm").value) p.set("term_id", document.getElementById("filterTerm").value);
        if (document.getElementById("filterYear").value) p.set("academic_year_id", document.getElementById("filterYear").value);

        try {
            const res = await apiFetch(`/api/attendance/summary?${p}`);
            const rows = await res.json();
            renderStats(rows);
            renderTable(rows);
        } catch (err) { console.error(err); }
    }

    function renderStats(rows) {
        const total = rows.length;
        const atRisk = rows.filter((r) => parseFloat(r.attendance_rate) < 75).length;
        const excel = rows.filter((r) => parseFloat(r.attendance_rate) >= 90).length;
        const avg = total ? (rows.reduce((s, r) => s + parseFloat(r.attendance_rate || 0), 0) / total).toFixed(1) : 0;
        document.getElementById("statTotal").textContent = total;
        document.getElementById("statAvg").textContent = `${avg}%`;
        document.getElementById("statAtRisk").textContent = atRisk;
        document.getElementById("statExcellent").textContent = excel;
    }

    function renderTable(rows) {
        const tbody = document.getElementById("tableBody");
        const empty = document.getElementById("emptyState");
        document.getElementById("countBadge").textContent = `${rows.length} student${rows.length !== 1 ? "s" : ""}`;

        if (!rows.length) { tbody.innerHTML = ""; empty.hidden = false; return; }
        empty.hidden = true;

        tbody.innerHTML = rows.map((r) => {
            const rate = parseFloat(r.attendance_rate || 0);
            const cls = rate >= 90 ? "aa-rate-good" : rate >= 75 ? "aa-rate-ok" : "aa-rate-low";
            return `<tr>
        <td>${esc(r.admission_number)}</td>
        <td>${esc(r.first_name)} ${esc(r.last_name)}</td>
        <td>${esc(r.class_name || "—")}</td>
        <td>${r.total_sessions}</td>
        <td>${r.present}</td>
        <td>${r.absent}</td>
        <td>${r.late}</td>
        <td>${r.excused}</td>
        <td><span class="aa-rate-pill ${cls}">${rate}%</span></td>
      </tr>`;
        }).join("");
    }

    function bindEvents() {
        ["filterClass", "filterTerm", "filterYear"].forEach((id) =>
            document.getElementById(id).addEventListener("change", loadSummary)
        );
        document.getElementById("clearBtn").addEventListener("click", () => {
            ["filterClass", "filterTerm", "filterYear"].forEach((id) => document.getElementById(id).value = "");
            loadSummary();
        });
    }

    function populateSelect(id, items, valKey, labelFn, placeholder) {
        const s = document.getElementById(id); if (!s) return;
        s.innerHTML = `<option value="">${placeholder}</option>` + items.map((i) => `<option value="${i[valKey]}">${esc(labelFn(i))}</option>`).join("");
    }
    const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
})();