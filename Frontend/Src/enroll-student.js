/**
 * enroll-student.js
 * Page initialiser for enroll-student.html.
 *
 * Responsibilities:
 *  1. Auth guard (synchronous — redirects to login if no token)
 *  2. Load live enrollment stats into the stat cards
 *  3. Initialise the multi-step form (defined below)
 *  4. Wire the success overlay buttons
 *
 * Load order: auth.js → auth-guard.js → navigation.js → THIS FILE
 */

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
    _require("section", "Section / class is required.");
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
    ["Section / Class", _val("section")],
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
    grade: _getVal("grade"),
    section: _getVal("section"),
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

function _esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}