# Sprint 1 Testing & Debugging Plan
## Admin Assist Authentication System

**Last Updated:** June 7, 2026  
**Target Platform:** Chrome, Firefox, Safari, Edge (Desktop + Mobile)

---

## TEST SUITES

### Suite 1: Email + Password Authentication (CRITICAL)

#### Test 1.1: Valid Signup
**Precondition:** Fresh database, landing page open
**Steps:**
1. Click "Get Started" → signup.html
2. Fill form:
   - Full Name: "John Mwale"
   - Email: "john@zamschool.zm"
   - Role: "Staff"
   - Password: "SecurePass123!"
   - Confirm: "SecurePass123!"
3. Click "Sign Up"

**Expected Result:**
- ✅ Button shows "Creating account..."
- ✅ Success message: "Account created. Check your email before logging in."
- ✅ Form clears
- ✅ User receives verification email from noreply@admin-assist.com
- ✅ Email contains verification link with email + token params

**Current Status:** ⚠️ Partially Works (missing post-signup UX)
**Fix Needed:** Auto-redirect to "Check your email" page

---

#### Test 1.2: Signup with Duplicate Email
**Precondition:** User "john@zamschool.zm" exists

**Steps:**
1. Try signing up with same email
2. Fill form identically to Test 1.1

**Expected Result:**
- ✅ Error message: "A user with this email already exists"
- ✅ Form not submitted

**Current Status:** ✅ Works
**Evidence:** Backend checks SELECT COUNT, returns 409 Conflict

---

#### Test 1.3: Signup with Invalid Password (Too Short)
**Steps:**
1. Fill signup form with password: "pass"
2. Confirm: "pass"
3. Click Sign Up

**Expected Result:**
- ✅ Frontend shows: "Password must be at least 8 characters"
- ✅ Form NOT submitted
- ✅ API never called

**Current Status:** ✅ Works (HTML minlength="8")

---

#### Test 1.4: Signup with Password Mismatch
**Steps:**
1. Password: "SecurePass123!"
2. Confirm: "DifferentPass123!"
3. Click Sign Up

**Expected Result:**
- ✅ Frontend shows: "Passwords do not match"
- ✅ Form NOT submitted

**Current Status:** ✅ Works

---

#### Test 1.5: Email Verification Flow
**Precondition:** User signed up but NOT verified

**Steps:**
1. Check email inbox for verification link
2. Link format: `verify-email.html?email=john@zamschool.zm&token=abcd1234`
3. Click link

**Expected Result:**
- ✅ Page shows: "Checking your verification link..."
- ✅ Page calls POST /api/auth/verify-email with email + token
- ✅ Backend validates token expiry (24h)
- ✅ Backend updates users.email_verified = 1
- ✅ Page shows: "Email verified successfully. You can now log in."
- ✅ "Go to Login" button visible

**Current Status:** 🟠 Partially Works
**Issues:**
- No loading spinner
- No auto-redirect after success
- UX confusing for non-technical users

**Fix Needed:**
```javascript
// verify-email.html - after success
setTimeout(() => {
    window.location.href = 'login.html';
}, 3000);
```

---

#### Test 1.6: Login with Verified Email
**Precondition:** User verified their email

**Steps:**
1. Go to login.html
2. Email: "john@zamschool.zm"
3. Password: "SecurePass123!"
4. Click Login

**Expected Result:**
- ✅ Button shows "Signing in..."
- ✅ POST /api/auth/login called
- ✅ Backend validates password (Scrypt)
- ✅ Backend resets failed_attempts = 0
- ✅ Backend returns accessToken + user data
- ✅ Frontend stores in localStorage
- ✅ Frontend redirects to dashboard.html
- ✅ Dashboard displays user name + role

**Current Status:** 🟠 Broken
**Issues:**
- Uses sessionStorage (volatile - lost on refresh)
- Dashboard not fetching user data
- No role-specific redirect

---

#### Test 1.7: Login with Unverified Email
**Precondition:** User signed up but didn't verify email

**Steps:**
1. Try logging in
2. Email: (unverified user)
3. Password: (correct)
4. Click Login

**Expected Result:**
- ✅ Error: "Please verify your email address before logging in."
- ✅ Login form still visible
- ✅ User can click "Resend verification link"

**Current Status:** ✅ Partially Works
**Issues:**
- No "Resend verification link" button on login page
- User stuck

---

#### Test 1.8: Brute Force Protection
**Precondition:** Fresh user account

**Steps:**
1. Try logging in 5 times with WRONG password
2. On 5th attempt, user should be locked

**Expected Result (After 5 failed attempts):**
- ✅ Error: "Account locked due to too many failed attempts. Try again in 15 minutes."
- ✅ Login form disabled
- ✅ Database shows: locked_until = NOW + 15min, failed_attempts = 5

**After 15 minutes:**
- ✅ User can try again
- ✅ failed_attempts resets to 0

**Current Status:** ✅ Works
**Evidence:** Backend implements MAX_ATTEMPTS = 5, LOCKOUT_MS = 15min

---

#### Test 1.9: Page Refresh While Logged In
**Precondition:** User logged in, on dashboard.html

**Steps:**
1. Press F5 (refresh page)
2. Or close tab and reopen dashboard.html

**Expected Result:**
- ✅ User still logged in
- ✅ Dashboard shows same user info
- ✅ Tokens preserved

**Current Status:** 🔴 Broken
**Issue:** sessionStorage cleared on refresh
**Fix:** Use localStorage instead

---

#### Test 1.10: Session Expiry (Access Token)
**Precondition:** User logged in

**Steps:**
1. Wait 15+ minutes
2. Try to load page or click API button
3. Or manually expire token by deleting from localStorage

**Expected Result:**
- ✅ API returns 401 Unauthorized
- ✅ Frontend redirects to login.html
- ✅ Message: "Session expired, please log in again"

**Current Status:** 🟠 Partially Works
**Issues:**
- No refresh token implementation
- User forced to re-login (should auto-refresh)

---

### Suite 2: Dashboard Authorization (CRITICAL)

#### Test 2.1: Unauthorized Access to Dashboard
**Precondition:** NOT logged in

**Steps:**
1. Type dashboard.html in browser address bar
2. Press Enter

**Expected Result:**
- ❌ Should redirect to login.html
- ❌ Should NOT show dashboard content

**Current Status:** 🔴 Broken
**Issue:** No auth guard
**Fix:** Add to dashboard.html:
```javascript
if (!localStorage.getItem('accessToken')) {
    window.location.href = 'login.html';
}
```

---

#### Test 2.2: Role-Based Dashboard (Admin)
**Precondition:** Logged in as admin

**Steps:**
1. Load dashboard.html
2. Check for admin-specific cards

**Expected Result:**
- ✅ Visible: "Student Enrollment" card
- ✅ Visible: "Pending Approvals" stat
- ✅ Visible: Admin/Headmaster only features

**Current Status:** ⚠️ Frontend shows, backend not enforced

---

#### Test 2.3: Role-Based API Access
**Precondition:** Logged in as "staff" user

**Steps:**
1. Try calling GET /api/auth/admin/users
2. With valid accessToken

**Expected Result:**
- ✅ Returns 403 Forbidden
- ✅ Message: "You do not have permission to access this resource"
- ✅ Doesn't return user list

**Current Status:** ✅ Works
**Evidence:** Backend uses authorize("admin", "headmaster") middleware

---

### Suite 3: API Security (CRITICAL)

#### Test 3.1: Request Without Authorization Header
**Steps:**
1. POST /api/auth/me (authenticated endpoint)
2. NO Authorization header
3. OR header = "Bearer invalid"

**Expected Result:**
- ✅ Returns 401 Unauthorized
- ✅ Message: "Authentication required" or "Invalid token"

**Current Status:** ✅ Works

---

#### Test 3.2: CORS - Unauthorized Origin
**Precondition:** API_BASE points to your backend

**Steps:**
1. Open browser console
2. Fetch from different domain (e.g., example.com):
```javascript
fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({...})
})
```

**Expected Result:**
- ✅ CORS error in console
- ✅ Request blocked
- ✅ No response from server

**Current Status:** ✅ Works
**Evidence:** CORS allows only localhost:5500 + ALLOWED_ORIGIN

---

#### Test 3.3: Rate Limiting - Auth Endpoints
**Precondition:** None

**Steps:**
1. Send 25 POST requests to /api/auth/login in 15 minutes
2. From same IP

**Expected Result (after 20 requests):**
- ✅ Returns 429 Too Many Requests
- ✅ Message: "Too many requests from this IP, please try again in 15 minutes"
- ✅ Requests blocked for 15 minutes

**Current Status:** ✅ Works
**Evidence:** authLimiter = 20 req/15min

---

### Suite 4: Data Validation (IMPORTANT)

#### Test 4.1: SQL Injection Attempt
**Steps:**
1. Email field: `' OR '1'='1`
2. Password: anything
3. Try to login

**Expected Result:**
- ✅ No SQL injection
- ✅ Error: "Invalid email or password"
- ✅ Database not compromised

**Current Status:** ✅ Works
**Evidence:** Using parameterized queries (pool.execute with ?)

---

#### Test 4.2: XSS Attempt in Name Field
**Steps:**
1. Full Name: `<script>alert('XSS')</script>`
2. Complete signup
3. Check dashboard

**Expected Result:**
- ✅ Script NOT executed
- ✅ Name displayed as literal text
- ✅ Dashboard safe

**Current Status:** ⚠️ Depends on frontend rendering
**Issue:** Email service escapes HTML. Dashboard needs testing.

---

#### Test 4.3: Invalid JSON in Request Body
**Steps:**
1. POST /api/auth/login with invalid JSON:
```json
{invalid json}
```

**Expected Result:**
- ✅ Returns 400 Bad Request
- ✅ JSON parse error caught

**Current Status:** ✅ Works
**Evidence:** express.json() middleware handles parse errors

---

### Suite 5: Email Service (IMPORTANT)

#### Test 5.1: Verification Email Sends
**Steps:**
1. Sign up new account
2. Check Brevo email logs

**Expected Result:**
- ✅ Email delivered within 30 seconds
- ✅ From: noreply@admin-assist.com (or configured sender)
- ✅ Subject: "Verify your Admin Assist account"
- ✅ Contains verification link
- ✅ Link format: verify-email.html?email=X&token=Y

**Current Status:** ⚠️ Depends on Brevo API key
**Testing:** Need valid BREVO_API_KEY + BREVO_SENDER_EMAIL in .env

---

#### Test 5.2: Resend Verification Email
**Precondition:** User already signed up

**Steps:**
1. POST /api/auth/resend-verification
2. Body: { email: "john@zamschool.zm" }
3. Check inbox

**Expected Result:**
- ✅ New verification email sent
- ✅ New token generated
- ✅ Old token invalidated

**Current Status:** ✅ Implemented (needs testing)

---

### Suite 6: Database Integrity (IMPORTANT)

#### Test 6.1: Unique Email Constraint
**Steps:**
1. Create two accounts with same email via simultaneous requests

**Expected Result:**
- ✅ Only ONE account created
- ✅ Second request returns 409 Duplicate

**Current Status:** ✅ Works (UNIQUE constraint on email)

---

#### Test 6.2: Refresh Token Stored Securely
**Steps:**
1. Login successfully
2. Check database: SELECT token_hash FROM refresh_tokens

**Expected Result:**
- ✅ token_hash is 64-char hex (SHA-256)
- ✅ Raw token NEVER stored
- ✅ Only hash in database

**Current Status:** ✅ Works
**Evidence:** hashToken(token) = SHA256 hash

---

---

## DEBUGGING CHECKLIST

When tests fail, check:

### Network Issues
```bash
# 1. Is backend running?
curl -X GET http://localhost:5000

# 2. CORS error?
Check browser console for: "CORS policy: No 'Access-Control-Allow-Origin' header"

# 3. Is frontend pointing to right API?
Check auth.js: const API_BASE = ...
```

### Authentication Issues
```bash
# 1. Check JWT_SECRET is set
echo $JWT_SECRET

# 2. Verify token:
# Decode: jwt.io → paste accessToken
# Should show: { sub: 1, email: "...", role: "..." }

# 3. Check database connection
mysql admin_assist_db
SELECT COUNT(*) FROM users;
```

### Database Issues
```bash
# 1. Check schema loaded
mysql admin_assist_db -e "SHOW TABLES;"

# 2. Check email verification tokens
mysql admin_assist_db -e "SELECT * FROM email_verification_tokens;"

# 3. Check refresh tokens
mysql admin_assist_db -e "SELECT * FROM refresh_tokens LIMIT 5;"
```

### Email Issues
```bash
# 1. Brevo API key valid?
curl -X GET https://api.brevo.com/v3/account \
  -H "api-key: YOUR_KEY"

# 2. Check .env has:
BREVO_API_KEY=...
BREVO_SENDER_EMAIL=verified@example.com

# 3. Check email in Brevo sent logs
```

---

## MANUAL TEST SCENARIOS

### Scenario 1: Complete Sign Up → Verify → Login Journey
**Time:** 5 minutes

1. ✅ Visit landing page
2. ✅ Click "Get Started"
3. ✅ Fill signup form with new email
4. ✅ See success message
5. ✅ Check email (Brevo)
6. ✅ Click verification link
7. ✅ See "Email verified"
8. ✅ Go to login
9. ✅ Enter email + password
10. ✅ Redirected to dashboard
11. ✅ Dashboard shows user name + role

**Failure Points:**
- Email not sent?
- Link expired?
- Redirect loop?
- Dashboard blank?

---

### Scenario 2: Permission Denied
**Time:** 3 minutes

1. ✅ Login as "staff"
2. ✅ Try to access admin enrollment form
3. ✅ Should be denied/redirected

---

### Scenario 3: Mobile Experience
**Time:** 5 minutes  
**Device:** iPhone or Android

1. ✅ Visit landing page on mobile
2. ✅ Navigation menu works
3. ✅ Sign up form is readable
4. ✅ Buttons are tap-friendly (44x44px minimum)
5. ✅ Password visibility toggle works

---

## EXPECTED TEST RESULTS

| Test | Current | Target | Notes |
|------|---------|--------|-------|
| Email signup | ✅ | ✅ | Working |
| Email verification | 🟠 | ✅ | Need UX fixes |
| Login | 🟠 | ✅ | Need localStorage fix |
| Dashboard protection | 🔴 | ✅ | MISSING auth guard |
| Page refresh session | 🔴 | ✅ | sessionStorage → localStorage |
| Role-based access | ✅ | ✅ | Backend enforces |
| Brute force lock | ✅ | ✅ | Working |
| CORS enforcement | ✅ | ✅ | Working |
| SQL injection | ✅ | ✅ | Parameterized queries |
| Rate limiting | ✅ | ✅ | Working |

---

## PASS/FAIL CRITERIA FOR SPRINT 1

**PASS (All must be ✅):**
- [ ] Email + Password signup works
- [ ] Email verification works
- [ ] Login with verified email works
- [ ] Dashboard protected (auth guard)
- [ ] Session persists on page refresh
- [ ] Role-based access enforced
- [ ] Brute force protection works
- [ ] CORS properly configured
- [ ] No SQL injection/XSS vulnerabilities
- [ ] Rate limiting prevents abuse

**If ANY fails → Cannot proceed to Sprint 2**
