# Admin Assist — Database Guide

## Fresh Install (new environment or local dev)

```bash
# Connect to your MySQL instance and run the master schema:
mysql -h HOST -u USER -p DATABASE < Backend/Database/schema.sql

# Or using Aiven: paste the contents of schema.sql into the Aiven Query Editor.
```

This single file creates all tables in FK dependency order and seeds reference data (grading scales, default academic year/terms, subjects, default school).

---

## Incremental Migrations (existing Aiven instance)

The sprint migration files are the authoritative history. Run them in order if you are on an existing database rather than doing a fresh install:

| File | What it adds |
|---|---|
| `schema.sql` | Sprint 1: users, refresh_tokens, students, audit_log |
| `Sprint2-aiven.sql` | Sprint 2: grading_scales, moderation_checklists, teacher_notes |
| `sprint2-pm.sql` | Sprint 2: role_change_requests |
| `2026-06-07-email-verification.sql` | Sprint 2: email_verified cols + email_verification_tokens |
| `sprint3-attendance.sql` | Sprint 3: schools, academic_years, terms, classes, subjects, teacher_subjects, attendance_sessions, attendance_records |

Tables added in the master `schema.sql` that have **no prior migration file**:
- `results` — use `schema.sql` CREATE TABLE block for this table only
- `school_settings` — use `schema.sql` CREATE TABLE block
- `notifications` — use `schema.sql` CREATE TABLE block
- `password_reset_tokens` — use `schema.sql` CREATE TABLE block

---

## Local MySQL vs. Aiven

**Local dev:**
```bash
mysql -u root -p < Backend/Database/schema.sql
```
Set `.env` DB_* vars to point at local instance.

**Aiven:**
1. Open the Aiven console → your MySQL service → Query Editor
2. Paste the contents of `schema.sql` and run.

Or using MySQL Workbench / DBeaver connected to Aiven with SSL.

---

## Reconciling if Aiven schema diverges

If your live Aiven table differs from this file, check the live definition first:
```sql
SHOW CREATE TABLE table_name\G
```

Then manually apply any missing columns as `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` statements rather than re-running the full schema.
