/**
 * g-r.js — Generate Report page
 * - Replaces static stats with live API data
 * - Live preview panel updates as form changes
 * - "Generate Report" triggers real CSV downloads per selected module
 *
 * Requires: auth.js (authFetch, apiFetch, API_BASE), navigation.js
 */

document.addEventListener("DOMContentLoaded", async () => {
    await loadLiveStats();
    await populateTermDropdown();
    wirePreviewUpdates();
    wireGenerateButton();
    updatePreview();           // initialise preview with current form values
});

/* ─── Live Stats ───────────────────────────────────────────────────────────── */

async function loadLiveStats() {
    try {
        const res = await apiFetch("/api/reports/summary");
        if (!res || !res.ok) return;
        const data = await res.json();

        setStatCard(0, data.total_students ?? "—", "Total Students");
        setStatCard(1, data.total_classes ?? "—", "Classes");
        setStatCard(2, `${data.overall_attendance_rate ?? 0}%`, "Avg Attendance Rate");
        setStatCard(3, `${data.pass_rate ?? 0}%`, "Academic Pass Rate");
    } catch (_) { /* non-critical — page still works with placeholders */ }
}

function setStatCard(index, value, label) {
    const cards = document.querySelectorAll(".stats-grid .stat-card");
    if (!cards[index]) return;
    const valEl = cards[index].querySelector(".stat-value");
    const labelEl = cards[index].querySelector(".stat-label");
    if (valEl) valEl.textContent = value;
    if (labelEl) labelEl.textContent = label;
    // Remove the static progress bar width too
    const bar = cards[index].querySelector(".progress-fill");
    if (bar) bar.style.width = "0%";
}

/* ─── Term dropdown from API ──────────────────────────────────────────────── */

async function populateTermDropdown() {
    const sel = document.getElementById("reportTerm");
    if (!sel) return;
    try {
        const res = await apiFetch("/api/attendance/terms");
        if (!res || !res.ok) return;
        const terms = await res.json();

        sel.innerHTML = terms.map((t) =>
            `<option value="${t.id}" data-year="${t.academic_year_id}">${_esc(t.term_name)} (${_esc(t.year_label)})</option>`
        ).join("");

        const current = terms.find((t) => t.is_current);
        if (current) sel.value = current.id;
    } catch (_) { /* keep static options */ }
}

/* ─── Live Preview Updates ─────────────────────────────────────────────────── */

function wirePreviewUpdates() {
    const fields = ["reportAudience", "reportGrade", "reportTerm", "reportFormat",
        "reportStart", "reportEnd", "reportNotes",
        "includeCharts", "includeStudentList", "emailPrincipal"];

    fields.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("change", updatePreview);
        if (el && (el.tagName === "TEXTAREA" || el.type === "text"))
            el.addEventListener("input", updatePreview);
    });

    document.querySelectorAll(".report-module").forEach((cb) => {
        cb.addEventListener("change", updatePreview);
    });
}

function updatePreview() {
    const get = (id) => document.getElementById(id);
    const val = (id) => (get(id) ? get(id).value : "");
    const checked = (id) => get(id) ? get(id).checked : false;

    // Audience
    const audEl = get("previewAudience");
    if (audEl) audEl.textContent = val("reportAudience") || "—";

    // Reporting window
    const winEl = get("previewWindow");
    if (winEl) {
        const s = val("reportStart"), e = val("reportEnd");
        winEl.textContent = (s && e) ? `${fmtDate(s)} to ${fmtDate(e)}` : "—";
    }

    // Grade
    const gradeEl = get("previewGrade");
    if (gradeEl) gradeEl.textContent = val("reportGrade") || "All Grades";

    // Term — show label text from selected option
    const termEl = get("reportTerm");
    const prevTerm = get("previewTerm");
    if (termEl && prevTerm) {
        const opt = termEl.options[termEl.selectedIndex];
        prevTerm.textContent = opt ? opt.text : "—";
    }

    // Format chip
    const chip = get("previewFormatChip");
    if (chip) chip.textContent = `${val("reportFormat") || "CSV"} Export`;

    // Modules
    const modules = Array.from(document.querySelectorAll(".report-module:checked"))
        .map((cb) => cb.value);
    const modEl = get("previewModules");
    if (modEl) {
        modEl.innerHTML = modules.length
            ? modules.map((m) => `<span class="preview-tag">${_esc(m)}</span>`).join("")
            : `<span class="preview-tag" style="opacity:.5">None selected</span>`;
    }

    // Extras
    const extras = [];
    if (checked("includeCharts")) extras.push("Charts and visuals");
    if (checked("includeStudentList")) extras.push("Student detail appendix");
    if (checked("emailPrincipal")) extras.push("Email copy to principal");
    const extEl = get("previewExtras");
    if (extEl) {
        extEl.innerHTML = extras.length
            ? extras.map((e) => `<span class="preview-tag">${_esc(e)}</span>`).join("")
            : `<span class="preview-tag" style="opacity:.5">None selected</span>`;
    }

    // Notes
    const notesEl = get("previewNotes");
    if (notesEl) notesEl.textContent = val("reportNotes") || "—";
}

/* ─── Generate Report (real CSV downloads) ─────────────────────────────────── */

function wireGenerateButton() {
    const form = document.getElementById("reportBuilderForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        await generateReports();
    });
}

async function generateReports() {
    const modules = Array.from(document.querySelectorAll(".report-module:checked"))
        .map((cb) => cb.value);

    if (!modules.length) {
        showNotice("Please select at least one report module.", "warning");
        return;
    }

    const btn = document.querySelector(".primary-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Generating…"; }

    const params = buildExportParams();
    let downloaded = 0;
    const errors = [];

    for (const module of modules) {
        try {
            await downloadModule(module, params);
            downloaded++;
        } catch (err) {
            errors.push(`${module}: ${err.message}`);
        }
    }

    if (btn) { btn.disabled = false; btn.textContent = "Generate Report"; }

    if (errors.length) {
        showNotice(`${downloaded} download(s) started. Errors: ${errors.join("; ")}`, "warning");
    } else {
        showNotice(`${downloaded} CSV report(s) downloaded successfully.`, "success");
    }
}

function buildExportParams() {
    const params = new URLSearchParams({ format: "csv" });

    // Grade → class_id mapping is not 1:1 so we filter by grade level label only
    const grade = document.getElementById("reportGrade")?.value;
    if (grade && grade !== "All Grades") params.set("grade_level", grade.replace("Grade ", ""));

    // Term id from selected option
    const termEl = document.getElementById("reportTerm");
    if (termEl && termEl.value) {
        params.set("term_id", termEl.value);
        const opt = termEl.options[termEl.selectedIndex];
        if (opt && opt.dataset.year) params.set("academic_year_id", opt.dataset.year);
    }

    return params;
}

async function downloadModule(moduleName, params) {
    const endpointMap = {
        "Attendance Summary": "/api/reports/attendance",
        "Academic Performance": "/api/reports/academic",
        "Enrollment Snapshot": "/api/reports/enrollment",
        "Guardian Follow-up": "/api/reports/attendance", // uses same data, filtered differently
    };

    const fileMap = {
        "Attendance Summary": "attendance_report.csv",
        "Academic Performance": "academic_report.csv",
        "Enrollment Snapshot": "enrollment_report.csv",
        "Guardian Follow-up": "guardian_followup.csv",
    };

    const endpoint = endpointMap[moduleName];
    if (!endpoint) throw new Error("No endpoint mapped");

    const res = await apiFetch(`${endpoint}?${params}`);
    if (!res || !res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
    }

    const csv = await res.text();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileMap[moduleName] || "report.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ─── Template quick-fills ─────────────────────────────────────────────────── */

// Wire template items to pre-fill form
document.addEventListener("DOMContentLoaded", () => {
    const templates = document.querySelectorAll(".template-item");

    const configs = [
        { modules: ["Attendance Summary"], audience: "Class Teachers" },
        { modules: ["Academic Performance"], audience: "School Leadership Team" },
        { modules: ["Attendance Summary", "Academic Performance", "Enrollment Snapshot"], audience: "District Office" },
    ];

    templates.forEach((item, i) => {
        const cfg = configs[i];
        if (!cfg) return;
        item.style.cursor = "pointer";
        item.title = "Click to apply this template";
        item.addEventListener("click", () => {
            // Uncheck all modules
            document.querySelectorAll(".report-module").forEach((cb) => { cb.checked = false; });
            // Check selected modules
            document.querySelectorAll(".report-module").forEach((cb) => {
                if (cfg.modules.includes(cb.value)) cb.checked = true;
            });
            // Set audience
            const aud = document.getElementById("reportAudience");
            if (aud) {
                Array.from(aud.options).forEach((opt) => {
                    if (opt.text === cfg.audience) { aud.value = opt.value; }
                });
            }
            updatePreview();
            showNotice("Template applied. Review and click Generate Report.", "info");
        });
    });
});

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function showNotice(msg, type) {
    // Remove existing notice
    const existing = document.getElementById("gr-notice");
    if (existing) existing.remove();

    const colors = { success: "#ecfdf5", warning: "#fffbeb", info: "#eff6ff", error: "#fef2f2" };
    const border = { success: "#a7f3d0", warning: "#fde68a", info: "#bfdbfe", error: "#fecaca" };
    const text = { success: "#065f46", warning: "#92400e", info: "#1e40af", error: "#991b1b" };

    const div = document.createElement("div");
    div.id = "gr-notice";
    div.textContent = msg;
    div.style.cssText = `
        padding: .75rem 1rem; margin: 1rem 0; border-radius: 8px; font-size: .875rem; font-weight: 500;
        background: ${colors[type]}; border: 1px solid ${border[type]}; color: ${text[type]};
    `;

    const form = document.getElementById("reportBuilderForm");
    if (form) form.parentNode.insertBefore(div, form);

    if (type === "success" || type === "info") {
        setTimeout(() => div.remove(), 5000);
    }
}

function fmtDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric"
    });
}

function _esc(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}