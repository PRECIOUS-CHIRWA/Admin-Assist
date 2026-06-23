# Sprint 2: Student Enrollment Module - Design & Implementation Roadmap
## Admin Assist Student Information System

**Duration:** 2 weeks (starting after Sprint 1 completion)  
**Team:** Backend + Frontend developers  
**Stakeholders:** School administrators, registration staff  
**Target Date:** June 28, 2026

---

## OVERVIEW

### Business Goal
Enable school administrators to manage student enrollment from initial inquiry through class assignment, generating unique student IDs and parent verification.

### User Stories
1. **As an admin**, I want to view all pending enrollment applications so I can track admissions workflow
2. **As an admin**, I want to accept/reject enrollment applications so I can control who joins the school
3. **As a registrar**, I want to assign accepted students to classes so I can manage class rosters
4. **As a student/parent**, I want to submit enrollment information so I can join the school
5. **As an admin**, I want to view student profiles with all enrollment data so I can maintain accurate records
6. **As a student**, I want to view my assigned class and student ID so I know where to report

---

## PHASE 1: DATA MODELING

### Entity: Student

#### Attributes
```
students
├── id (INT, PK, Auto)
├── student_id_number (VARCHAR 20, UNIQUE)     ← Auto-generated: YY{grade}{seq}
├── first_name (VARCHAR 100, NOT NULL)
├── last_name (VARCHAR 100, NOT NULL)
├── date_of_birth (DATE, NOT NULL)
├── gender (ENUM: M, F, Other)
├── national_id (VARCHAR 20, NULLABLE)
├── email (VARCHAR 255, NULLABLE)
├── phone (VARCHAR 20, NULLABLE)
├── enrollment_date (DATE, NOT NULL)           ← When student officially joined
├── status (ENUM: pending, active, suspended, graduated, withdrawn)
├── current_grade (INT, 1-12)                  ← Current class level
├── date_joined (DATE, NOT NULL)
├── date_left (DATE, NULLABLE)
├── enrollment_type (ENUM: regular, transfer, readmit)
├── previous_school (VARCHAR 255, NULLABLE)   ← For transfers
├── admission_number (VARCHAR 20, NULLABLE)    ← Temporary until fully enrolled
├── created_at (TIMESTAMP)
├── updated_at (TIMESTAMP)
└── user_id (INT, FK to users)                 ← Link to login account
```

**Indexes:**
```sql
PRIMARY KEY (id)
UNIQUE (student_id_number)
UNIQUE (email, school_id)  -- Per school
INDEX (status)
INDEX (current_grade)
INDEX (enrollment_date)
INDEX (user_id)
```

---

### Entity: Parent/Guardian

```
guardians
├── id (INT, PK, Auto)
├── student_id (INT, FK to students)
├── first_name (VARCHAR 100, NOT NULL)
├── last_name (VARCHAR 100, NOT NULL)
├── relationship (ENUM: mother, father, guardian, other)
├── email (VARCHAR 255, NOT NULL)
├── phone (VARCHAR 20, NOT NULL)
├── occupation (VARCHAR 100, NULLABLE)
├── employer (VARCHAR 100, NULLABLE)
├── address (TEXT)
├── city (VARCHAR 100)
├── province (VARCHAR 100)
├── postal_code (VARCHAR 10)
├── created_at (TIMESTAMP)
├── updated_at (TIMESTAMP)
└── is_primary (TINYINT)                       ← Main contact person
```

**Indexes:**
```sql
PRIMARY KEY (id)
FOREIGN KEY (student_id) REFERENCES students(id)
INDEX (student_id)
INDEX (email)
```

---

### Entity: Enrollment Application

```
enrollment_applications
├── id (INT, PK, Auto)
├── application_number (VARCHAR 20, UNIQUE)     ← APP-{date}-{seq}
├── first_name (VARCHAR 100, NOT NULL)
├── last_name (VARCHAR 100, NOT NULL)
├── date_of_birth (DATE, NOT NULL)
├── gender (ENUM: M, F, Other)
├── email (VARCHAR 255, NOT NULL)
├── phone (VARCHAR 20, NULLABLE)
├── current_school (VARCHAR 255)
├── current_grade (INT)
├── grades_file (VARCHAR 255)                   ← PDF upload path
├── medical_file (VARCHAR 255)                  ← Medical form upload
├── status (ENUM: draft, submitted, under_review, approved, rejected, enrolled)
├── reviewed_by (INT, FK to users)              ← Admin who reviewed
├── decision_date (DATE, NULLABLE)
├── rejection_reason (TEXT, NULLABLE)
├── parent_name (VARCHAR 100)
├── parent_email (VARCHAR 255)
├── parent_phone (VARCHAR 20)
├── created_at (TIMESTAMP)
├── updated_at (TIMESTAMP)
└── submitted_at (DATETIME, NULLABLE)
```

**Indexes:**
```sql
PRIMARY KEY (id)
UNIQUE (application_number)
INDEX (status)
INDEX (email)
INDEX (created_at)
FOREIGN KEY (reviewed_by) REFERENCES users(id)
```

---

### Entity: Student Class Assignment

```
class_enrollments
├── id (INT, PK, Auto)
├── student_id (INT, FK to students)
├── class_id (INT, FK to classes)               ← Future table
├── enrollment_date (DATE, NOT NULL)
├── is_active (TINYINT DEFAULT 1)
├── created_at (TIMESTAMP)
├── updated_at (TIMESTAMP)
```

**Indexes:**
```sql
PRIMARY KEY (id)
FOREIGN KEY (student_id) REFERENCES students(id)
FOREIGN KEY (class_id) REFERENCES classes(id)
UNIQUE (student_id, class_id, enrollment_date)  ← One enrollment per student per class per term
INDEX (student_id)
INDEX (class_id)
```

---

### Entity: Document Templates (For Later)

```
enrollment_documents
├── id
├── student_id
├── document_type (ENUM: birth_certificate, id_copy, medical_report, grades_transcript)
├── file_path (VARCHAR 255)
├── uploaded_at (DATETIME)
├── uploaded_by (INT, FK to users)
```

---

## PHASE 2: DATABASE SCHEMA (SQL MIGRATIONS)

```sql
-- Migration: 2026-06-07-create-enrollment-tables.sql

-- ─── Enrollment Applications ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollment_applications (
    id              INT UNSIGNED        NOT NULL AUTO_INCREMENT,
    application_number VARCHAR(20)      NOT NULL UNIQUE,
    first_name      VARCHAR(100)        NOT NULL,
    last_name       VARCHAR(100)        NOT NULL,
    date_of_birth   DATE                NOT NULL,
    gender          ENUM('M', 'F', 'Other') NOT NULL DEFAULT 'M',
    email           VARCHAR(255)        NOT NULL,
    phone           VARCHAR(20),
    current_school  VARCHAR(255),
    current_grade   INT,
    
    grades_file     VARCHAR(255),
    medical_file    VARCHAR(255),
    
    status          ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'enrolled')
                    NOT NULL DEFAULT 'draft',
    reviewed_by     INT UNSIGNED,
    decision_date   DATE,
    rejection_reason TEXT,
    
    parent_name     VARCHAR(100),
    parent_email    VARCHAR(255),
    parent_phone    VARCHAR(20),
    
    created_at      TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    submitted_at    DATETIME,
    
    PRIMARY KEY (id),
    UNIQUE KEY uq_application_number (application_number),
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_email (email),
    INDEX idx_created_at (created_at)
);

-- ─── Students ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
    id              INT UNSIGNED        NOT NULL AUTO_INCREMENT,
    student_id_number VARCHAR(20)       NOT NULL UNIQUE,
    first_name      VARCHAR(100)        NOT NULL,
    last_name       VARCHAR(100)        NOT NULL,
    date_of_birth   DATE                NOT NULL,
    gender          ENUM('M', 'F', 'Other') NOT NULL DEFAULT 'M',
    national_id     VARCHAR(20),
    email           VARCHAR(255),
    phone           VARCHAR(20),
    
    enrollment_date DATE                NOT NULL,
    status          ENUM('active', 'suspended', 'graduated', 'withdrawn', 'pending')
                    NOT NULL DEFAULT 'pending',
    current_grade   INT                 DEFAULT 1,
    enrollment_type ENUM('regular', 'transfer', 'readmit') DEFAULT 'regular',
    previous_school VARCHAR(255),
    admission_number VARCHAR(20),
    
    user_id         INT UNSIGNED,
    
    date_joined     DATE                NOT NULL,
    date_left       DATE,
    
    created_at      TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    UNIQUE KEY uq_student_id (student_id_number),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_grade (current_grade),
    INDEX idx_enrollment_date (enrollment_date),
    INDEX idx_user_id (user_id)
);

-- ─── Guardians ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guardians (
    id              INT UNSIGNED        NOT NULL AUTO_INCREMENT,
    student_id      INT UNSIGNED        NOT NULL,
    first_name      VARCHAR(100)        NOT NULL,
    last_name       VARCHAR(100)        NOT NULL,
    relationship    ENUM('mother', 'father', 'guardian', 'other') NOT NULL,
    email           VARCHAR(255)        NOT NULL,
    phone           VARCHAR(20)         NOT NULL,
    
    occupation      VARCHAR(100),
    employer        VARCHAR(100),
    address         TEXT,
    city            VARCHAR(100),
    province        VARCHAR(100),
    postal_code     VARCHAR(10),
    
    is_primary      TINYINT(1)          DEFAULT 1,
    
    created_at      TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    INDEX idx_student_id (student_id),
    INDEX idx_email (email)
);

-- ─── Class Enrollments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_enrollments (
    id              INT UNSIGNED        NOT NULL AUTO_INCREMENT,
    student_id      INT UNSIGNED        NOT NULL,
    class_id        INT UNSIGNED        NOT NULL,  -- Reference to classes table (Sprint 3)
    enrollment_date DATE                NOT NULL,
    is_active       TINYINT(1)          DEFAULT 1,
    
    created_at      TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    UNIQUE KEY uq_student_class_term (student_id, class_id),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    INDEX idx_student_id (student_id),
    INDEX idx_class_id (class_id)
);

-- ─── Enrollment Documents ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollment_documents (
    id              INT UNSIGNED        NOT NULL AUTO_INCREMENT,
    student_id      INT UNSIGNED        NOT NULL,
    document_type   ENUM('birth_certificate', 'id_copy', 'medical_report', 'grades_transcript')
                    NOT NULL,
    file_path       VARCHAR(255)        NOT NULL,
    uploaded_at     DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_by     INT UNSIGNED,
    
    PRIMARY KEY (id),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_student_id (student_id)
);
```

---

## PHASE 3: BACKEND API ENDPOINTS

### Enrollment Application Endpoints

#### 1. Create/Submit Application
```http
POST /api/students/enrollments/apply
Content-Type: application/json

{
  "first_name": "Alice",
  "last_name": "Simwinga",
  "date_of_birth": "2010-05-15",
  "gender": "F",
  "email": "alice.s@email.com",
  "phone": "+260976543210",
  "current_school": "Another Secondary School",
  "current_grade": 8,
  "parent_name": "Mr. John Simwinga",
  "parent_email": "john.s@email.com",
  "parent_phone": "+260976543211"
}

Response: 201 Created
{
  "id": 1,
  "application_number": "APP-20260607-001",
  "status": "submitted",
  "message": "Your application has been submitted. You'll receive confirmation at your email."
}
```

#### 2. List Enrollment Applications (Admin only)
```http
GET /api/students/enrollments/applications?status=pending&page=1&limit=20
Authorization: Bearer {token}

Response: 200 OK
{
  "applications": [
    {
      "id": 1,
      "application_number": "APP-20260607-001",
      "first_name": "Alice",
      "last_name": "Simwinga",
      "email": "alice.s@email.com",
      "status": "submitted",
      "created_at": "2026-06-07T10:30:00Z",
      "parent_name": "Mr. John Simwinga"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

#### 3. Approve Enrollment Application (Admin only)
```http
PATCH /api/students/enrollments/applications/{id}/approve
Authorization: Bearer {token}
Content-Type: application/json

{
  "assigned_grade": 9,
  "notes": "Student approved for Form 2 (Grade 9)"
}

Response: 200 OK
{
  "status": "approved",
  "student_id": 45,
  "student_id_number": "AA00045",
  "message": "Student enrolled successfully"
}
```

#### 4. Reject Enrollment Application (Admin only)
```http
PATCH /api/students/enrollments/applications/{id}/reject
Authorization: Bearer {token}
Content-Type: application/json

{
  "reason": "Applicant does not meet minimum grade requirement"
}

Response: 200 OK
{
  "status": "rejected",
  "message": "Application rejected"
}
```

---

### Student Endpoints

#### 5. Get Student Profile
```http
GET /api/students/{student_id}
Authorization: Bearer {token}

Response: 200 OK
{
  "id": 45,
  "student_id_number": "AA00045",
  "first_name": "Alice",
  "last_name": "Simwinga",
  "date_of_birth": "2010-05-15",
  "gender": "F",
  "email": "alice.s@email.com",
  "phone": "+260976543210",
  "enrollment_date": "2026-06-07",
  "status": "active",
  "current_grade": 9,
  "guardians": [
    {
      "id": 1,
      "first_name": "John",
      "last_name": "Simwinga",
      "relationship": "father",
      "phone": "+260976543211",
      "is_primary": true
    }
  ],
  "current_class": {
    "id": 5,
    "name": "Form 2A",
    "grade": 9,
    "teacher": "Mr. Zulu"
  }
}
```

#### 6. Update Student Profile (Admin)
```http
PATCH /api/students/{student_id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "email": "alice.simwinga@email.com",
  "phone": "+260976543215",
  "current_grade": 10
}

Response: 200 OK
{
  "message": "Student profile updated",
  "student": {...}
}
```

#### 7. List Students (Admin)
```http
GET /api/students?status=active&grade=9&page=1&limit=50
Authorization: Bearer {token}

Response: 200 OK
{
  "students": [
    {
      "id": 45,
      "student_id_number": "AA00045",
      "first_name": "Alice",
      "last_name": "Simwinga",
      "current_grade": 9,
      "status": "active"
    }
  ],
  "total": 1,
  "page": 1
}
```

#### 8. Assign Student to Class (Admin)
```http
POST /api/students/{student_id}/class-assignment
Authorization: Bearer {token}
Content-Type: application/json

{
  "class_id": 5,
  "enrollment_date": "2026-06-07"
}

Response: 201 Created
{
  "message": "Student assigned to class",
  "class_enrollment": {
    "id": 12,
    "student_id": 45,
    "class_id": 5,
    "enrollment_date": "2026-06-07"
  }
}
```

---

### Guardian Endpoints

#### 9. Add Guardian
```http
POST /api/students/{student_id}/guardians
Authorization: Bearer {token}
Content-Type: application/json

{
  "first_name": "Jane",
  "last_name": "Simwinga",
  "relationship": "mother",
  "email": "jane.s@email.com",
  "phone": "+260976543212",
  "occupation": "Teacher",
  "is_primary": false
}

Response: 201 Created
{
  "id": 2,
  "student_id": 45,
  "first_name": "Jane",
  "relationship": "mother"
}
```

#### 10. Update Guardian
```http
PATCH /api/students/{student_id}/guardians/{guardian_id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "phone": "+260976543219"
}

Response: 200 OK
{
  "message": "Guardian updated"
}
```

---

## PHASE 4: FRONTEND - USER INTERFACES

### Screen 1: Enrollment Application Form (Public)

**URL:** `/enroll-student.html`

**Components:**
```
┌─────────────────────────────────────────────┐
│ Admin Assist - Student Enrollment           │
├─────────────────────────────────────────────┤
│                                               │
│ Step 1 of 2: Student Information            │
│ ─────────────────────────────────────────   │
│                                               │
│ [First Name]         [Last Name]            │
│ [Email]              [Phone]                │
│ [Date of Birth]      [Gender: M/F/Other]    │
│                                               │
│ Current School:                              │
│ [Text field]                                 │
│                                               │
│ Current Grade: [Dropdown: 1-12]             │
│                                               │
│                      [ Back ] [ Next →  ]    │
│                                               │
└─────────────────────────────────────────────┘

Step 2 of 2: Guardian Information
─────────────────────────────────────────────

Parent/Guardian Name:
[Full Name]

Relationship: [Dropdown: Mother/Father/Guardian]

Contact Information:
[Email]              [Phone]

Address:
[Address Line]       [City]    [Province]
[Postal Code]

                     [ ← Back ] [ Submit ]
```

**Form Validation:**
- All fields required except phone
- Email format validation
- Age validation: DOB must be 5-25 years old
- Phone format: +260... (Zambian numbers)

**API Call:**
```javascript
POST /api/students/enrollments/apply
```

**Success UX:**
- Show confirmation: "Application submitted! Check your email for confirmation."
- Application number displayed
- "What happens next?" explainer

---

### Screen 2: Application Status Page (Student/Parent)

**URL:** `/application-status.html?app_id=APP-20260607-001`

**Components:**
```
Application Status
───────────────────
Application #: APP-20260607-001
Status: ⏳ PENDING REVIEW

Student: Alice Simwinga
Submitted: June 7, 2026

Timeline:
  ✅ Application Submitted (June 7)
  ⏳ Under Review (June 7 - today)
  ○ Decision (pending)
  ○ Enrollment Complete (pending)

Next Steps: We'll contact you within 5 business days.
```

---

### Screen 3: Admin Dashboard - Enrollments Tab

**URL:** `/dashboard.html` (Enrollments section)

**Components:**
```
┌──────────────────────────────────────────────┐
│ ADMIN DASHBOARD - Student Enrollment        │
├──────────────────────────────────────────────┤
│                                               │
│ Enrollment Pipeline:                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │ Draft   │  │ Pending │  │ Approved│     │
│  │ 0       │→ │ 5       │→ │ 2       │     │
│  └─────────┘  └─────────┘  └─────────┘     │
│                                               │
│ Pending Applications:                        │
│ ┌────┬──────────────┬─────────┬──────┐      │
│ │ ID │ Name         │ Grade   │ Date │      │
│ ├────┼──────────────┼─────────┼──────┤      │
│ │ 1  │ Alice S.     │ Form 2  │ 6/7  │ ✓ ...│
│ │ 2  │ Bob Nkomo    │ Form 1  │ 6/8  │ ✓ ...│
│ │ 3  │ Carol Banda  │ Form 3  │ 6/8  │ ✓ ...│
│ └────┴──────────────┴─────────┴──────┘      │
│  [View Details] [Approve] [Reject]          │
│                                               │
└──────────────────────────────────────────────┘
```

**Features:**
- Filter by status (Draft, Submitted, Approved, Rejected)
- Sort by date, name, grade
- Bulk actions (approve multiple)
- Search by student name/email
- Export to CSV

---

### Screen 4: Approve/Reject Application Modal

**Components:**
```
Approve Application: Alice Simwinga

Student Information:
  Date of Birth: May 15, 2010 (Age: 15)
  Current Grade: 8
  Current School: Another Secondary

Assign to Grade: [Dropdown: 1-12]
Notes:
[Text area for decision notes]

☑ Notify parent via email

              [ Cancel ] [ Approve ]
```

---

### Screen 5: Student Directory (Admin)

**URL:** `/students-directory.html`

**Components:**
```
Student Directory
─────────────────

Search: [________] Filter: [Grade ▼] [Status ▼]

┌────┬─────────────────┬────────┬────────┬──────────┐
│ ID │ Student Name    │ Grade  │ Status │ Actions  │
├────┼─────────────────┼────────┼────────┼──────────┤
│ 45 │ Alice Simwinga  │ Form 2 │ Active │ View ... │
│ 46 │ Bob Nkomo       │ Form 1 │ Active │ View ... │
│ 47 │ Carol Banda     │ Form 3 │ Active │ View ... │
└────┴─────────────────┴────────┴────────┴──────────┘

[Export to CSV] [Print]
```

---

## PHASE 5: BUSINESS LOGIC - STUDENT ID GENERATION

### Student ID Format
```
YYGGGSSS

YY   = Current year (26 for 2026)
GGG  = Grade (001-012)
SSS  = Sequential (001-999)

Example:
  26009001 = Year 2026, Grade 9 (Form 2), 1st student in grade 9
  26009045 = Year 2026, Grade 9, 45th student in grade 9
```

### Generation Logic (Backend)

```javascript
async function generateStudentID(grade) {
    const year = new Date().getFullYear().toString().slice(-2);
    const gradeStr = String(grade).padStart(3, '0');
    
    // Count existing students in this grade this year
    const [result] = await pool.execute(
        `SELECT COUNT(*) as count FROM students 
         WHERE YEAR(enrollment_date) = ? AND current_grade = ?`,
        [new Date().getFullYear(), grade]
    );
    
    const sequence = result[0].count + 1;
    const sequenceStr = String(sequence).padStart(3, '0');
    
    return `${year}${gradeStr}${sequenceStr}`;
}
```

---

## PHASE 6: VALIDATION RULES

### Enrollment Application Validation

| Field | Rule | Error Message |
|-------|------|---------------|
| First Name | 1-100 chars, letters only | "Please enter a valid first name" |
| Last Name | 1-100 chars, letters only | "Please enter a valid last name" |
| DOB | Valid date, age 5-25 | "Student must be between 5 and 25 years old" |
| Email | Valid format, not duplicate | "Please enter a valid email" |
| Phone | +260... format | "Phone must be Zambian format: +260..." |
| Current Grade | 1-12 | "Please select a valid grade" |
| Parent Name | 1-100 chars | "Parent name required" |
| Parent Email | Valid format | "Valid parent email required" |
| Parent Phone | +260... format | "Valid parent phone required" |

### Student Profile Validation

| Field | Rule | Constraint |
|-------|------|-----------|
| Student ID Number | YYGGGSSS | Unique, auto-generated |
| Email | Valid, unique per school | Database unique constraint |
| Status | One of enum values | Database enum constraint |
| Grade | 1-12 | Integer validation |

---

## PHASE 7: PERMISSION & AUTHORIZATION

### Who Can Do What?

| Action | Admin | Headmaster | Staff | Student |
|--------|-------|-----------|-------|---------|
| View applications | ✅ | ✅ | ❌ | ❌ |
| Approve/Reject | ✅ | ✅ | ❌ | ❌ |
| Create student | ✅ | ✅ | ✅ | ❌ |
| Edit student | ✅ | ✅ | ✅ | ❌ |
| Delete student | ✅ | ❌ | ❌ | ❌ |
| View directory | ✅ | ✅ | ✅ | ❌ |
| Assign to class | ✅ | ✅ | ❌ | ❌ |
| View own profile | ✅ | ✅ | ✅ | ✅ |
| Submit application | ✅ | ✅ | ✅ | ✅ |

---

## PHASE 8: IMPLEMENTATION ROADMAP

### Sprint 2 - Week 1

**Day 1-2: Backend Setup**
- [ ] Database migration: Create enrollment_applications, students, guardians tables
- [ ] Test database connection
- [ ] Create schema indexes and foreign keys

**Day 2-3: Backend Controllers**
- [ ] Create enrollment application controller
- [ ] Create students controller
- [ ] Create guardians controller
- [ ] Implement CRUD operations

**Day 3-4: Backend Routes**
- [ ] Create /api/students/enrollments/* routes
- [ ] Create /api/students/* routes
- [ ] Add role-based authorization middleware
- [ ] Test with Postman

---

### Sprint 2 - Week 2

**Day 5: Frontend Setup**
- [ ] Create enroll-student.html form
- [ ] Create application-status.html page
- [ ] Add enrollment section to dashboard
- [ ] Create student directory page

**Day 6-7: Frontend Integration**
- [ ] Connect forms to API endpoints
- [ ] Add form validation
- [ ] Add success/error messaging
- [ ] Handle loading states

**Day 8: Testing & Polish**
- [ ] End-to-end testing (apply → approve → view)
- [ ] Mobile responsiveness
- [ ] Error scenario testing
- [ ] Performance optimization

---

## PHASE 9: TESTING CHECKLIST

### Functional Tests

```
Enrollment Application:
  ✓ Submit application with all fields
  ✓ Submit with missing required fields (error)
  ✓ Duplicate email detection
  ✓ Email validation
  ✓ Age validation (5-25 years)
  ✓ Confirmation email sent

Admin Review:
  ✓ Admin views pending applications
  ✓ Admin approves application
  ✓ Notification sent to parent
  ✓ Student ID generated correctly
  ✓ Student account created on approval
  ✓ Student assigned to grade

Student Management:
  ✓ View student profile
  ✓ Edit student information
  ✓ Assign student to class
  ✓ Remove student from class
  ✓ Change student status (active→suspended)

Authorization:
  ✓ Staff can create students but not delete
  ✓ Student cannot view other students
  ✓ Non-admin cannot approve applications
  ✓ Admin has full access
```

### Data Integrity Tests

```
Database:
  ✓ Student ID numbers are unique
  ✓ Email unique constraint works
  ✓ Foreign key constraints enforced
  ✓ No orphaned records
  ✓ Timestamps auto-updated
```

### Performance Tests

```
API Response Times:
  ✓ GET /api/students (1000+ records): < 500ms
  ✓ POST /api/students/enrollments/apply: < 1s
  ✓ GET /api/students/enrollments/applications: < 500ms
```

---

## DEPENDENCIES & BLOCKERS

### Must Complete Before Sprint 2:
- [x] Sprint 1 authentication complete
- [x] Database connection working
- [x] User roles implemented
- [x] JWT authentication active

### External Dependencies:
- [ ] Email service (Brevo) configured
- [ ] File upload service (for grade transcripts)
- [ ] QR code generator library (for student IDs)

---

## SUCCESS CRITERIA

### Sprint 2 Complete When:

1. ✅ Students can submit enrollment applications online
2. ✅ Admins can review and approve/reject applications
3. ✅ Approved students get unique ID numbers (YYGGGSSS format)
4. ✅ Students can view their profile and class assignment
5. ✅ Admin can manage student directory
6. ✅ All tests pass (functional, data integrity, performance)
7. ✅ Mobile responsive and accessible
8. ✅ Documentation complete

---

## ESTIMATED EFFORT

| Component | Hours | Notes |
|-----------|-------|-------|
| Database schema | 4 | Migrations, indexes, constraints |
| Backend controllers | 8 | CRUD for applications, students, guardians |
| Backend routes & auth | 6 | 10+ endpoints, permission checks |
| Frontend forms | 8 | Application form, multi-step validation |
| Frontend integration | 6 | API calls, loading states, error handling |
| Admin dashboard | 6 | Directory, pipeline view, bulk actions |
| Testing | 8 | Manual + automated tests |
| Documentation | 4 | API docs, deployment guide |
| **TOTAL** | **~50 hours** | |

**Recommended:** 2 devs × 2 weeks (40 hours) = Complete

---

## NEXT STEPS (After Sprint 2)

### Sprint 3: Class Management
- Create classes
- Assign teachers to classes
- Manage class rosters
- Attendance tracking foundation

### Sprint 4: Attendance System
- Mark daily attendance
- Generate attendance reports
- Parent notifications
- Absence tracking

---

**This roadmap ensures systematic, production-ready development of the enrollment module. Ready to begin? 🚀**
