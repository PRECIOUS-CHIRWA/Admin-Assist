const recordRows = Array.from(document.querySelectorAll(".record-row"));
const gradedCountEl = document.getElementById("gradedCount");
const pendingCountEl = document.getElementById("pendingCount");
const averageScoreEl = document.getElementById("averageScore");
const topScoreEl = document.getElementById("topScore");
const gradedBarEl = document.getElementById("gradedBar");
const averageBarEl = document.getElementById("averageBar");
const topBarEl = document.getElementById("topBar");
const pendingBarEl = document.getElementById("pendingBar");

function clampScore(value, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(max, numeric));
}

function gradeForScore(score) {
    if (score >= 80) {
        return { label: "A", className: "grade-a", remark: "Excellent" };
    }
    if (score >= 70) {
        return { label: "B", className: "grade-b", remark: "Very Good" };
    }
    if (score >= 50) {
        return { label: "C", className: "grade-c", remark: "Satisfactory" };
    }
    if (score >= 40) {
        return { label: "D", className: "grade-d", remark: "Needs Support" };
    }
    return { label: "F", className: "grade-f", remark: "Intervention Required" };
}

function syncRecords() {
    let gradedCount = 0;
    let runningTotal = 0;
    let topScore = 0;

    recordRows.forEach((row) => {
        const caInput = row.querySelector(".ca-score");
        const projectInput = row.querySelector(".project-score");
        const examInput = row.querySelector(".exam-score");

        const ca = clampScore(caInput.value, 30);
        const project = clampScore(projectInput.value, 20);
        const exam = clampScore(examInput.value, 50);

        caInput.value = ca;
        projectInput.value = project;
        examInput.value = exam;

        const total = ca + project + exam;
        const totalCell = row.querySelector(".total-score");
        const gradeCell = row.querySelector(".result-pill");
        const remarkCell = row.querySelector(".remark-text");
        const gradeMeta = gradeForScore(total);

        totalCell.textContent = String(total);
        gradeCell.textContent = gradeMeta.label;
        gradeCell.className = "result-pill " + gradeMeta.className;
        remarkCell.textContent = gradeMeta.remark;

        const isComplete = caInput.value !== "" && projectInput.value !== "" && examInput.value !== "";
        if (isComplete) {
            gradedCount += 1;
            runningTotal += total;
            topScore = Math.max(topScore, total);
        }
    });

    const pending = recordRows.length - gradedCount;
    const average = gradedCount ? Math.round(runningTotal / gradedCount) : 0;

    gradedCountEl.textContent = String(gradedCount);
    pendingCountEl.textContent = String(pending);
    averageScoreEl.textContent = average + "%";
    topScoreEl.textContent = topScore + "%";

    gradedBarEl.style.width = (gradedCount / recordRows.length) * 100 + "%";
    averageBarEl.style.width = average + "%";
    topBarEl.style.width = topScore + "%";
    pendingBarEl.style.width = (pending / recordRows.length) * 100 + "%";
}

recordRows.forEach((row) => {
    row.querySelectorAll(".score-input").forEach((input) => {
        input.addEventListener("input", syncRecords);
    });
});

document.getElementById("recordsFilterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    alert("Academic record book loaded for the selected term, class, and subject.");
});

document.getElementById("saveRecordsBtn").addEventListener("click", () => {
    syncRecords();
    alert("Academic record draft saved locally. Backend persistence can be added next.");
});

document.getElementById("publishResultsBtn").addEventListener("click", () => {
    syncRecords();
    alert("Results published successfully. This action is ready to connect to your publishing workflow.");
});

document.getElementById("gradebookForm").addEventListener("submit", (event) => {
    event.preventDefault();
    syncRecords();
    alert("Academic records updated successfully.");
});

syncRecords();