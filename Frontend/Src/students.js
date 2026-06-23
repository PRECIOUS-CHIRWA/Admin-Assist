/**
 * students.js
 * API and form management for student enrollment, list, profile, and edit pages
 * Fetch all students with pagination, search, and filters
 */
async function fetchStudents(page = 1, limit = 10, search = '', grade = '', status = '') {
  try {
    const params = new URLSearchParams();
    params.append('page', page);
    params.append('limit', limit);
    if (search) params.append('search', search);
    if (grade) params.append('grade', grade);
    if (status) params.append('status', status);

    const res = await authFetch(`${API_BASE}/students?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch students');
    return await res.json();
  } catch (err) {
    showToast(err.message, 'error');
    return null;
  }
}

/**
 * Fetch a single student by ID
 */
async function fetchStudentById(studentId) {
  try {
    const res = await authFetch(`${API_BASE}/students/${studentId}`);
    if (!res.ok) throw new Error('Student not found');
    return await res.json();
  } catch (err) {
    showToast(err.message, 'error');
    return null;
  }
}

/**
 * Create a new student
 */
async function createStudent(studentData) {
  try {
    const res = await authFetch(`${API_BASE}/students`, {
      method: 'POST',
      body: JSON.stringify(studentData),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to create student');
    }
    return await res.json();
  } catch (err) {
    showToast(err.message, 'error');
    return null;
  }
}

/**
 * Update a student
 */
async function updateStudent(studentId, studentData) {
  try {
    const res = await authFetch(`${API_BASE}/students/${studentId}`, {
      method: 'PUT',
      body: JSON.stringify(studentData),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to update student');
    }
    return await res.json();
  } catch (err) {
    showToast(err.message, 'error');
    return null;
  }
}

/**
 * Delete a student (soft delete)
 */
async function deleteStudent(studentId) {
  try {
    const res = await authFetch(`${API_BASE}/students/${studentId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete student');
    return await res.json();
  } catch (err) {
    showToast(err.message, 'error');
    return null;
  }
}

// ============================================
// MULTI-STEP FORM STATE & LOGIC
// ============================================

const formState = {
  currentStep: 1,
  totalSteps: 3,
  data: {
    // Step 1
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '',
    nrcNumber: '',
    homeAddress: '',
    district: '',
    province: '',

    // Step 2
    admissionNumber: '',
    grade: '',
    section: '',
    enrollmentDate: new Date().toISOString().split('T')[0],
    previousSchool: '',

    // Step 3
    parentGuardianName: '',
    relationship: '',
    phoneNumber: '',
    email: '',
  },
};

/**
 * Initialize multi-step form
 */
function initializeMultiStepForm() {
  const form = document.getElementById('enrollmentForm');
  if (!form) return;

  // Set today as default enrollment date
  const enrollmentDateInput = document.getElementById('enrollmentDate');
  if (enrollmentDateInput) {
    enrollmentDateInput.valueAsDate = new Date();
  }

  // Generate admission number suggestion
  generateAdmissionNumber();

  // Next button
  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => goToNextStep());
  }

  // Back button
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => goToPreviousStep());
  }

  // Submit button
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => submitEnrollment());
  }

  // Form field change listeners
  form.addEventListener('change', (e) => {
    const field = e.target.name || e.target.id;
    formState.data[field] = e.target.value;
  });

  form.addEventListener('input', (e) => {
    const field = e.target.name || e.target.id;
    formState.data[field] = e.target.value;
  });

  updateProgressBar();
  renderCurrentStep();
}

/**
 * Generate a suggested admission number (ADM-YYYY-XXXX)
 */
function generateAdmissionNumber() {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const suggestion = `ADM-${year}-${random}`;

  const admInput = document.getElementById('admissionNumber');
  if (admInput) {
    admInput.placeholder = suggestion;
    formState.data.admissionNumber = suggestion;
  }
}

/**
 * Validate current step
 */
function validateCurrentStep() {
  const step = formState.currentStep;
  const errors = [];

  if (step === 1) {
    const { firstName, lastName, dateOfBirth, gender, province } = formState.data;
    if (!firstName) errors.push('firstName', 'First name is required');
    if (!lastName) errors.push('lastName', 'Last name is required');
    if (!dateOfBirth) errors.push('dateOfBirth', 'Date of birth is required');
    if (!gender) errors.push('gender', 'Gender is required');
    if (!province) errors.push('province', 'Province is required');

    // Validate age (at least 10 years old)
    if (dateOfBirth) {
      const dob = new Date(dateOfBirth);
      const age = new Date().getFullYear() - dob.getFullYear();
      if (age < 10) errors.push('dateOfBirth', 'Student must be at least 10 years old');
    }
  } else if (step === 2) {
    const { admissionNumber, grade, section, enrollmentDate } = formState.data;
    if (!admissionNumber) errors.push('admissionNumber', 'Admission number is required');
    if (!grade) errors.push('grade', 'Grade is required');
    if (!section) errors.push('section', 'Section is required');
    if (!enrollmentDate) errors.push('enrollmentDate', 'Enrollment date is required');
  } else if (step === 3) {
    const { parentGuardianName, relationship, phoneNumber } = formState.data;
    if (!parentGuardianName) errors.push('parentGuardianName', 'Parent/Guardian name is required');
    if (!relationship) errors.push('relationship', 'Relationship is required');
    if (!phoneNumber) errors.push('phoneNumber', 'Phone number is required');

    // Validate Zambian phone number format
    if (phoneNumber && !phoneNumber.match(/^\+260\d{9}$/)) {
      errors.push('phoneNumber', 'Phone must be in format +260XXXXXXXXX');
    }
  }

  clearErrorMessages();
  if (errors.length > 0) {
    for (let i = 0; i < errors.length; i += 2) {
      showFieldError(errors[i], errors[i + 1]);
    }
    return false;
  }

  return true;
}

/**
 * Show error on a field
 */
function showFieldError(fieldName, errorMsg) {
  const field = document.getElementById(fieldName) || document.querySelector(`[name="${fieldName}"]`);
  if (!field) return;

  field.classList.add('error');
  let errorEl = field.nextElementSibling;
  if (!errorEl || !errorEl.classList.contains('error-message')) {
    errorEl = document.createElement('div');
    errorEl.classList.add('error-message');
    field.parentNode.appendChild(errorEl);
  }
  errorEl.textContent = errorMsg;
}

/**
 * Clear all error messages
 */
function clearErrorMessages() {
  document.querySelectorAll('.form-group input.error, .form-group select.error').forEach(field => {
    field.classList.remove('error');
  });
  document.querySelectorAll('.error-message').forEach(el => {
    el.remove();
  });
}

/**
 * Go to next step
 */
function goToNextStep() {
  if (!validateCurrentStep()) return;

  if (formState.currentStep < formState.totalSteps) {
    formState.currentStep++;
    updateProgressBar();
    renderCurrentStep();
    window.scrollTo(0, 0);
  }
}

/**
 * Go to previous step
 */
function goToPreviousStep() {
  if (formState.currentStep > 1) {
    formState.currentStep--;
    updateProgressBar();
    renderCurrentStep();
    window.scrollTo(0, 0);
  }
}

/**
 * Update progress bar display
 */
function updateProgressBar() {
  const progressBar = document.querySelector('.progress-bar');
  const progressTitle = document.querySelector('.progress-title');
  const steps = document.querySelectorAll('.progress-step');

  if (progressBar) {
    const percentage = (formState.currentStep / formState.totalSteps) * 100;
    progressBar.style.width = percentage + '%';
  }

  if (progressTitle) {
    progressTitle.textContent = `Step ${formState.currentStep} of ${formState.totalSteps}`;
  }

  steps.forEach((step, index) => {
    step.classList.remove('active', 'completed');
    if (index + 1 === formState.currentStep) {
      step.classList.add('active');
    } else if (index + 1 < formState.currentStep) {
      step.classList.add('completed');
    }
  });

  // Update button states
  const nextBtn = document.getElementById('nextBtn');
  const backBtn = document.getElementById('backBtn');
  const submitBtn = document.getElementById('submitBtn');

  if (nextBtn) nextBtn.style.display = formState.currentStep < formState.totalSteps ? 'block' : 'none';
  if (backBtn) backBtn.disabled = formState.currentStep === 1;
  if (submitBtn) submitBtn.style.display = formState.currentStep === formState.totalSteps ? 'block' : 'none';
}

/**
 * Render the current step form
 */
function renderCurrentStep() {
  const formSections = document.querySelectorAll('.form-section');
  formSections.forEach((section, index) => {
    section.classList.toggle('active', index + 1 === formState.currentStep);
  });

  // If on step 3, render the review summary
  if (formState.currentStep === 3) {
    renderReviewSummary();
  }
}

/**
 * Render review summary for Step 3
 */
function renderReviewSummary() {
  const reviewContainer = document.getElementById('reviewSummary');
  if (!reviewContainer) return;

  const { data } = formState;

  reviewContainer.innerHTML = `
    <div class="review-summary">
      <div class="review-section">
        <h3>Personal Information</h3>
        <div class="review-grid">
          <div class="review-item">
            <div class="review-label">First Name</div>
            <div class="review-value">${data.firstName}</div>
          </div>
          <div class="review-item">
            <div class="review-label">Last Name</div>
            <div class="review-value">${data.lastName}</div>
          </div>
          <div class="review-item">
            <div class="review-label">Date of Birth</div>
            <div class="review-value">${new Date(data.dateOfBirth).toLocaleDateString()}</div>
          </div>
          <div class="review-item">
            <div class="review-label">Gender</div>
            <div class="review-value">${data.gender}</div>
          </div>
          <div class="review-item">
            <div class="review-label">Province</div>
            <div class="review-value">${data.province}</div>
          </div>
          <div class="review-item">
            <div class="review-label">District</div>
            <div class="review-value">${data.district}</div>
          </div>
        </div>
      </div>

      <div class="review-section">
        <h3>Academic Information</h3>
        <div class="review-grid">
          <div class="review-item">
            <div class="review-label">Admission Number</div>
            <div class="review-value">${data.admissionNumber}</div>
          </div>
          <div class="review-item">
            <div class="review-label">Grade</div>
            <div class="review-value">${data.grade}</div>
          </div>
          <div class="review-item">
            <div class="review-label">Section</div>
            <div class="review-value">${data.section}</div>
          </div>
          <div class="review-item">
            <div class="review-label">Enrollment Date</div>
            <div class="review-value">${new Date(data.enrollmentDate).toLocaleDateString()}</div>
          </div>
        </div>
      </div>

      <div class="review-section">
        <h3>Parent/Guardian Information</h3>
        <div class="review-grid">
          <div class="review-item">
            <div class="review-label">Full Name</div>
            <div class="review-value">${data.parentGuardianName}</div>
          </div>
          <div class="review-item">
            <div class="review-label">Relationship</div>
            <div class="review-value">${data.relationship}</div>
          </div>
          <div class="review-item">
            <div class="review-label">Phone Number</div>
            <div class="review-value">${data.phoneNumber}</div>
          </div>
          <div class="review-item">
            <div class="review-label">Email Address</div>
            <div class="review-value">${data.email || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Submit enrollment form
 */
async function submitEnrollment() {
  if (!validateCurrentStep()) return;

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
  }

  const studentData = {
    firstName: formState.data.firstName,
    lastName: formState.data.lastName,
    dateOfBirth: formState.data.dateOfBirth,
    gender: formState.data.gender,
    nrcNumber: formState.data.nrcNumber,
    homeAddress: formState.data.homeAddress,
    district: formState.data.district,
    province: formState.data.province,
    admissionNumber: formState.data.admissionNumber,
    grade: formState.data.grade,
    section: formState.data.section,
    enrollmentDate: formState.data.enrollmentDate,
    previousSchool: formState.data.previousSchool,
    parentGuardianName: formState.data.parentGuardianName,
    relationship: formState.data.relationship,
    phoneNumber: formState.data.phoneNumber,
    email: formState.data.email,
    status: 'Active',
  };

  const result = await createStudent(studentData);

  if (result) {
    showSuccessOverlay(result.admissionNumber);
  } else {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Enrollment';
    }
  }
}

/**
 * Show success overlay after enrollment
 */
function showSuccessOverlay(admissionNumber) {
  const overlay = document.getElementById('successOverlay');
  if (!overlay) return;

  overlay.classList.add('active');
  const admNoEl = overlay.querySelector('.admission-number');
  if (admNoEl) {
    admNoEl.textContent = admissionNumber;
  }

  const enrollAnotherBtn = overlay.querySelector('.btn-enroll-another');
  const viewListBtn = overlay.querySelector('.btn-view-list');

  if (enrollAnotherBtn) {
    enrollAnotherBtn.addEventListener('click', () => {
      window.location.href = 'enroll-student.html';
    });
  }

  if (viewListBtn) {
    viewListBtn.addEventListener('click', () => {
      window.location.href = 'students.html';
    });
  }
}

// ============================================
// STUDENT LIST PAGE
// ============================================

let studentListState = {
  students: [],
  totalCount: 0,
  currentPage: 1,
  pageSize: 10,
  searchTerm: '',
  gradeFilter: '',
  statusFilter: '',
  sortColumn: 'name',
  sortDirection: 'asc',
};

/**
 * Initialize student list page
 */
function initializeStudentList() {
  const searchInput = document.getElementById('searchStudents');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      studentListState.searchTerm = e.target.value;
      searchTimeout = setTimeout(() => {
        studentListState.currentPage = 1;
        loadStudentList();
      }, 300);
    });
  }

  const gradeFilter = document.getElementById('filterGrade');
  if (gradeFilter) {
    gradeFilter.addEventListener('change', (e) => {
      studentListState.gradeFilter = e.target.value;
      studentListState.currentPage = 1;
      loadStudentList();
    });
  }

  const statusFilter = document.getElementById('filterStatus');
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      studentListState.statusFilter = e.target.value;
      studentListState.currentPage = 1;
      loadStudentList();
    });
  }

  const addBtn = document.getElementById('addStudentBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      window.location.href = 'enroll-student.html';
    });
  }

  loadStudentList();
}

/**
 * Load and display student list
 */
async function loadStudentList() {
  showSkeletonLoader();

  const data = await fetchStudents(
    studentListState.currentPage,
    studentListState.pageSize,
    studentListState.searchTerm,
    studentListState.gradeFilter,
    studentListState.statusFilter
  );

  if (!data) {
    hideSkeletonLoader();
    return;
  }

  studentListState.students = data.students || [];
  studentListState.totalCount = data.total || 0;

  renderStudentTable();
  renderPagination();
  hideSkeletonLoader();
}

/**
 * Render student table
 */
function renderStudentTable() {
  const tbody = document.querySelector('table tbody');
  if (!tbody) return;

  tbody.innerHTML = studentListState.students.map((student, index) => `
    <tr>
      <td>${(studentListState.currentPage - 1) * studentListState.pageSize + index + 1}</td>
      <td>${student.admissionNumber}</td>
      <td>${student.firstName} ${student.lastName}</td>
      <td>${student.grade}</td>
      <td>${student.section}</td>
      <td>${student.gender}</td>
      <td>${new Date(student.enrollmentDate).toLocaleDateString()}</td>
      <td><span class="badge badge-${student.status.toLowerCase()}">${student.status}</span></td>
      <td>
        <div class="actions">
          <button class="action-btn view" onclick="viewStudent('${student.id}')" title="View">👁</button>
          <button class="action-btn edit" onclick="editStudent('${student.id}')" title="Edit">✏️</button>
          <button class="action-btn delete" onclick="confirmDelete('${student.id}')" title="Delete">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');
}

/**
 * Render pagination controls
 */
function renderPagination() {
  const paginationContainer = document.getElementById('pagination');
  if (!paginationContainer) return;

  const totalPages = Math.ceil(studentListState.totalCount / studentListState.pageSize);
  const startRecord = (studentListState.currentPage - 1) * studentListState.pageSize + 1;
  const endRecord = Math.min(startRecord + studentListState.pageSize - 1, studentListState.totalCount);

  let html = `<div class="pagination-info">Showing ${startRecord} – ${endRecord} of ${studentListState.totalCount} students</div><div class="pagination">`;

  // Previous button
  html += `<button ${studentListState.currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${studentListState.currentPage - 1})">← Previous</button>`;

  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    if (i === studentListState.currentPage) {
      html += `<button class="active">${i}</button>`;
    } else if (i <= 3 || i > totalPages - 3 || Math.abs(i - studentListState.currentPage) <= 1) {
      html += `<button onclick="goToPage(${i})">${i}</button>`;
    } else if (i === 4 || i === totalPages - 3) {
      html += `<span>...</span>`;
    }
  }

  // Next button
  html += `<button ${studentListState.currentPage >= totalPages ? 'disabled' : ''} onclick="goToPage(${studentListState.currentPage + 1})">Next →</button>`;
  html += `</div>`;

  paginationContainer.innerHTML = html;
}

/**
 * Go to specific page
 */
function goToPage(pageNum) {
  studentListState.currentPage = pageNum;
  loadStudentList();
  window.scrollTo(0, 0);
}

/**
 * Show skeleton loader
 */
function showSkeletonLoader() {
  const tbody = document.querySelector('table tbody');
  if (!tbody) return;

  tbody.innerHTML = Array(10).fill(0).map(() => `
    <tr class="skeleton-row">
      <td><div class="skeleton-cell"></div></td>
      <td><div class="skeleton-cell"></div></td>
      <td><div class="skeleton-cell"></div></td>
      <td><div class="skeleton-cell"></div></td>
      <td><div class="skeleton-cell"></div></td>
      <td><div class="skeleton-cell"></div></td>
      <td><div class="skeleton-cell"></div></td>
      <td><div class="skeleton-cell"></div></td>
      <td><div class="skeleton-cell"></div></td>
    </tr>
  `).join('');
}

/**
 * Hide skeleton loader (handled in renderStudentTable)
 */
function hideSkeletonLoader() {
  // Handled by renderStudentTable
}

/**
 * View student profile
 */
function viewStudent(studentId) {
  window.location.href = `student-profile.html?id=${studentId}`;
}

/**
 * Edit student
 */
function editStudent(studentId) {
  window.location.href = `edit-student.html?id=${studentId}`;
}

/**
 * Confirm delete with inline tooltip
 */
function confirmDelete(studentId) {
  const row = event.target.closest('tr');
  const deleteBtn = event.target;

  // Remove existing confirmation if present
  const existing = row.querySelector('.delete-confirm');
  if (existing) existing.remove();

  const confirmEl = document.createElement('div');
  confirmEl.classList.add('delete-confirm', 'show');
  confirmEl.innerHTML = `
    <p>Are you sure?</p>
    <button onclick="performDelete('${studentId}')" style="background: #f44336; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">Yes</button>
    <button onclick="cancelDelete(this)" style="background: #e0e0e0; color: #333; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">No</button>
  `;

  deleteBtn.parentNode.insertBefore(confirmEl, deleteBtn.nextSibling);
}

/**
 * Cancel delete
 */
function cancelDelete(btn) {
  btn.parentNode.parentNode.remove();
}

/**
 * Perform delete
 */
async function performDelete(studentId) {
  const result = await deleteStudent(studentId);
  if (result) {
    showToast('Student deleted successfully', 'success');
    loadStudentList();
  }
}

// ============================================
// PROFILE & EDIT PAGES
// ============================================

/**
 * Initialize student profile page
 */
async function initializeStudentProfile() {
  const params = new URLSearchParams(window.location.search);
  const studentId = params.get('id');

  if (!studentId) {
    showToast('Student ID not provided', 'error');
    return;
  }

  const student = await fetchStudentById(studentId);
  if (!student) return;

  renderProfileHeader(student);
  setupProfileTabs(student);

  const editBtn = document.getElementById('editBtn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      window.location.href = `edit-student.html?id=${studentId}`;
    });
  }

  const printBtn = document.getElementById('printBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }
}

/**
 * Render profile header
 */
function renderProfileHeader(student) {
  const profileCard = document.querySelector('.profile-card');
  if (!profileCard) return;

  const initials = (student.firstName.charAt(0) + student.lastName.charAt(0)).toUpperCase();

  profileCard.innerHTML = `
    <div class="profile-avatar">${initials}</div>
    <div class="profile-name">${student.firstName} ${student.lastName}</div>
    <div class="profile-admno">${student.admissionNumber}</div>
    <div class="profile-meta">
      <div>${student.grade}</div>
      <div>${student.section}</div>
    </div>
    <div class="profile-badge">
      <span class="badge badge-${student.status.toLowerCase()}">${student.status}</span>
    </div>
    <div class="profile-actions">
      <button id="editBtn">Edit Profile</button>
      <button id="printBtn">Print Profile</button>
    </div>
  `;
}

/**
 * Setup profile tabs
 */
function setupProfileTabs(student) {
  const tabButtons = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      tabContents[index].classList.add('active');

      if (index === 0) {
        renderPersonalInfoTab(student);
      }
    });
  });

  renderPersonalInfoTab(student);
}

/**
 * Render personal info tab
 */
function renderPersonalInfoTab(student) {
  const tabContent = document.querySelector('.tab-content.active');
  if (!tabContent) return;

  const reviewItems = `
    <div class="review-grid">
      <div class="review-item">
        <div class="review-label">First Name</div>
        <div class="review-value">${student.firstName}</div>
      </div>
      <div class="review-item">
        <div class="review-label">Last Name</div>
        <div class="review-value">${student.lastName}</div>
      </div>
      <div class="review-item">
        <div class="review-label">Date of Birth</div>
        <div class="review-value">${new Date(student.dateOfBirth).toLocaleDateString()}</div>
      </div>
      <div class="review-item">
        <div class="review-label">Gender</div>
        <div class="review-value">${student.gender}</div>
      </div>
      <div class="review-item">
        <div class="review-label">NRC/Birth Certificate</div>
        <div class="review-value">${student.nrcNumber || '—'}</div>
      </div>
      <div class="review-item">
        <div class="review-label">Province</div>
        <div class="review-value">${student.province}</div>
      </div>
      <div class="review-item">
        <div class="review-label">District</div>
        <div class="review-value">${student.district}</div>
      </div>
      <div class="review-item">
        <div class="review-label">Home Address</div>
        <div class="review-value">${student.homeAddress}</div>
      </div>
    </div>
  `;

  if (tabContent.querySelector('.tab-placeholder')) {
    tabContent.innerHTML = reviewItems;
  }
}

/**
 * Initialize edit student page
 */
async function initializeEditStudent() {
  const params = new URLSearchParams(window.location.search);
  const studentId = params.get('id');

  if (!studentId) {
    showToast('Student ID not provided', 'error');
    return;
  }

  const student = await fetchStudentById(studentId);
  if (!student) return;

  populateEditForm(student);
  setupEditFormHandlers(studentId);
}

/**
 * Populate edit form with student data
 */
function populateEditForm(student) {
  document.getElementById('firstName').value = student.firstName;
  document.getElementById('lastName').value = student.lastName;
  document.getElementById('dateOfBirth').value = student.dateOfBirth;
  document.getElementById('gender').value = student.gender;
  document.getElementById('nrcNumber').value = student.nrcNumber || '';
  document.getElementById('homeAddress').value = student.homeAddress;
  document.getElementById('district').value = student.district;
  document.getElementById('province').value = student.province;
  document.getElementById('admissionNumber').value = student.admissionNumber;
  document.getElementById('grade').value = student.grade;
  document.getElementById('section').value = student.section;
  document.getElementById('enrollmentDate').value = student.enrollmentDate;
  document.getElementById('previousSchool').value = student.previousSchool || '';
  document.getElementById('parentGuardianName').value = student.parentGuardianName;
  document.getElementById('relationship').value = student.relationship;
  document.getElementById('phoneNumber').value = student.phoneNumber;
  document.getElementById('email').value = student.email || '';
}

/**
 * Setup edit form handlers
 */
function setupEditFormHandlers(studentId) {
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const studentData = {
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        dateOfBirth: document.getElementById('dateOfBirth').value,
        gender: document.getElementById('gender').value,
        nrcNumber: document.getElementById('nrcNumber').value,
        homeAddress: document.getElementById('homeAddress').value,
        district: document.getElementById('district').value,
        province: document.getElementById('province').value,
        admissionNumber: document.getElementById('admissionNumber').value,
        grade: document.getElementById('grade').value,
        section: document.getElementById('section').value,
        enrollmentDate: document.getElementById('enrollmentDate').value,
        previousSchool: document.getElementById('previousSchool').value,
        parentGuardianName: document.getElementById('parentGuardianName').value,
        relationship: document.getElementById('relationship').value,
        phoneNumber: document.getElementById('phoneNumber').value,
        email: document.getElementById('email').value,
      };

      saveBtn.disabled = true;
      const result = await updateStudent(studentId, studentData);
      saveBtn.disabled = false;

      if (result) {
        showToast('Profile updated successfully', 'success');
        setTimeout(() => {
          window.location.href = `student-profile.html?id=${studentId}`;
        }, 1000);
      }
    });
  }

  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      window.history.back();
    });
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.classList.add('toast', type);
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* === Sprint 2 Additions: Auto Page Initialisation ===
 * Reads the data-page attribute set on <body> in each HTML file.
 * This removes the need for inline <script> blocks in the HTML,
 * keeping separation of concerns clean (Rule 2).
 */
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "student-list") initializeStudentList();
  if (page === "student-profile") initializeStudentProfile();
  if (page === "edit-student") initializeEditStudent();
  // enroll-student is handled by enroll-student.js
});