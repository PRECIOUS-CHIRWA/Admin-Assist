
// Load order: auth.js → auth-guard.js → navigation.js → THIS FILE


/* ── Module state ───────────────────────────────────────────────────────── */
let _currentStep = 1;
const _TOTAL_STEPS = 3;

/* ── DOMContentLoaded ────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {

  // 1. Auth guard — synchronous redirect if no session
  requireAuth();

  // 2. Live enrollment stats
  _loadEnrollmentStats();

  // 3. Multi-step form
  initializeMultiStepForm();

  // 4. Success overlay buttons
  const enrollAnotherBtn = document.getElementById("enrollAnotherBtn");
  const viewListBtn = document.getElementById("viewListBtn");

  if (enrollAnotherBtn) {
    enrollAnotherBtn.addEventListener("click", () => {
      window.location.href = "enroll-student.html";
    });
  }
  if (viewListBtn) {
    viewListBtn.addEventListener("click", () => {
      window.location.href = "students.html";
    });
  }
});

/* ════════════════════════════════════════════════════════════════════════
   initializeMultiStepForm()
   Sets up Next / Back / Submit buttons and all step-transition logic.
════════════════════════════════════════════════════════════════════════ */
function initializeMultiStepForm() {
  const nextBtn = document.getElementById("nextBtn");
  const backBtn = document.getElementById("backBtn");
  const submitBtn = document.getElementById("submitBtn");

  if (!nextBtn || !backBtn || !submitBtn) {
    console.warn("initializeMultiStepForm: required buttons not found.");
    return;
  }

  const gradeSelect = document.getElementById("grade");
  if (gradeSelect) {
    gradeSelect.addEventListener("change", () => _loadClassesForGrade(gradeSelect.value));
    // In case the browser restored a previous value on refresh
    if (gradeSelect.value) _loadClassesForGrade(gradeSelect.value);
  }

  // Show step 1 on load
  _goToStep(1);

  nextBtn.addEventListener("click", () => {
    if (!_validateStep(_currentStep)) return;
    if (_currentStep < _TOTAL_STEPS) {
      if (_currentStep === _TOTAL_STEPS - 1) _renderReviewSummary();
      _goToStep(_currentStep + 1);
    }
  });

  backBtn.addEventListener("click", () => {
    if (_currentStep > 1) _goToStep(_currentStep - 1);
  });

  submitBtn.addEventListener("click", _submitEnrollment);
}

/* ── Step navigation ─────────────────────────────────────────────────────── */
function _goToStep(step) {
  _currentStep = step;

  // Show / hide form panels
  for (let i = 1; i <= _TOTAL_STEPS; i++) {
    const panel = document.getElementById("formStep" + i);
    if (panel) panel.classList.toggle("active", i === step);
  }

  // Progress bar fill
  const bar = document.getElementById("progressBar");
  if (bar) bar.style.width = ((step / _TOTAL_STEPS) * 100).toFixed(2) + "%";

  // Step indicator dots
  for (let i = 1; i <= _TOTAL_STEPS; i++) {
    const dot = document.getElementById("step-indicator-" + i);
    if (!dot) continue;
    dot.classList.remove("active", "completed");
    if (i < step) dot.classList.add("completed");
    if (i === step) dot.classList.add("active");
  }

  // Progress title text
  const titleLabels = ["Personal Info", "Academic Info", "Parent / Guardian"];
  const progressTitle = document.querySelector(".progress-title");
  if (progressTitle) {
    progressTitle.textContent = `Step ${step} of ${_TOTAL_STEPS} — ${titleLabels[step - 1]}`;
  }

  // Back / Next / Submit visibility
  const backBtn = document.getElementById("backBtn");
  const nextBtn = document.getElementById("nextBtn");
  const submitBtn = document.getElementById("submitBtn");

  if (backBtn) backBtn.disabled = (step === 1);
  if (nextBtn) nextBtn.classList.toggle("is-hidden", step === _TOTAL_STEPS);
  if (submitBtn) submitBtn.classList.toggle("is-hidden", step !== _TOTAL_STEPS);
}

/* ── Per-step validation ─────────────────────────────────────────────────── */
function _validateStep(step) {
  let valid = true;

  function _require(id, message) {
    const el = document.getElementById(id);
    const err = document.getElementById("err-" + id);
    if (!el) return;
    const val = el.value.trim();
    if (!val) {
      if (err) err.textContent = message;
      el.classList.add("is-invalid");
      valid = false;
    } else {
      if (err) err.textContent = "";
      el.classList.remove("is-invalid");
    }
  }

  function _requireRadio(name, errId, message) {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    const err = document.getElementById(errId);
    if (!checked) {
      if (err) err.textContent = message;
      valid = false;
    } else {
      if (err) err.textContent = "";
    }
  }

  if (step === 1) {
    _require("firstName", "First name is required.");
    _require("lastName", "Last name is required.");
    _require("dateOfBirth", "Date of birth is required.");
    _require("province", "Please select a province.");
    _requireRadio("gender", "err-gender", "Please select a gender.");
  }

  if (step === 2) {
    _require("admissionNumber", "Admission number is required.");
    _require("grade", "Please select a grade.");
    _require("classId", "Please select a class.");
    _require("enrollmentDate", "Enrollment date is required.");
  }

  if (step === 3) {
    _require("parentGuardianName", "Guardian full name is required.");
    _require("relationship", "Please select a relationship.");
    _require("phoneNumber", "Phone number is required.");
  }

  return valid;
}

/* ── Review Summary (Step 3) ──────────────────────────────────────────────── */
function _renderReviewSummary() {
  const container = document.getElementById("reviewSummary");
  if (!container) return;

  function _val(id) {
    const el = document.getElementById(id);
    if (!el) return "—";
    if (el.type === "radio") {
      const checked = document.querySelector(`input[name="${el.name}"]:checked`);
      return checked ? checked.value : "—";
    }
    return el.value.trim() || "—";
  }

  const gender = (() => {
    const checked = document.querySelector('input[name="gender"]:checked');
    return checked ? checked.value : "—";
  })();

  const rows = [
    ["First Name", _val("firstName")],
    ["Last Name", _val("lastName")],
    ["Date of Birth", _val("dateOfBirth")],
    ["Gender", gender],
    ["Province", _val("province")],
    ["Home Address", _val("homeAddress")],
    ["District", _val("district")],
    ["Admission Number", _val("admissionNumber")],
    ["Grade / Form", _val("grade")],
    ["Class", _selectedOptionText("classId")],
    ["Enrollment Date", _val("enrollmentDate")],
    ["Previous School", _val("previousSchool")],
    ["Guardian Name", _val("parentGuardianName")],
    ["Relationship", _val("relationship")],
    ["Phone Number", _val("phoneNumber")],
    ["Guardian Email", _val("email")],
  ];

  container.innerHTML =
    '<table class="review-table">' +
    rows.map(([label, value]) =>
      `<tr><th>${label}</th><td>${_esc(value)}</td></tr>`
    ).join("") +
    "</table>";
}

/* ── Submit enrollment ────────────────────────────────────────────────────── */
async function _submitEnrollment() {
  if (!_validateStep(3)) return;

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  const gender = (() => {
    const checked = document.querySelector('input[name="gender"]:checked');
    return checked ? checked.value : "";
  })();

  const payload = {
    first_name: _getVal("firstName"),
    last_name: _getVal("lastName"),
    date_of_birth: _getVal("dateOfBirth") || null,
    nrc_number: _getVal("nrcNumber") || null,
    gender,
    home_address: _getVal("homeAddress") || null,
    district: _getVal("district") || null,
    province: _getVal("province") || null,
    admission_number: _getVal("admissionNumber"),
    class_id: _getVal("classId"),
    enrollment_date: _getVal("enrollmentDate"),
    previous_school: _getVal("previousSchool") || null,
    guardian_name: _getVal("parentGuardianName"),
    guardian_relationship: _getVal("relationship"),
    guardian_phone: _getVal("phoneNumber"),
    guardian_email: _getVal("email") || null,
  };

  try {
    const res = await apiFetch("/api/students/enroll", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res || !res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || "Enrollment failed.");
    }

    const data = await res.json();
    const admNo = data.admissionNumber || data.admission_number ||
      data.student?.admission_number || payload.admission_number;

    // Show success overlay
    const overlay = document.getElementById("successOverlay");
    const admLabel = document.getElementById("successAdmNumber");
    if (admLabel) admLabel.textContent = admNo || "—";
    if (overlay) overlay.classList.remove("is-hidden");

  } catch (err) {
    alert("Enrollment failed: " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Enrollment";
  }
}

/* ── Enrollment stats ─────────────────────────────────────────────────────── */
async function _loadEnrollmentStats() {
  try {
    const res = await apiFetch("/api/dashboard/enrollment-stats");
    if (!res || !res.ok) throw new Error("Stats unavailable");

    const stats = await res.json();
    document.querySelectorAll("[data-enroll-stat]").forEach(el => {
      const key = el.dataset.enrollStat;
      const val = stats[key];
      el.textContent = val !== undefined ? Number(val).toLocaleString() : "0";
    });
  } catch (err) {
    document.querySelectorAll("[data-enroll-stat]").forEach(el => {
      el.textContent = "0";
    });
    console.warn("_loadEnrollmentStats:", err.message);
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function _getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function _selectedOptionText(id) {
  const el = document.getElementById(id);
  if (!el || el.selectedIndex < 0) return "—";
  const opt = el.options[el.selectedIndex];
  return (opt && opt.textContent.trim()) || "—";
}

/* ── Class dropdown, filtered by the selected grade ─────────────────────────
   classesController.listClasses doesn't take a grade filter, so we fetch the
   full (small) class list once and filter client-side whenever the grade
   changes. This is what "classId" (added to replace the old free-text
   "section" field) is populated from — enrolling against a real class_id,
   instead of free-typed text, is what makes the attendance register able to
   find these students later. ─────────────────────────────────────────────── */
let _allClasses = null;

async function _loadClassesForGrade(grade) {
  const select = document.getElementById("classId");
  if (!select) return;

  select.innerHTML = '<option value="">Loading classes…</option>';
  select.disabled = true;

  if (!grade) {
    select.innerHTML = '<option value="">Select a grade first</option>';
    return;
  }

  try {
    if (!_allClasses) {
      const res = await apiFetch("/api/classes");
      if (!res || !res.ok) throw new Error("Failed to load classes");
      _allClasses = await res.json();
    }

    const normG = String(grade).trim().toLowerCase();
    const cleanG = normG.replace(/^grade\s*/i, "");

    const matches = _allClasses.filter((c) => {
      const cg = String(c.grade_level || "").trim().toLowerCase();
      const cleanCG = cg.replace(/^grade\s*/i, "");
      return cg === normG || cleanCG === cleanG;
    });

    if (!matches.length) {
      select.innerHTML = '<option value="">No classes set up for this grade yet</option>';
      return;
    }

    select.innerHTML = '<option value="">Select a class…</option>' +
      matches
        .map((c) => {
          const streamStr = c.stream ? String(c.stream).trim() : "";
          const shortName = (c.grade_level.replace(/^Grade\s*/i, "") + streamStr).trim();
          const fullName = c.class_name || (c.grade_level + (streamStr ? " " + streamStr : ""));
          const label = shortName && shortName !== fullName ? `${shortName} (${fullName})` : fullName;
          const count = typeof c.student_count === "number" ? ` (${c.student_count} enrolled)` : "";
          return `<option value="${c.id}">${_esc(label)}${count}</option>`;
        })
        .join("");
    select.disabled = false;
  } catch (err) {
    console.error("_loadClassesForGrade:", err);
    select.innerHTML = '<option value="">Unable to load classes — try again</option>';
  }
}

function _esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}