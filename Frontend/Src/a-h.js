(function () {
    document.addEventListener("DOMContentLoaded", async () => {
        await Promise.all([loadMeta(), loadSessions()]);
        bindEvents();
    });

    async function loadMeta() {
        try {
            const [classRes, termRes] = await Promise.all([
                apiFetch("/api/attendance/classes"),
                apiFetch("/api/attendance/terms"),
            ]);
            const classes = await classRes.json();
            const terms = await termRes.json();
            populateSelect("filterClass", classes, "id", (c) => c.class_name || `${c.grade_level}${c.stream ? " " + c.stream : ""}`, "All Classes");
            populateSelect("filterTerm", terms, "id", (t) => `${t.term_name} (${t.year_label})`, "All Terms");
        } catch (err) { console.error(err); }
    }

    async function loadSessions() {
        const p = new URLSearchParams();
        const v = (id) => document.getElementById(id).value;
        if (v("filterClass")) p.set("class_id", v("filterClass"));
        if (v("filterTerm")) p.set("term_id", v("filterTerm"));
        if (v("filterFrom")) p.set("from_date", v("filterFrom"));
        if (v("filterTo")) p.set("to_date", v("filterTo"));

        try {
            const res = await apiFetch(`/api/attendance/sessions?${p}`);
            const data = await res.json();
            render(data);
        } catch (err) { console.error(err); }
    }

    function render(sessions) {
        const tbody = document.getElementById("tableBody");
        const empty = document.getElementById("emptyState");
        document.getElementById("countBadge").textContent = `${sessions.length} session${sessions.length !== 1 ? "s" : ""}`;

        if (!sessions.length) { tbody.innerHTML = ""; empty.hidden = false; return; }
        empty.hidden = true;

        tbody.innerHTML = sessions.map((s) => {
            const total = (s.present_count || 0) + (s.absent_count || 0) + (s.late_count || 0) + (s.excused_count || 0);
            const rate = total ? (((s.present_count || 0) / total) * 100).toFixed(1) : "0.0";
            const cls = rate >= 90 ? "aa-rate-good" : rate >= 75 ? "aa-rate-ok" : "aa-rate-low";
            return `<tr>
        <td>${fmtDate(s.attendance_date)}</td>
        <td>${esc(s.class_name)}</td>
        <td>${esc(s.period)}</td>
        <td>${esc(s.teacher_name)}</td>
        <td>${total}</td>
        <td>${s.present_count || 0}</td>
        <td>${s.absent_count || 0}</td>
        <td><span class="aa-rate-pill ${cls}">${rate}%</span></td>
        <td class="aa-table-actions">
          <button class="aa-link-btn" data-id="${s.id}">View Records</button>
        </td>
      </tr>`;
        }).join("");

        tbody.querySelectorAll("[data-id]").forEach((btn) =>
            btn.addEventListener("click", () => viewSession(btn.dataset.id))
        );
    }

    async function viewSession(id) {
        try {
            const res = await apiFetch(`/api/attendance/sessions/${id}`);
            const { session, records } = await res.json();
            document.getElementById("detailContent").innerHTML = `
        <div class="aa-summary-list">
          <div class="aa-line-item"><span>Class</span><strong>${esc(session.class_name)}</strong></div>
          <div class="aa-line-item"><span>Date</span><strong>${fmtDate(session.attendance_date)}</strong></div>
          <div class="aa-line-item"><span>Period</span><strong>${esc(session.period)}</strong></div>
          <div class="aa-line-item"><span>Teacher</span><strong>${esc(session.teacher_name)}</strong></div>
          <div class="aa-line-item"><span>Term</span><strong>${esc(session.term_name)} (${esc(session.year_label)})</strong></div>
        </div>
        <div class="aa-table-wrap">
          <table class="aa-table">
            <thead><tr><th>Adm No</th><th>Name</th><th>Status</th><th>Remarks</th></tr></thead>
            <tbody>${records.map((r) => `
              <tr>
                <td>${esc(r.admission_number)}</td>
                <td>${esc(r.first_name)} ${esc(r.last_name)}</td>
                <td><span class="aa-status-pill aa-status-${r.status}">${r.status}</span></td>
                <td>${esc(r.remarks || "—")}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`;
            document.getElementById("detailModal").hidden = false;
        } catch { alert("Unable to load session details."); }
    }

    function bindEvents() {
        ["filterClass", "filterTerm", "filterFrom", "filterTo"].forEach((id) =>
            document.getElementById(id).addEventListener("change", loadSessions)
        );
        document.getElementById("clearFiltersBtn").addEventListener("click", () => {
            ["filterClass", "filterTerm", "filterFrom", "filterTo"].forEach((id) => document.getElementById(id).value = "");
            loadSessions();
        });
        document.getElementById("closeDetailBtn").addEventListener("click", () =>
            document.getElementById("detailModal").hidden = true
        );
        document.getElementById("detailModal").addEventListener("click", (e) => {
            if (e.target.id === "detailModal") document.getElementById("detailModal").hidden = true;
        });
    }

    function populateSelect(id, items, valKey, labelFn, placeholder) {
        const s = document.getElementById(id);
        if (!s) return;
        s.innerHTML = `<option value="">${placeholder}</option>` +
            items.map((i) => `<option value="${i[valKey]}">${esc(labelFn(i))}</option>`).join("");
    }
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
    const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
})();