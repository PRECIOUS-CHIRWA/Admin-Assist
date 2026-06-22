const attendanceSelects = Array.from(document.querySelectorAll("select.attendance-status"));
const totalStudents = attendanceSelects.length;
const presentCountEl = document.getElementById("presentCount");
const lateCountEl = document.getElementById("lateCount");
const absentCountEl = document.getElementById("absentCount");
const presentBarEl = document.getElementById("presentBar");
const lateBarEl = document.getElementById("lateBar");
const absentBarEl = document.getElementById("absentBar");
const markAllPresentBtn = document.getElementById("markAllPresentBtn");

function setBarWidth(element, value) {
    element.style.width = totalStudents ? (value / totalStudents) * 100 + "%" : "0%";
}

function syncAttendanceStats() {
    let present = 0;
    let late = 0;
    let absent = 0;

    attendanceSelects.forEach((select) => {
        const status = select.value;

        if (status === "Present") {
            present += 1;
        } else if (status === "Late") {
            late += 1;
        } else {
            absent += 1;
        }
    });

    presentCountEl.textContent = String(present);
    lateCountEl.textContent = String(late);
    absentCountEl.textContent = String(absent);

    setBarWidth(presentBarEl, present);
    setBarWidth(lateBarEl, late);
    setBarWidth(absentBarEl, absent);
}

attendanceSelects.forEach((select) => {
    select.addEventListener("change", syncAttendanceStats);
});

markAllPresentBtn.addEventListener("click", () => {
    attendanceSelects.forEach((select) => {
        select.value = "Present";
    });
    syncAttendanceStats();
});

document.getElementById("attendanceFilterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    alert("Register refreshed for the selected class and attendance date.");
});

document.getElementById("saveDraftAttendance").addEventListener("click", () => {
    syncAttendanceStats();
    alert("Attendance draft saved locally. Backend submission can be connected next.");
});

document.getElementById("attendanceRegisterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    syncAttendanceStats();
    alert("Attendance submitted successfully. This action is ready to connect to your backend workflow.");
});

syncAttendanceStats();