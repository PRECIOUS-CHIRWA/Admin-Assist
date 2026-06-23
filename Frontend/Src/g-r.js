const reportForm = document.getElementById("reportBuilderForm");
const moduleInputs = Array.from(document.querySelectorAll(".report-module"));
const previewAudience = document.getElementById("previewAudience");
const previewWindow = document.getElementById("previewWindow");
const previewGrade = document.getElementById("previewGrade");
const previewTerm = document.getElementById("previewTerm");
const previewModules = document.getElementById("previewModules");
const previewExtras = document.getElementById("previewExtras");
const previewNotes = document.getElementById("previewNotes");
const previewFormatChip = document.getElementById("previewFormatChip");

function formatDateLabel(value) {
    if (!value) {
        return "Not set";
    }

    const [year, month, day] = value.split("-");
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function renderTags(container, items, fallbackText) {
    container.innerHTML = "";
    const values = items.length ? items : [fallbackText];

    values.forEach((item) => {
        const tag = document.createElement("span");
        tag.className = "preview-tag";
        tag.textContent = item;
        container.appendChild(tag);
    });
}

function syncReportPreview() {
    const audience = document.getElementById("reportAudience").value;
    const grade = document.getElementById("reportGrade").value;
    const term = document.getElementById("reportTerm").value;
    const start = document.getElementById("reportStart").value;
    const end = document.getElementById("reportEnd").value;
    const format = document.getElementById("reportFormat").value;
    const notes = document.getElementById("reportNotes").value.trim();

    const selectedModules = moduleInputs.filter((input) => input.checked).map((input) => input.value);
    const selectedExtras = [];

    if (document.getElementById("includeCharts").checked) {
        selectedExtras.push("Charts and visuals");
    }

    if (document.getElementById("includeStudentList").checked) {
        selectedExtras.push("Student detail appendix");
    }

    if (document.getElementById("emailPrincipal").checked) {
        selectedExtras.push("Email copy to principal");
    }

    previewAudience.textContent = audience;
    previewWindow.textContent = formatDateLabel(start) + " to " + formatDateLabel(end);
    previewGrade.textContent = grade;
    previewTerm.textContent = term;
    previewNotes.textContent = notes || "No additional notes added.";
    previewFormatChip.textContent = format + " Export";

    renderTags(previewModules, selectedModules, "No modules selected");
    renderTags(previewExtras, selectedExtras, "No extras included");
}

reportForm.addEventListener("input", syncReportPreview);
reportForm.addEventListener("change", syncReportPreview);

reportForm.addEventListener("submit", (event) => {
    event.preventDefault();
    syncReportPreview();
    alert("Report generated successfully. This action is ready to connect to your export service.");
});

document.getElementById("scheduleReportBtn").addEventListener("click", () => {
    syncReportPreview();
    alert("Report scheduled successfully. Backend scheduling can be connected next.");
});

syncReportPreview();