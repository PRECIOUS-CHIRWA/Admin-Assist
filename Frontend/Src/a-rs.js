(function () {
    document.addEventListener("DOMContentLoaded", async () => {
        await loadMeta();
        document.getElementById("dlSummaryBtn").addEventListener("click", () => download("summary"));
        document.getElementById("dlSessionsBtn").addEventListener("click", () => download("sessions"));
    });

    async function loadMeta() {
        try {
            const [cr, tr] = await Promise.all([apiFetch("/api/attendance/classes"), apiFetch("/api/attendance/terms")]);
            const classes = await cr.json();
            const terms = await tr.json();
            populateSelect("filterClass", classes, "id", (c) => c.class_name || `${c.grade_level}${c.stream ? " " + c.stream : ""}`, "All Classes");
            populateSelect("filterTerm", terms, "id", (t) => `${t.term_name} (${t.year_label})`, "All Terms");
            const years = [...new Map(terms.map((t) => [t.academic_year_id, { id: t.academic_year_id, label: t.year_label }])).values()];
            populateSelect("filterYear", years, "id", (y) => y.label, "All Years");
        } catch (err) { console.error(err); }
    }

    async function download(type) {
        const p = new URLSearchParams({ format: "csv" });
        const classId = document.getElementById("filterClass").value;
        const termId = document.getElementById("filterTerm").value;
        const yearId = document.getElementById("filterYear").value;
        if (classId) p.set("class_id", classId);
        if (termId) p.set("term_id", termId);
        if (yearId) p.set("academic_year_id", yearId);

        const endpoint = type === "summary"
            ? `/api/reports/attendance?${p}`
            : `/api/attendance/sessions?${p}`;

        showStatus("Preparing download…", "info");

        try {
            const res = await apiFetch(endpoint);
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }

            // For sessions (JSON), convert client-side; for summary, it's CSV from server
            if (type === "sessions") {
                const sessions = await res.json();
                const csv = toCSV(sessions.length ? Object.keys(sessions[0]) : [], sessions);
                triggerDownload(csv, "attendance_sessions.csv");
            } else {
                const csv = await res.text();
                triggerDownload(csv, "attendance_summary.csv");
            }
            showStatus("Download started.", "success");
        } catch (err) {
            showStatus(err.message || "Download failed.", "danger");
        }
    }

    function toCSV(keys, rows) {
        const esc = (v) => {
            const s = String(v ?? "");
            return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
        };
        return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
    }

    function triggerDownload(content, filename) {
        const blob = new Blob([content], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
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