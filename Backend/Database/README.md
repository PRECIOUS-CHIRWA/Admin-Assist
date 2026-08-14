# Admin Assist — Database Setup Guide

## Single Source of Truth (`schema.sql`)

The master database schema for Admin Assist is consolidated into a single idempotent file:
**`Backend/Database/schema.sql`**

It creates all 21 tables in foreign key dependency order, seeds reference data (grading scales, default academic year, terms, subjects, default school), and applies performance indexes.

---

## Quick Start (Fresh Install / Local / Aiven)

### Local MySQL
```bash
mysql -u root -p < Backend/Database/schema.sql
```

### Aiven Cloud MySQL
1. Open the Aiven Console -> MySQL Service -> Query Editor.
2. Paste the complete contents of `Backend/Database/schema.sql` and run.

---

## Historical Sprint Migrations (`Backend/Database/migrations/`)

For historical reference or incremental audit tracing, individual sprint migration files are preserved in `Backend/Database/migrations/`:
- `Sprint2-aiven.sql`
- `sprint2-pm.sql`
- `2026-06-07-email-verification.sql`
- `sprint3-attendance.sql`

*Note: You do NOT need to execute individual migration files for fresh setups — `schema.sql` includes all structures.*
