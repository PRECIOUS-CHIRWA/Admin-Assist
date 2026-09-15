/**
 * academic-records.js — Admin Assist Class-First Results Entry & Management
 * Implements exact sequential context selection:
 *   Class -> Academic Year (auto-defaulted) -> Term -> Subject -> Load Results -> Full Roster -> Save All
 * Strict 0-100 bounds validation on both frontend & backend.
 */
(function () {
    'use strict';

    let _allClasses = [];
    let _allYears = [];
    let _allTerms = [];
    let _allSubjects = [];
    let _currentRoster = [];
    let _policy = {
        assessment_model: 'MID_TERM_FINAL',
        mid_term_weight: 20,
        final_term_weight: 80,
        continuous_assessment_enabled: 0,
        continuous_assessment_weight: 0,
        grading_scheme: 'ADMIN_ASSIST_ECZ'
    };

    let _userRole = 'user';
    let _isTeacher = false;

    // Elements
    let selClass, selYear, selTerm, selSubject, loadBtn, saveBtn, saveBtnBottom;
    let rosterTbody, rosterBadge, rosterHeading, rosterSubheading, rosterFooter;
    let thCA, policyInfoLabel, validationBanner, validationBannerMsg, saveStatusText;

    document.addEventListener('DOMContentLoaded', async function () {
        try {
            const u = JSON.parse(localStorage.getItem('user') || '{}');
            _userRole = u.role || 'user';
            _isTeacher = !!(u.role === 'staff' || u.is_teacher || u.school_position === 'Teacher');
        } catch { /* use defaults */ }

        // If student or parent, redirect to transcript view
        if (_userRole === 'user') {
            window.location.replace('student-transcript.html');
            return;
        }

        initElements();
        bindEvents();
        await loadInitialContext();
    });

    function initElements() {
        selClass = document.getElementById('selClass');
        selYear = document.getElementById('selYear');
        selTerm = document.getElementById('selTerm');
        selSubject = document.getElementById('selSubject');
        loadBtn = document.getElementById('loadResultsBtn');
        saveBtn = document.getElementById('saveAllResultsBtn');
        saveBtnBottom = document.getElementById('saveAllResultsBtnBottom');

        rosterTbody = document.getElementById('rosterTbody');
        rosterBadge = document.getElementById('rosterBadge');
        rosterHeading = document.getElementById('rosterHeading');
        rosterSubheading = document.getElementById('rosterSubheading');
        rosterFooter = document.getElementById('rosterFooter');
        thCA = document.getElementById('thCA');
        policyInfoLabel = document.getElementById('policyInfoLabel');
        validationBanner = document.getElementById('validationBanner');
        validationBannerMsg = document.getElementById('validationBannerMsg');
        saveStatusText = document.getElementById('saveStatusText');
    }

    function bindEvents() {
        // Step 1: Class change -> enables and populates Academic Year (auto-defaulting to current year)
        selClass.addEventListener('change', onClassChanged);

        // Step 2: Academic Year change -> enables and populates Term
        selYear.addEventListener('change', onYearChanged);

        // Step 3: Term change -> enables and populates Subject
        selTerm.addEventListener('change', onTermChanged);

        // Step 4: Subject change -> enables Load Results
        selSubject.addEventListener('change', onSubjectChanged);

        // Step 5: Load Results
        loadBtn.addEventListener('click', loadClassRoster);

        // Step 6: Save All Results
        saveBtn.addEventListener('click', saveAllResults);
        if (saveBtnBottom) saveBtnBottom.addEventListener('click', saveAllResults);
    }

    /* ─── Step 1: Initial Context Loader (Classes) ────────────────────────── */
    async function loadInitialContext() {
        try {
            if (window.AALoader && window.AALoader.reqStart) window.AALoader.reqStart();

            // Fetch teacher-authorized classes
            const classesUrl = _isTeacher ? '/api/attendance/classes?teaching=1' : '/api/attendance/classes';
            const res = await apiFetch(classesUrl);
            if (!res || !res.ok) throw new Error('Failed to load authorized classes');

            _allClasses = await res.json();
            _populateDropdown(selClass, _allClasses, 'id', c => c.class_name || `${c.grade_level}${c.stream ? ' ' + c.stream : ''}`, 'Select Class…');

            // Also load school assessment policy in parallel
            try {
                const pRes = await apiFetch('/api/results/policy');
                if (pRes && pRes.ok) {
                    const pData = await pRes.json();
                    _policy = Object.assign(_policy, pData.policy || pData);
                }
            } catch { /* use default policy */ }

        } catch (err) {
            console.error('loadInitialContext error:', err);
            selClass.innerHTML = '<option value="">Unable to load classes</option>';
        } finally {
            if (window.AALoader && window.AALoader.reqEnd) window.AALoader.reqEnd();
        }
    }

    /* ─── Step 1 -> Step 2: On Class Selected ─────────────────────────────── */
    async function onClassChanged() {
        const classId = selClass.value;

        // Reset downstream selectors
        selYear.disabled = true;
        selYear.innerHTML = '<option value="">Select Year…</option>';
        selTerm.disabled = true;
        selTerm.innerHTML = '<option value="">Select Term…</option>';
        selSubject.disabled = true;
        selSubject.innerHTML = '<option value="">Select Subject…</option>';
        loadBtn.disabled = true;
        resetRosterTable();

        if (!classId) return;

        try {
            if (window.AALoader && window.AALoader.reqStart) window.AALoader.reqStart();

            // Load Academic Years
            const res = await apiFetch('/api/attendance/academic-years');
            if (!res || !res.ok) throw new Error('Failed to load academic years');
            _allYears = await res.json();

            _populateDropdown(selYear, _allYears, 'id', y => y.year_label, 'Select Year…');
            selYear.disabled = false;

            // Requirement 1, Step 2: Auto-default to the system's current academic year from DB
            const currentYear = _allYears.find(y => y.is_current === 1 || y.is_current === true) || _allYears[0];
            if (currentYear) {
                selYear.value = String(currentYear.id);
                // Automatically cascade to load terms for the defaulted year
                await onYearChanged();
            }
        } catch (err) {
            console.error('onClassChanged error:', err);
            selYear.innerHTML = '<option value="">Error loading years</option>';
        } finally {
            if (window.AALoader && window.AALoader.reqEnd) window.AALoader.reqEnd();
        }
    }

    /* ─── Step 2 -> Step 3: On Academic Year Selected ─────────────────────── */
    async function onYearChanged() {
        const yearId = selYear.value;

        // Reset downstream selectors
        selTerm.disabled = true;
        selTerm.innerHTML = '<option value="">Select Term…</option>';
        selSubject.disabled = true;
        selSubject.innerHTML = '<option value="">Select Subject…</option>';
        loadBtn.disabled = true;
        resetRosterTable();

        if (!yearId) return;

        try {
            if (window.AALoader && window.AALoader.reqStart) window.AALoader.reqStart();

            // Load Terms for selected academic year
            const res = await apiFetch(`/api/attendance/terms?academic_year_id=${encodeURIComponent(yearId)}`);
            if (!res || !res.ok) throw new Error('Failed to load terms');
            _allTerms = await res.json();

            _populateDropdown(selTerm, _allTerms, 'id', t => `${t.term_name}${t.year_label ? ' (' + t.year_label + ')' : ''}`, 'Select Term…');
            selTerm.disabled = false;

            // Auto-default to current term if available, or first term
            const currentTerm = _allTerms.find(t => t.is_current === 1 || t.is_current === true) || _allTerms[0];
            if (currentTerm) {
                selTerm.value = String(currentTerm.id);
                await onTermChanged();
            }
        } catch (err) {
            console.error('onYearChanged error:', err);
            selTerm.innerHTML = '<option value="">Error loading terms</option>';
        } finally {
            if (window.AALoader && window.AALoader.reqEnd) window.AALoader.reqEnd();
        }
    }

    /* ─── Step 3 -> Step 4: On Term Selected ─────────────────────────────── */
    async function onTermChanged() {
        const classId = selClass.value;
        const yearId = selYear.value;
        const termId = selTerm.value;

        selSubject.disabled = true;
        selSubject.innerHTML = '<option value="">Select Subject…</option>';
        loadBtn.disabled = true;
        resetRosterTable();

        if (!classId || !yearId || !termId) return;

        try {
            if (window.AALoader && window.AALoader.reqStart) window.AALoader.reqStart();

            // Requirement 1, Step 4: Only subjects assigned to authenticated teacher for this class
            const url = `/api/attendance/subjects?class_id=${encodeURIComponent(classId)}&academic_year_id=${encodeURIComponent(yearId)}&teaching=1`;
            const res = await apiFetch(url);
            if (!res || !res.ok) throw new Error('Failed to load assigned subjects');
            _allSubjects = await res.json();

            if (!_allSubjects.length) {
                selSubject.innerHTML = '<option value="">No subjects assigned to you for this class</option>';
                selSubject.disabled = true;
                return;
            }

            _populateDropdown(selSubject, _allSubjects, 'id', s => `${s.subject_name} (${s.subject_code})`, 'Select Subject…');
            selSubject.disabled = false;
        } catch (err) {
            console.error('onTermChanged error:', err);
            selSubject.innerHTML = '<option value="">Error loading subjects</option>';
        } finally {
            if (window.AALoader && window.AALoader.reqEnd) window.AALoader.reqEnd();
        }
    }

    /* ─── Step 4 -> Step 5: On Subject Selected ───────────────────────────── */
    function onSubjectChanged() {
        const subjectId = selSubject.value;
        resetRosterTable();
        loadBtn.disabled = !subjectId;
    }

    /* ─── Step 5: Load Entire Class Roster ────────────────────────────────── */
    async function loadClassRoster() {
        const classId = selClass.value;
        const yearId = selYear.value;
        const termId = selTerm.value;
        const subjectId = selSubject.value;

        if (!classId || !yearId || !termId || !subjectId) {
            alert('Please select Class, Academic Year, Term, and Subject first.');
            return;
        }

        try {
            if (window.AALoader) window.AALoader.showPageLoader('Loading class roster…');
            hideValidationError();

            const url = `/api/results/roster?class_id=${encodeURIComponent(classId)}&academic_year_id=${encodeURIComponent(yearId)}&term_id=${encodeURIComponent(termId)}&subject_id=${encodeURIComponent(subjectId)}`;
            const res = await apiFetch(url);

            if (!res || !res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Server returned HTTP ${res.status}`);
            }

            const data = await res.json();
            _currentRoster = data.roster || [];
            if (data.policy) {
                _policy = Object.assign(_policy, data.policy);
            }

            renderRoster(data);

        } catch (err) {
            console.error('loadClassRoster error:', err);
            alert('Failed to load class roster: ' + err.message);
            resetRosterTable();
        } finally {
            if (window.AALoader) window.AALoader.hidePageLoader();
        }
    }

    /* ─── Render Entire Class Roster Grid ─────────────────────────────────── */
    function renderRoster(data) {
        const roster = data.roster || [];
        const classInfo = data.class || {};
        const subjectName = selSubject.options[selSubject.selectedIndex]?.text || 'Subject';
        const termName = selTerm.options[selTerm.selectedIndex]?.text || 'Term';
        const yearName = selYear.options[selYear.selectedIndex]?.text || 'Year';

        rosterHeading.textContent = `${classInfo.class_name || 'Class'} — ${subjectName}`;
        rosterSubheading.textContent = `${termName} • Academic Year ${yearName} • ${roster.length} students enrolled`;
        rosterBadge.textContent = `${roster.length} student${roster.length === 1 ? '' : 's'}`;

        const caEnabled = !!_policy.continuous_assessment_enabled;
        if (thCA) thCA.style.display = caEnabled ? 'table-cell' : 'none';

        if (policyInfoLabel) {
            policyInfoLabel.innerHTML = `<strong>Weighting:</strong> Mid-Term ${_policy.mid_term_weight}% + Final/End-Term ${_policy.final_term_weight}%${caEnabled ? ' + CA ' + _policy.continuous_assessment_weight + '%' : ''} &bull; ECZ Secondary Grading Scale`;
        }

        if (!roster.length) {
            rosterTbody.innerHTML = `
                <tr>
                    <td colspan="${caEnabled ? 10 : 9}" style="text-align:center; padding:36px; color:var(--aa-text-muted);">
                        No active students found enrolled in this class.
                    </td>
                </tr>
            `;
            saveBtn.disabled = true;
            if (saveBtnBottom) saveBtnBottom.disabled = true;
            if (rosterFooter) rosterFooter.style.display = 'none';
            return;
        }

        rosterTbody.innerHTML = roster.map((item, idx) => {
            const midVal = item.mid_term_score != null ? item.mid_term_score : '';
            const finVal = item.final_term_score != null ? item.final_term_score : '';
            const caVal = item.continuous_assessment_score != null ? item.continuous_assessment_score : '';
            const comment = _esc(item.teacher_comment || '');

            const calc = calculateMarkLocally(midVal, finVal, caVal);

            return `
                <tr data-student-id="${item.student_id}">
                    <td style="text-align:center; font-size:12.5px; color:var(--aa-text-muted);">${idx + 1}</td>
                    <td>
                        <strong style="color:var(--aa-text, #111827);">${_esc(item.last_name)}, ${_esc(item.first_name)}</strong>
                    </td>
                    <td style="font-family:monospace; font-size:12.5px; color:var(--aa-text-muted);">
                        ${_esc(item.admission_number)}
                    </td>
                    <td style="text-align:right;">
                        <input type="number" class="roster-input roster-mid"
                               min="0" max="100" step="0.5"
                               data-student-id="${item.student_id}"
                               value="${midVal !== '' ? midVal : ''}"
                               placeholder="—" />
                    </td>
                    <td style="text-align:right;">
                        <input type="number" class="roster-input roster-final"
                               min="0" max="100" step="0.5"
                               data-student-id="${item.student_id}"
                               value="${finVal !== '' ? finVal : ''}"
                               placeholder="—" />
                    </td>
                    ${caEnabled ? `
                    <td style="text-align:right;">
                        <input type="number" class="roster-input roster-ca"
                               min="0" max="100" step="0.5"
                               data-student-id="${item.student_id}"
                               value="${caVal !== '' ? caVal : ''}"
                               placeholder="—" />
                    </td>` : ''}
                    <td style="text-align:right;">
                        <span class="roster-mark-preview" id="finalMark_${item.student_id}">
                            ${calc.markText}
                        </span>
                    </td>
                    <td>
                        <span class="roster-grade-badge ${calc.badgeClass}" id="gradeBadge_${item.student_id}">
                            ${calc.gradeText}
                        </span>
                    </td>
                    <td>
                        <input type="text" class="roster-comment-input"
                               data-student-id="${item.student_id}"
                               value="${comment}"
                               placeholder="Remarks…" />
                    </td>
                </tr>
            `;
        }).join('');

        // Wire live calculation and bounds validation on inputs
        rosterTbody.querySelectorAll('.roster-input').forEach(input => {
            input.addEventListener('input', onScoreInput);
        });

        saveBtn.disabled = false;
        if (saveBtnBottom) saveBtnBottom.disabled = false;
        if (rosterFooter) rosterFooter.style.display = 'flex';
        if (saveStatusText) saveStatusText.textContent = '';
    }

    /* ─── Live Score Validation & Calculation Handler ─────────────────────── */
    function onScoreInput(e) {
        const input = e.target;
        const val = input.value.trim();
        const studentId = input.getAttribute('data-student-id');
        const row = input.closest('tr');

        // Validation bounds 0 - 100
        let isInvalid = false;
        if (val !== '') {
            const num = Number(val);
            if (isNaN(num) || num < 0 || num > 100) {
                isInvalid = true;
            }
        }

        if (isInvalid) {
            input.classList.add('is-invalid');
            showValidationError(`Score "${val}" is invalid. Marks must be between 0 and 100.`);
            saveBtn.disabled = true;
            if (saveBtnBottom) saveBtnBottom.disabled = true;
        } else {
            input.classList.remove('is-invalid');

            // Check if any other input in the table is invalid
            const allInvalid = rosterTbody.querySelectorAll('.roster-input.is-invalid');
            if (allInvalid.length === 0) {
                hideValidationError();
                saveBtn.disabled = false;
                if (saveBtnBottom) saveBtnBottom.disabled = false;
            }
        }

        // Live calculation of final mark & grade
        if (row && studentId) {
            const midIn = row.querySelector('.roster-mid');
            const finIn = row.querySelector('.roster-final');
            const caIn = row.querySelector('.roster-ca');

            const midV = midIn ? midIn.value.trim() : '';
            const finV = finIn ? finIn.value.trim() : '';
            const caV = caIn ? caIn.value.trim() : '';

            const calc = calculateMarkLocally(midV, finV, caV);

            const markEl = document.getElementById(`finalMark_${studentId}`);
            if (markEl) markEl.textContent = calc.markText;

            const badgeEl = document.getElementById(`gradeBadge_${studentId}`);
            if (badgeEl) {
                badgeEl.textContent = calc.gradeText;
                badgeEl.className = `roster-grade-badge ${calc.badgeClass}`;
            }
        }
    }

    /* ─── Local Assessment Calculation (Mirrors Backend Authoritative Service) */
    function calculateMarkLocally(midStr, finStr, caStr) {
        const hasMid = midStr !== '' && !isNaN(Number(midStr));
        const hasFin = finStr !== '' && !isNaN(Number(finStr));
        const caEnabled = !!_policy.continuous_assessment_enabled;
        const hasCa = caEnabled && caStr !== '' && !isNaN(Number(caStr));

        if (!hasMid && !hasFin && !hasCa) {
            return { markText: '—', gradeText: 'Pending Assessment', badgeClass: 'grade-pending' };
        }

        const mid = hasMid ? Number(midStr) : null;
        const fin = hasFin ? Number(finStr) : null;
        const ca = hasCa ? Number(caStr) : 0;

        if (mid !== null && (mid < 0 || mid > 100)) return { markText: 'Invalid', gradeText: 'Out of bounds', badgeClass: 'grade-fail' };
        if (fin !== null && (fin < 0 || fin > 100)) return { markText: 'Invalid', gradeText: 'Out of bounds', badgeClass: 'grade-fail' };
        if (caEnabled && hasCa && (ca < 0 || ca > 100)) return { markText: 'Invalid', gradeText: 'Out of bounds', badgeClass: 'grade-fail' };

        // If final/end-term has not been entered yet
        if (fin === null) {
            return { markText: 'Pending Final', gradeText: 'Pending Final', badgeClass: 'grade-pending' };
        }

        const midW = Number(_policy.mid_term_weight || 20) / 100;
        const finW = Number(_policy.final_term_weight || 80) / 100;
        const caW = caEnabled ? (Number(_policy.continuous_assessment_weight || 0) / 100) : 0;

        const effectiveMid = mid !== null ? mid : 0;
        const finalScore = Math.round(((effectiveMid * midW) + (fin * finW) + (ca * caW)) * 10) / 10;

        const gradeInfo = eczGrade(finalScore);
        const badgeClass = gradeInfo.code && gradeInfo.code <= 6 ? 'grade-pass' : 'grade-fail';

        return {
            markText: `${finalScore}%`,
            gradeText: gradeInfo.classification,
            badgeClass,
        };
    }

    /* ─── ECZ Grading Scale Helper ────────────────────────────────────────── */
    function eczGrade(pct) {
        if (pct >= 75) return { code: 1, classification: 'Distinction 1' };
        if (pct >= 70) return { code: 2, classification: 'Distinction 2' };
        if (pct >= 64) return { code: 3, classification: 'Merit 3' };
        if (pct >= 60) return { code: 4, classification: 'B Merit 4' };
        if (pct >= 54) return { code: 5, classification: 'Credit 5' };
        if (pct >= 50) return { code: 6, classification: 'Credit 6' };
        if (pct >= 40) return { code: 7, classification: 'Satisfactory 7' };
        if (pct >= 30) return { code: 8, classification: 'Satisfactory 8' };
        return { code: 9, classification: 'Fail 9' };
    }

    /* ─── Step 6: Save All Results ────────────────────────────────────────── */
    async function saveAllResults() {
        // 1. Check for any validation errors in the DOM
        const invalidInputs = rosterTbody.querySelectorAll('.roster-input.is-invalid');
        if (invalidInputs.length > 0) {
            showValidationError('Please fix all invalid scores before saving. All marks must be between 0 and 100.');
            invalidInputs[0].focus();
            return;
        }

        const classId = selClass.value;
        const yearId = selYear.value;
        const termId = selTerm.value;
        const subjectId = selSubject.value;

        if (!classId || !yearId || !termId || !subjectId) {
            alert('Please select Class, Academic Year, Term, and Subject.');
            return;
        }

        // 2. Gather row data and validate bounds strictly
        const resultsPayload = [];
        const rows = rosterTbody.querySelectorAll('tr[data-student-id]');

        for (const row of rows) {
            const studentId = row.getAttribute('data-student-id');
            const midInput = row.querySelector('.roster-mid');
            const finInput = row.querySelector('.roster-final');
            const caInput = row.querySelector('.roster-ca');
            const commentInput = row.querySelector('.roster-comment-input');

            const midVal = midInput && midInput.value.trim() !== '' ? Number(midInput.value.trim()) : null;
            const finVal = finInput && finInput.value.trim() !== '' ? Number(finInput.value.trim()) : null;
            const caVal = caInput && caInput.value.trim() !== '' ? Number(caInput.value.trim()) : null;
            const commentVal = commentInput ? commentInput.value.trim() : null;

            // Bounds check
            if (midVal !== null && (isNaN(midVal) || midVal < 0 || midVal > 100)) {
                showValidationError(`Student #${studentId}: Mid-term score (${midVal}) must be between 0 and 100.`);
                if (midInput) midInput.focus();
                return;
            }
            if (finVal !== null && (isNaN(finVal) || finVal < 0 || finVal > 100)) {
                showValidationError(`Student #${studentId}: Final score (${finVal}) must be between 0 and 100.`);
                if (finInput) finInput.focus();
                return;
            }
            if (caVal !== null && (isNaN(caVal) || caVal < 0 || caVal > 100)) {
                showValidationError(`Student #${studentId}: CA score (${caVal}) must be between 0 and 100.`);
                if (caInput) caInput.focus();
                return;
            }

            resultsPayload.push({
                student_id: Number(studentId),
                mid_term_score: midVal,
                final_term_score: finVal,
                continuous_assessment_score: caVal,
                teacher_comment: commentVal,
            });
        }

        if (!resultsPayload.length) {
            alert('No student records found to save.');
            return;
        }

        try {
            saveBtn.disabled = true;
            if (saveBtnBottom) saveBtnBottom.disabled = true;
            if (saveStatusText) saveStatusText.textContent = 'Saving results…';
            if (window.AALoader) window.AALoader.showPageLoader('Submitting class results…');

            const res = await apiFetch('/api/results/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    class_id: Number(classId),
                    academic_year_id: Number(yearId),
                    term_id: Number(termId),
                    subject_id: Number(subjectId),
                    results: resultsPayload,
                }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.error || `Server error: HTTP ${res.status}`);
            }

            // Success feedback
            if (saveStatusText) {
                saveStatusText.textContent = `✓ Saved ${data.count || resultsPayload.length} results successfully!`;
                saveStatusText.style.color = '#15803d';
            }
            alert(`Class results saved successfully! (${data.count || resultsPayload.length} records processed)`);

            // Reload roster to reflect updated calculated values from backend
            await loadClassRoster();

        } catch (err) {
            console.error('saveAllResults error:', err);
            showValidationError('Failed to save results: ' + err.message);
            alert('Error saving results: ' + err.message);
        } finally {
            saveBtn.disabled = false;
            if (saveBtnBottom) saveBtnBottom.disabled = false;
            if (window.AALoader) window.AALoader.hidePageLoader();
        }
    }

    /* ─── Validation Banner Helpers ───────────────────────────────────────── */
    function showValidationError(msg) {
        if (validationBanner && validationBannerMsg) {
            validationBannerMsg.textContent = msg;
            validationBanner.classList.add('is-visible');
        }
    }

    function hideValidationError() {
        if (validationBanner) {
            validationBanner.classList.remove('is-visible');
        }
    }

    function resetRosterTable() {
        hideValidationError();
        if (rosterHeading) rosterHeading.textContent = 'Class Results Roster';
        if (rosterSubheading) rosterSubheading.textContent = 'No class loaded yet.';
        if (rosterBadge) rosterBadge.textContent = '0 students';
        if (rosterFooter) rosterFooter.style.display = 'none';
        if (saveBtn) saveBtn.disabled = true;
        if (saveBtnBottom) saveBtnBottom.disabled = true;
        if (rosterTbody) {
            rosterTbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align:center; padding:40px 16px; color:var(--aa-text-muted);">
                        Please select your <strong>Class</strong>, <strong>Academic Year</strong>, <strong>Term</strong>, and <strong>Subject</strong> above, then click <strong>Load Results</strong>.
                    </td>
                </tr>
            `;
        }
    }

    function _populateDropdown(selectEl, items, valueKey, labelFn, defaultText) {
        if (!selectEl) return;
        selectEl.innerHTML = `<option value="">${_esc(defaultText)}</option>` +
            (items || []).map(item => {
                const val = item[valueKey];
                const lbl = labelFn(item);
                return `<option value="${_esc(val)}">${_esc(lbl)}</option>`;
            }).join('');
    }

    function _esc(v) {
        return String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
})();