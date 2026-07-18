(function () {
    document.addEventListener("DOMContentLoaded", async () => {
        await loadMeta();
        await loadSummary();
        bindEvents();
    });

    async function loadMeta() {
        try {
            const [cr, tr] = await Promise.all([
                apiFetch("/api/attendance/classes"),
                apiFetch("/api/attendance/terms"),
            ]);
            const classes = await cr.json();
            const terms = await tr.json();
            const years = [...new Map(terms.map((t) => [t.academic_year_id, { id: t.academic_year_id, label: t.year_label }])).values()];

            populateSelect("filterClass", classes, "id", (c) => c.class_name || `${c.grade_level}${c.stream ? " " + c.stream : ""}`, "All Classes");
            populateSelect("filterTerm", terms, "id", (t) => `${t.term_name} (${t.year_label})`, "All Terms");
            populateSelect("filterYear", years, "id", (y) => y.label, "All Years");
        } catch (err) { console.error(err); }
    }

    async function loadSummary() {
        try {
            const res = await apiFetch("/api/reports/summary");
            const data = await res.json();
            document.getElementById("kpiStudents").textContent = data.total_students || 0;
            document.getElementById("kpiClasses").textContent = data.total_classes || 0;
            document.getElementById("kpiAttendance").textContent = `${data.overall_attendance_rate || 0}%`;
            document.getElementById("kpiAvg").textContent = `${data.overall_average || 0}%`;
            document.getElementById("kpiPass").textContent = `${data.pass_rate || 0}%`;
        } catch (err) { console.error(err); }
    }

    function buildParams() {
        const p = new URLSearchParams({ format: "csv" });
        const classId = document.getElementById("filterClass").value;
        const termId = document.getElementById("filterTerm").value;
        const yearId = document.getElementById("filterYear").value;
        if (classId) p.set("class_id", classId);
        if (termId) p.set("term_id", termId);
        if (yearId) p.set("academic_year_id", yearId);
        return p;
    }

    async function download(endpoint, filename) {
        showStatus("Preparing download…", "info");
        try {
            const res = await apiFetch(`${endpoint}?${buildParams()}`);
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            const csv = await res.text();
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = filename; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showStatus("Download started.", "success");
        } catch (err) {
            showStatus(err.message || "Download failed.", "danger");
        }
    }

    function bindEvents() {
        document.getElementById("dlEnrollBtn").addEventListener("click", () =>
            download("/api/reports/enrollment", "enrollment_report.csv")
        );
        document.getElementById("dlAttendBtn").addEventListener("click", () =>
            download("/api/reports/attendance", "attendance_report.csv")
        );
        document.getElementById("dlAcadBtn").addEventListener("click", () =>
            download("/api/reports/academic", "academic_report.csv")
        );
    }

    function showStatus(msg, type) {
        const el = document.getElementById("statusMsg");
        el.textContent = msg;
        el.className = `aa-alert aa-alert-${type}`;
        el.hidden = false;
        if (type === "success") setTimeout(() => { el.hidden = true; }, 4000);
    }

    function populateSelect(id, items, valKey, labelFn, placeholder) {
        const s = document.getElementById(id); if (!s) return;
        s.innerHTML = `<option value="">${placeholder}</option>` +
            items.map((i) => `<option value="${i[valKey]}">${String(labelFn(i)).replaceAll("&", "&amp;")}</option>`).join("");
    }
})();