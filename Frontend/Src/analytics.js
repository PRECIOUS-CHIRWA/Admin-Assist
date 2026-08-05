(function () {
    'use strict';

    const COPPER = '#c8923a';
    const NAVY = '#1a2744';
    const SUCCESS = '#10b981';
    const DANGER = '#ef4444';
    const PALETTE = [NAVY, COPPER, SUCCESS, '#3b82f6', '#f59e0b', DANGER, '#8b5cf6', '#ec4899'];

    let attendanceChartInst = null;
    let genderChartInst = null;

    document.addEventListener('DOMContentLoaded', async () => {
        await loadMeta();
        await loadAll();
        bindEvents();
    });

    /* ─── Load term/year filters ─────────────────────────────────────────────── */
    async function loadMeta() {
        try {
            const res = await apiFetch('/api/attendance/terms');
            if (!res || !res.ok) return;
            const terms = await res.json();
            const years = [...new Map(terms.map(t =>
                [t.academic_year_id, { id: t.academic_year_id, label: t.year_label }]
            )).values()];

            _populate('termFilter', terms, 'id', t => `${t.term_name} (${t.year_label})`, 'All Terms');
            _populate('yearFilter', years, 'id', y => y.label, 'All Years');

            const cur = terms.find(t => t.is_current);
            if (cur) {
                document.getElementById('termFilter').value = cur.id;
                document.getElementById('yearFilter').value = cur.academic_year_id;
            }
        } catch (err) { console.error('loadMeta:', err); }
    }

    /* ─── Load everything ────────────────────────────────────────────────────── */
    async function loadAll() {
        const termId = document.getElementById('termFilter')?.value || '';
        const yearId = document.getElementById('yearFilter')?.value || '';
        const p = new URLSearchParams();
        if (termId) p.set('term_id', termId);
        if (yearId) p.set('academic_year_id', yearId);

        await Promise.allSettled([
            loadOverview(),
            loadAttendanceTrend(),
            loadSubjectPerf(p.toString()),
            loadClassDist(),
            loadGenderDist(),
            loadTopPerformers(p.toString()),
        ]);
    }

    /* ─── KPI cards ──────────────────────────────────────────────────────────── */
    async function loadOverview() {
        try {
            const res = await apiFetch('/api/analytics/overview');
            if (!res || !res.ok) return;
            const d = await res.json();
            _setText('kpiStudents', d.total_students ?? '—');
            _setText('kpiNew', d.new_enrollments_this_month ?? '—');
            _setText('kpiAttend', `${d.attendance_rate_today ?? 0}%`);
            _setText('kpiAvg', `${d.average_academic_performance ?? 0}%`);
        } catch (err) { console.error('loadOverview:', err); }
    }

    /* ─── Attendance trend line chart ────────────────────────────────────────── */
    async function loadAttendanceTrend() {
        try {
            const res = await apiFetch('/api/analytics/attendance-trend?weeks=8');
            if (!res || !res.ok) return;
            const data = await res.json();
            const canvas = document.getElementById('attendanceChart');
            if (!canvas) return;

            if (attendanceChartInst) { attendanceChartInst.destroy(); attendanceChartInst = null; }

            if (!data.length) {
                _noData(canvas.closest('.aa-chart-card'), 'No attendance sessions recorded yet.');
                return;
            }

            attendanceChartInst = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: data.map(d => _fmtDate(d.date)),
                    datasets: [{
                        label: 'Attendance Rate (%)',
                        data: data.map(d => d.rate),
                        borderColor: COPPER,
                        backgroundColor: 'rgba(200,146,58,.1)',
                        tension: 0.35,
                        fill: true,
                        pointRadius: 4,
                        pointBackgroundColor: COPPER,
                        pointHoverRadius: 6,
                    }],
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y}%` } },
                    },
                    scales: {
                        y: {
                            min: 0, max: 100,
                            ticks: { callback: v => `${v}%`, stepSize: 20 },
                            grid: { color: 'rgba(0,0,0,.05)' },
                        },
                        x: { ticks: { maxRotation: 40 } },
                    },
                },
            });
        } catch (err) { console.error('loadAttendanceTrend:', err); }
    }

    /* ─── Subject performance — CSS bars ─────────────────────────────────────── */
    async function loadSubjectPerf(params) {
        const el = document.getElementById('subjectBars');
        if (!el) return;
        try {
            const res = await apiFetch(`/api/analytics/performance-by-subject?${params}`);
            if (!res || !res.ok) return;
            const data = await res.json();
            if (!data.length) { el.innerHTML = _emptyMsg('No academic results recorded yet.'); return; }
            const max = Math.max(...data.map(d => parseFloat(d.average_percentage)), 1);
            el.innerHTML = data.slice(0, 10).map(d => {
                const pct = parseFloat(d.average_percentage);
                const color = pct >= 70 ? SUCCESS : pct >= 50 ? COPPER : DANGER;
                return `
                <div class="aa-bar-row">
                    <span class="aa-bar-label" title="${_esc(d.subject_name)}">${_esc(d.subject_name)}</span>
                    <div class="aa-bar-track">
                        <div class="aa-bar-fill" style="width:${(pct / max) * 100}%;background:${color}"></div>
                    </div>
                    <span class="aa-bar-value">${pct}%</span>
                </div>`;
            }).join('');
        } catch (err) { console.error('loadSubjectPerf:', err); }
    }

    /* ─── Class distribution — CSS bars ──────────────────────────────────────── */
    async function loadClassDist() {
        const el = document.getElementById('classBars');
        if (!el) return;
        try {
            const res = await apiFetch('/api/analytics/class-distribution');
            if (!res || !res.ok) return;
            const data = await res.json();
            if (!data.length) { el.innerHTML = _emptyMsg('No classes found.'); return; }
            const max = Math.max(...data.map(d => d.student_count), 1);
            el.innerHTML = data.map(d => `
                <div class="aa-bar-row">
                    <span class="aa-bar-label" title="${_esc(d.class_name)}">${_esc(d.class_name)}</span>
                    <div class="aa-bar-track">
                        <div class="aa-bar-fill" style="width:${(d.student_count / max) * 100}%;background:${NAVY}"></div>
                    </div>
                    <span class="aa-bar-value">${d.student_count}</span>
                </div>`).join('');
        } catch (err) { console.error('loadClassDist:', err); }
    }

    /* ─── Gender distribution donut ──────────────────────────────────────────── */
    async function loadGenderDist() {
        const canvas = document.getElementById('genderChart');
        const legend = document.getElementById('genderLegend');
        if (!canvas || !legend) return;
        try {
            const res = await apiFetch('/api/analytics/gender-distribution');
            if (!res || !res.ok) return;
            const data = await res.json();
            if (!data.length) { legend.innerHTML = _emptyMsg('No gender data.'); return; }

            if (genderChartInst) { genderChartInst.destroy(); genderChartInst = null; }

            const labels = data.map(d => d.gender || 'Unknown');
            const counts = data.map(d => Number(d.count));
            const total = counts.reduce((a, b) => a + b, 0);

            genderChartInst = new Chart(canvas, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data: counts,
                        backgroundColor: PALETTE.slice(0, labels.length),
                        borderWidth: 2,
                        borderColor: '#fff',
                    }],
                },
                options: { responsive: false, plugins: { legend: { display: false } } },
            });

            legend.innerHTML = labels.map((l, i) => `
                <div class="aa-donut-legend-item">
                    <div class="aa-donut-dot" style="background:${PALETTE[i]}"></div>
                    <span>${_esc(l)}: <strong>${counts[i]}</strong>
                    <span style="color:#94a3b8">(${total ? ((counts[i] / total) * 100).toFixed(1) : 0}%)</span></span>
                </div>`).join('');
        } catch (err) { console.error('loadGenderDist:', err); }
    }

    /* ─── Top performers list ────────────────────────────────────────────────── */
    async function loadTopPerformers(params) {
        const el = document.getElementById('topList');
        if (!el) return;
        try {
            const res = await apiFetch(`/api/analytics/top-performers?${params}&limit=10`);
            if (!res || !res.ok) return;
            const data = await res.json();
            if (!data.length) { el.innerHTML = _emptyMsg('No results data yet.'); return; }
            el.innerHTML = data.map((s, i) => `
                <div class="aa-performer-row">
                    <span>
                        <span style="font-weight:700;color:#94a3b8;margin-right:.4rem">#${i + 1}</span>
                        <strong>${_esc(s.first_name)} ${_esc(s.last_name)}</strong>
                        <span style="color:#94a3b8;font-size:.78rem"> · ${_esc(s.class_name)}</span>
                    </span>
                    <span class="aa-grade-pill">${s.average_percentage}%</span>
                </div>`).join('');
        } catch (err) { console.error('loadTopPerformers:', err); }
    }

    /* ─── Events ─────────────────────────────────────────────────────────────── */
    function bindEvents() {
        document.getElementById('refreshBtn')?.addEventListener('click', loadAll);
        ['termFilter', 'yearFilter'].forEach(id =>
            document.getElementById(id)?.addEventListener('change', loadAll)
        );
    }

    /* ─── Utility ────────────────────────────────────────────────────────────── */
    function _populate(id, items, vk, lf, ph) {
        const s = document.getElementById(id); if (!s) return;
        s.innerHTML = `<option value="">${ph}</option>` +
            items.map(i => `<option value="${i[vk]}">${_esc(lf(i))}</option>`).join('');
    }
    function _setText(id, v) {
        const el = document.getElementById(id); if (el) el.textContent = v;
    }
    function _noData(card, msg) {
        const existing = card?.querySelector('canvas');
        if (existing) existing.style.display = 'none';
        const p = document.createElement('p');
        p.style.cssText = 'color:#94a3b8;font-size:.85rem;padding:.5rem 0';
        p.textContent = msg;
        card?.appendChild(p);
    }
    function _emptyMsg(msg) {
        return `<p style="color:#94a3b8;font-size:.85rem;padding:.25rem 0">${_esc(msg)}</p>`;
    }
    function _fmtDate(str) {
        if (!str) return str;
        try { return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
        catch { return str; }
    }
    function _esc(v) {
        return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
})();