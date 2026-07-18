(function () {
    let attendanceChartInstance = null;
    let genderChartInstance = null;

    const COPPER = '#c8923a';
    const NAVY = '#1a2744';
    const PALETTE = ['#1a2744', '#c8923a', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    document.addEventListener("DOMContentLoaded", async () => {
        await loadMeta();
        await loadAll();
        bindEvents();
    });

    async function loadMeta() {
        try {
            const res = await apiFetch("/api/attendance/terms");
            const terms = await res.json();
            const years = [...new Map(terms.map((t) => [t.academic_year_id, { id: t.academic_year_id, label: t.year_label }])).values()];
            populateSelect("termFilter", terms, "id", (t) => `${t.term_name} (${t.year_label})`, "All Terms");
            populateSelect("yearFilter", years, "id", (y) => y.label, "All Years");

            const current = terms.find((t) => t.is_current);
            if (current) {
                document.getElementById("termFilter").value = current.id;
                document.getElementById("yearFilter").value = current.academic_year_id;
            }
        } catch (err) { console.error(err); }
    }

    async function loadAll() {
        const term = document.getElementById("termFilter").value;
        const year = document.getElementById("yearFilter").value;
        const p = new URLSearchParams();
        if (term) p.set("term_id", term);
        if (year) p.set("academic_year_id", year);

        await Promise.all([
            loadOverview(),
            loadAttendanceTrend(),
            loadSubjectPerformance(p),
            loadClassDistribution(),
            loadGenderDistribution(),
            loadTopPerformers(p),
        ]);
    }

    // ─── KPI cards ────────────────────────────────────────────────
    async function loadOverview() {
        try {
            const res = await apiFetch("/api/analytics/overview");
            const data = await res.json();
            document.getElementById("kpiStudents").textContent = data.total_students || 0;
            document.getElementById("kpiNew").textContent = data.new_enrollments_this_month || 0;
            document.getElementById("kpiAttend").textContent = `${data.attendance_rate_today || 0}%`;
            document.getElementById("kpiAvg").textContent = `${data.average_academic_performance || 0}%`;
        } catch (err) { console.error(err); }
    }

    // ─── Attendance trend line chart ───────────────────────────────
    async function loadAttendanceTrend() {
        try {
            const res = await apiFetch("/api/analytics/attendance-trend?weeks=8");
            const data = await res.json();
            const canvas = document.getElementById("attendanceChart");

            if (attendanceChartInstance) { attendanceChartInstance.destroy(); }

            if (!data.length) {
                canvas.closest(".aa-chart-card").querySelector("h3").textContent += " — No data yet";
                return;
            }

            attendanceChartInstance = new Chart(canvas, {
                type: "line",
                data: {
                    labels: data.map((d) => d.date),
                    datasets: [{
                        label: "Attendance Rate (%)",
                        data: data.map((d) => d.rate),
                        borderColor: COPPER,
                        backgroundColor: "rgba(200,146,58,.12)",
                        tension: 0.35,
                        fill: true,
                        pointRadius: 4,
                        pointBackgroundColor: COPPER,
                    }],
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y}%` } } },
                    scales: {
                        y: { beginAtZero: false, min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
                        x: { ticks: { maxRotation: 45 } },
                    },
                },
            });
        } catch (err) { console.error(err); }
    }

    // ─── Subject performance horizontal bars ───────────────────────
    async function loadSubjectPerformance(p) {
        try {
            const res = await apiFetch(`/api/analytics/performance-by-subject?${p}`);
            const data = await res.json();
            const el = document.getElementById("subjectBars");

            if (!data.length) { el.innerHTML = emptyMsg(); return; }

            const max = Math.max(...data.map((d) => d.average_percentage), 1);
            el.innerHTML = data.slice(0, 10).map((d) => `
        <div class="aa-bar-row">
          <span class="aa-bar-label" title="${esc(d.subject_name)}">${esc(d.subject_name)}</span>
          <div class="aa-bar-track">
            <div class="aa-bar-fill" style="width:${(d.average_percentage / max) * 100}%;background:${gradeColor(d.average_percentage)}"></div>
          </div>
          <span class="aa-bar-value">${d.average_percentage}%</span>
        </div>`).join("");
        } catch (err) { console.error(err); }
    }

    // ─── Class distribution bars ────────────────────────────────────
    async function loadClassDistribution() {
        try {
            const res = await apiFetch("/api/analytics/class-distribution");
            const data = await res.json();
            const el = document.getElementById("classBars");

            if (!data.length) { el.innerHTML = emptyMsg(); return; }

            const max = Math.max(...data.map((d) => d.student_count), 1);
            el.innerHTML = data.map((d) => `
        <div class="aa-bar-row">
          <span class="aa-bar-label" title="${esc(d.class_name)}">${esc(d.class_name)}</span>
          <div class="aa-bar-track">
            <div class="aa-bar-fill" style="width:${(d.student_count / max) * 100}%;background:${NAVY}"></div>
          </div>
          <span class="aa-bar-value">${d.student_count}</span>
        </div>`).join("");
        } catch (err) { console.error(err); }
    }

    // ─── Gender distribution donut ─────────────────────────────────
    async function loadGenderDistribution() {
        try {
            const res = await apiFetch("/api/analytics/gender-distribution");
            const data = await res.json();
            const canvas = document.getElementById("genderChart");
            const legend = document.getElementById("genderLegend");

            if (genderChartInstance) { genderChartInstance.destroy(); }

            if (!data.length) { canvas.style.display = "none"; legend.innerHTML = emptyMsg(); return; }

            const labels = data.map((d) => d.gender || "Unknown");
            const counts = data.map((d) => d.count);
            const total = counts.reduce((a, b) => a + Number(b), 0);

            genderChartInstance = new Chart(canvas, {
                type: "doughnut",
                data: {
                    labels,
                    datasets: [{ data: counts, backgroundColor: PALETTE.slice(0, labels.length), borderWidth: 2 }],
                },
                options: { responsive: false, plugins: { legend: { display: false } } },
            });

            legend.innerHTML = labels.map((l, i) => `
        <div class="aa-donut-legend-item">
          <div class="aa-donut-dot" style="background:${PALETTE[i]}"></div>
          <span>${esc(l)}: <strong>${counts[i]}</strong> (${((Number(counts[i]) / total) * 100).toFixed(1)}%)</span>
        </div>`).join("");
        } catch (err) { console.error(err); }
    }

    // ─── Top performers list ───────────────────────────────────────
    async function loadTopPerformers(p) {
        try {
            const res = await apiFetch(`/api/analytics/top-performers?${p}&limit=10`);
            const data = await res.json();
            const el = document.getElementById("topPerformersList");

            if (!data.length) { el.innerHTML = emptyMsg(); return; }

            el.innerHTML = data.map((s, i) => `
        <div class="aa-performer-row">
          <span>
            <strong style="margin-right:.4rem">#${i + 1}</strong>
            ${esc(s.first_name)} ${esc(s.last_name)}
            <span style="color:var(--aa-text-muted);font-size:.78rem">&nbsp;·&nbsp;${esc(s.class_name)}</span>
          </span>
          <span class="aa-grade-pill">${s.average_percentage}%</span>
        </div>`).join("");
        } catch (err) { console.error(err); }
    }

    // ─── Events ───────────────────────────────────────────────────
    function bindEvents() {
        document.getElementById("refreshBtn").addEventListener("click", loadAll);
        ["termFilter", "yearFilter"].forEach((id) =>
            document.getElementById(id).addEventListener("change", loadAll)
        );
    }

    // ─── Helpers ──────────────────────────────────────────────────
    function gradeColor(pct) {
        if (pct >= 70) return '#10b981';
        if (pct >= 50) return COPPER;
        return '#ef4444';
    }

    function emptyMsg() {
        return `<p style="color:var(--aa-text-muted);font-size:.85rem;padding:.5rem 0">No data available for this period.</p>`;
    }

    function populateSelect(id, items, valKey, labelFn, placeholder) {
        const s = document.getElementById(id); if (!s) return;
        s.innerHTML = `<option value="">${placeholder}</option>` +
            items.map((i) => `<option value="${i[valKey]}">${esc(labelFn(i))}</option>`).join("");
    }

    const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
})();