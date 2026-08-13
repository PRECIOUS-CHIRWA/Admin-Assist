# Admin Assist — School Information System (SIS)

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-v5.0-blue.svg)](https://expressjs.com)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-orange.svg)](https://www.mysql.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Admin Assist** is a web-based School Information System (SIS) designed for Zambian secondary schools (CS301 Capstone Project, Copperbelt University). It streamlines student enrollment, attendance tracking, ECZ academic results calculation, staff management, and official school reporting.

---

## 🚀 System Architecture

- **Backend (`/Backend`):** Node.js, Express 5, MySQL (`mysql2/promise`), JWT with httpOnly cookie refresh tokens, `scrypt` password hashing, Brevo email integration, and security middleware (`helmet`, CORS allowlist, rate limiting).
- **Frontend (`/Frontend`):** Vanilla HTML5, CSS3, JavaScript (ES6+), zero build step. Uses `authFetch()` with Automatic Token Refresh & Role-Based Access Control (RBAC).
- **Database (`/Backend/Database`):** Master idempotent MySQL schema (`schema.sql`) supporting local MySQL and Aiven Cloud MySQL.

---

## 🛠️ Tech Stack & Key Features

### Modules & Sprints
1. **Sprint 1 — Authentication & RBAC:** JWT auth, brute-force lockout, self-registration landing as `user`, role request workflow (`admin`, `headmaster`, `staff`, `user`), bootstrap admin script.
2. **Sprint 2 — Student Management:** Full enrollment, student profiles, status toggles, grade/section filtering, audit trail.
3. **Sprint 3 — Attendance Tracking:** Session-based attendance, present/absent/late/excused status, monthly trends, class summaries.
4. **Sprint 4 — Academic Records & ECZ Grading:** Assessment scores (Test, Assignment, Exam), auto-calculated totals & percentages, official ECZ grades (Distinction 1-2, Merit 3-4, Credit 5-6, Satisfactory 7-8, Fail 9), subject position ranking.
5. **Sprint 5 — Reports & Transcripts:** CSV & PDF export for academic performance, student transcripts, attendance histories, and top performers.
6. **Sprint 6 — Teaching Staff & Settings:** Staff directory, temporary password provisioning, school profile settings, system date/timezone defaults.

---

## 📁 Repository Layout

```
Admin-Assist/
├── Backend/
│   ├── src/
│   │   ├── config/         # MySQL connection pool
│   │   ├── controllers/    # Auth, Students, Teachers, Results, Attendance, Reports, Settings
│   │   ├── middleware/     # JWT authentication & RBAC authorization
│   │   ├── routes/         # Express router manifests
│   │   └── services/       # Email delivery (Brevo API)
│   ├── scripts/
│   │   └── create-admin.js # CLI bootstrap admin creation script
│   ├── Database/
│   │   ├── schema.sql      # Consolidated master database schema
│   │   └── README.md       # Database setup guide
│   ├── tests/
│   │   └── smoke.test.js   # Native Node.js test runner suite
│   ├── .env.example        # Environment variable template
│   ├── package.json
│   └── server.js           # Server entry point
└── Frontend/
    ├── index.html          # Public landing page
    └── Src/                # Application pages, auth guards, navigation shell, styles
```

---

## 💻 Quick Start & Installation

### 1. Prerequisites
- **Node.js:** v18.0.0 or higher
- **MySQL Database:** Local MySQL Server or Aiven Cloud MySQL

### 2. Environment Configuration
Navigate to the `Backend` directory and set up environment variables:

```bash
cd Backend
cp .env.example .env
```

Edit `.env` with your database credentials:
```ini
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=admin_assist_db
JWT_SECRET=your_long_random_jwt_secret
ALLOWED_ORIGIN=http://localhost:5500,https://precious-chirwa.github.io
PUBLIC_APP_URL=http://localhost:5500
```

### 3. Database Initialization
Apply the consolidated master schema to your MySQL instance:

```bash
mysql -u root -p admin_assist_db < Database/schema.sql
```

### 4. Create First Administrator Account
Run the bootstrap script to create the initial admin user:

```bash
node scripts/create-admin.js --name "School Admin" --email "admin@school.zm" --password "AdminPass123!"
```

### 5. Start Backend Server
```bash
npm install
npm start
# Server will run on http://localhost:5000
```

### 6. Serve Frontend
Serve the `Frontend/Src` directory using any static web server (e.g. Live Server or `http-server`):

```bash
npx http-server Frontend/Src -p 5500
# Open http://localhost:5500/login.html in your browser
```

---

## 🧪 Testing

Run backend integration and smoke tests:

```bash
cd Backend
npm test
```

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

Made with care by the **Admin Assist Team** (Copperbelt University CS301). Supervisor: Dr Lengwe.
