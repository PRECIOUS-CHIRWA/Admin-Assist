# Sprint 2: Student Registration and Profile Management

## Overview
Sprint 2 extends the authenticated Admin Assist dashboard from Sprint 1 with complete Student Registration and Profile Management functionality. All pages are built with vanilla HTML5, CSS3, and JavaScript ES6+, using the design system established in Sprint 1.

## Deliverables

### 1. Student Enrollment Form (`enrollment.html`)
**Multi-step form with 3 progressive stages and visual progress indicator**

#### Features:
- **Progress Indicator**: Step counter (1 of 3), animated progress bar, visual step indicators with checkmarks for completed steps
- **Step 1 - Personal Information**:
  - First Name, Last Name (text, required)
  - Date of Birth (date picker, validates minimum age of 10 years)
  - Gender (radio buttons: Male/Female)
  - NRC/Birth Certificate Number (optional)
  - Home Address (textarea)
  - District (text input)
  - Province (dropdown with all 10 Zambian provinces)

- **Step 2 - Academic Information**:
  - Admission Number (auto-generates suggestion: ADM-YYYY-XXXX)
  - Grade/Form (Grade 8-12 dropdown)
  - Section/Class (text: e.g., 10A, 10B)
  - Enrollment Date (defaults to today)
  - Previous School (optional)

- **Step 3 - Parent/Guardian Information**:
  - Parent/Guardian Full Name (required)
  - Relationship (Father/Mother/Guardian dropdown)
  - Phone Number (Zambian format validation: +260XXXXXXXXX)
  - Email Address (optional)
  - Review Summary Panel (read-only recap of all entered data)

#### Validation:
- Client-side validation on "Next" button click
- Invalid fields highlighted in red with error messages
- Age validation (minimum 10 years old)
- Phone number format validation
- No submission until Step 3 is complete

#### Success Flow:
- Full-screen success overlay on form submission
- Displays: "✓ Student Enrolled Successfully! Admission No: [ADM-XXXX]"
- Two action buttons: "Enroll Another Student" and "View Student List"

---

### 2. Student List / Directory (`students.html`)
**Full-featured data table with search, filtering, and pagination**

#### Features:
- **Table Columns**: #, Admission No, Full Name, Grade, Section, Gender, Enrollment Date, Status, Actions

- **Search & Filters**:
  - Real-time search bar (filters by name, admission number, grade)
  - Debounced at 300ms to avoid excessive API calls
  - Grade dropdown filter (All Grades, Grade 8-12)
  - Status dropdown filter (Active/Inactive/Suspended)

- **Pagination**:
  - 10 rows per page
  - Shows "Showing X–Y of Z students"
  - Previous/Next buttons with page numbers
  - Smart pagination (shows first 3, last 3, and current ±1 pages)

- **Status Badges**:
  - Active (green background)
  - Inactive (grey background)
  - Suspended (orange background)

- **Actions Column**:
  - 👁 View (navigates to student profile)
  - ✏️ Edit (navigates to edit form)
  - 🗑 Delete (shows inline confirmation tooltip)

- **Add New Student Button** (top-right):
  - Links to `enrollment.html`

- **Loading State**:
  - Skeleton loader (animated grey shimmer rows) while fetching

---

### 3. Student Profile View (`student-profile.html?id=XXX`)
**Detailed single-student profile page with tabbed interface**

#### Left Column (30%):
- Initials-based avatar (copper background)
- Full Name (large, serif font)
- Admission Number
- Grade / Section metadata
- Status Badge (Active/Inactive/Suspended)
- Action Buttons:
  - "Edit Profile" → redirects to `edit-student.html?id=XXX`
  - "Print Profile" → triggers browser print dialog

#### Right Column (70%):
- **Tabbed Interface** (3 tabs):
  1. **Personal Info Tab**:
     - Grid layout showing all personal details
     - Labels: First Name, Last Name, DoB, Gender, NRC, Province, District, Home Address

  2. **Attendance Tab**:
     - Placeholder table with message: "Attendance data will appear here."
     - Reserved for Sprint 3 implementation

  3. **Academic Records Tab**:
     - Placeholder table with message: "Academic records will appear here."
     - Reserved for Sprint 4 implementation

#### Tab Styling:
- Bottom-border-only style (no box around tab content)
- Active tab has copper-colored bottom border
- Smooth fade-in animation when switching tabs

---

### 4. Edit Student Profile (`edit-student.html?id=XXX`)
**Single-page form for updating student information**

#### Form Sections:
- **Personal Information**: Same fields as enrollment Step 1
- **Academic Information**: Same fields as enrollment Step 2
- **Parent/Guardian Information**: Same fields as enrollment Step 3

#### Behavior:
- All fields are **editable** (not read-only like profile view)
- Form **pre-populated** with existing student data via URL parameter
- Client-side validation on save
- Action Buttons:
  - "Save Changes" (POST to `/api/students/:id`)
  - "Cancel" (navigates back to profile)

#### Notifications:
- Success toast (green): "Profile updated successfully."
- Error toast (red): "Update failed. Please try again."
- Automatic redirect to profile page on success (after 1s delay)

---

## JavaScript Module (`students.js`)

### API Functions:
```javascript
// GET /api/students?page=1&limit=10&search=&grade=&status=
async fetchStudents(page, limit, search, grade, status)

// GET /api/students/:id
async fetchStudentById(studentId)

// POST /api/students
async createStudent(studentData)

// PUT /api/students/:id
async updateStudent(studentId, studentData)

// DELETE /api/students/:id (soft delete → sets status to 'Inactive')
async deleteStudent(studentId)
```

### Form Management:
- **Multi-step state**: `formState` object accumulates data across steps
- **Validation**: Runs on "Next" button; invalid fields marked with red border
- **Review rendering**: Step 3 dynamically renders summary from accumulated data
- **Error handling**: Field-level error messages below each invalid input

### Student List Management:
- **Pagination state**: Current page, page size, filters, search term
- **Table rendering**: Dynamic row generation from API data
- **Skeleton loader**: Placeholder rows while fetching
- **Sort indicators**: Column headers show ↑↓ for sort direction

### Profile & Edit:
- **Tab switching**: Click handlers for tab buttons
- **Form population**: Pre-fills edit form with fetched student data
- **Toast notifications**: Auto-dismissing after 3 seconds

---

## CSS Stylesheet (`students.css`)

### Design System:
- **Primary Color**: Navy Blue (#0A1628)
- **Accent Color**: Copper (#B87333)
- **Surface**: Light Grey (#F5F7FA)
- **Fonts**: 
  - Headings: Playfair Display (serif)
  - Body: DM Sans (sans-serif)

### Key Components:
1. **Progress Bar**: Animated width transition, copper color for active step
2. **Form Inputs**: Focus state with copper border and subtle shadow
3. **Table Rows**: Subtle hover background (rgba(184,115,51,0.06))
4. **Status Badges**: Color-coded with background and text color
5. **Tabs**: Bottom-border-only style, copper underline for active
6. **Pagination**: Number buttons with hover/active states
7. **Toast Notifications**: Fixed bottom-right, slide-in animation
8. **Responsive Design**: 
   - Desktop (980px+): Multi-column layouts
   - Tablet (1024px): Adjusted grid columns
   - Mobile (768px): Single-column stacked, condensed padding

### Responsive Breakpoints:
- **1024px**: Multi-column → 2-column grids
- **768px**: Full stack, smaller fonts, condensed buttons

---

## File Structure

```
Frontend/Src/
├── enrollment.html          (276 lines) - Multi-step form
├── students.html            (113 lines) - Directory/list view
├── student-profile.html     (96 lines)  - Profile view with tabs
├── edit-student.html        (225 lines) - Edit form
├── students.css             (1014 lines) - Complete stylesheet
├── students.js              (1002 lines) - API + form logic
├── auth.js                  (Already exists) - Auth utilities
├── auth-guard.js            (Already exists) - RBAC protection
└── dashboard.html           (Already exists) - Dashboard hub
```

---

## Integration Points

### Authentication:
- All pages load `auth.js` and `auth-guard.js`
- `requireAuth()` enforces login on page load
- Bearer token automatically attached to all API calls
- 401 redirects to login page

### Authorization:
- Admin role has access to all student pages
- Teacher role has limited access (read-only on list/profile)
- Student role has read-only access to own profile only
- Implementation via `hasRole()` and `requireRoles()` in auth-guard.js

### Navigation:
- Dashboard → "Student Enrollment" card links to `enrollment.html`
- Dashboard → "Student Directory" card links to `students.html`
- Student List → "Add New Student" button links to `enrollment.html`
- Student List → View action links to `student-profile.html?id=XXX`
- Student List → Edit action links to `edit-student.html?id=XXX`
- Student Profile → "Edit Profile" button links to `edit-student.html?id=XXX`
- Edit Profile → "Cancel" navigates back to profile

---

## API Contracts

### Create Student (POST /api/students)
**Request Body**:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "2012-05-15",
  "gender": "Male",
  "nrcNumber": "123456/12/3",
  "homeAddress": "123 Main St",
  "district": "Lusaka",
  "province": "Lusaka",
  "admissionNumber": "ADM-2025-0001",
  "grade": "Grade 10",
  "section": "10A",
  "enrollmentDate": "2025-01-15",
  "previousSchool": "Primary School",
  "parentGuardianName": "Jane Doe",
  "relationship": "Mother",
  "phoneNumber": "+260961234567",
  "email": "jane@example.com",
  "status": "Active"
}
```

**Response** (201 Created):
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "admissionNumber": "ADM-2025-0001",
  "firstName": "John",
  "lastName": "Doe",
  "createdAt": "2025-01-15T10:30:00Z"
}
```

### List Students (GET /api/students)
**Query Parameters**:
- `page` (default: 1)
- `limit` (default: 10)
- `search` (optional, filters name/admission/grade)
- `grade` (optional)
- `status` (optional)

**Response** (200 OK):
```json
{
  "students": [
    {
      "_id": "...",
      "admissionNumber": "ADM-2025-0001",
      "firstName": "John",
      "lastName": "Doe",
      "grade": "Grade 10",
      "section": "10A",
      "gender": "Male",
      "enrollmentDate": "2025-01-15",
      "status": "Active"
    }
  ],
  "total": 835,
  "page": 1,
  "limit": 10
}
```

---

## Testing Checklist

- [ ] Enrollment form progresses through all 3 steps
- [ ] Validation prevents advancing with invalid data
- [ ] Date of birth validation enforces minimum age
- [ ] Phone number format validation works (+260XXXXXXXXX)
- [ ] Success overlay displays correct admission number
- [ ] Student list loads with skeleton loader
- [ ] Search filters work in real-time (300ms debounce)
- [ ] Grade and Status filters work independently
- [ ] Pagination controls work (Prev/Next/Page numbers)
- [ ] Delete confirmation inline tooltip appears
- [ ] Student profile loads and displays all data
- [ ] Profile tabs switch correctly
- [ ] Edit form pre-populates with student data
- [ ] Edit form saves changes and redirects
- [ ] Toast notifications appear and auto-dismiss
- [ ] All pages require authentication
- [ ] Header shows correct user info and role
- [ ] Logout button works on all pages
- [ ] Responsive design works on mobile/tablet/desktop

---

## Known Limitations & Future Enhancements

### Sprint 3:
- [ ] Attendance tracking and management
- [ ] Attendance table population on student profile
- [ ] Daily roll call interface

### Sprint 4:
- [ ] Academic records and grades management
- [ ] Report card generation
- [ ] Academic records table population

### Sprint 5:
- [ ] Advanced reporting and analytics
- [ ] Report generation/export
- [ ] Bulk operations on students

---

## Summary

Sprint 2 delivers a complete student lifecycle management system with enrollment, directory, profile viewing, and profile editing. All pages are fully functional, validated, and integrated with the authentication system from Sprint 1. The modular JavaScript architecture (students.js) makes it easy to extend with additional features in future sprints.

**Total Lines of Code**:
- HTML: 710 lines (4 pages)
- CSS: 1,014 lines
- JavaScript: 1,002 lines
- **Total: 2,726 lines**

**Status**: ✅ Ready for testing and backend integration
