/**
 * assessmentCalculationService.js
 * 
 * Authoritative Centralized Calculation Service for Admin Assist SIS.
 * Reflects Zambian Secondary School Assessment Model:
 *  - Primary internal components: Mid-Term Test + Final / End-of-Term Test
 *  - Configurable school policy weightings (default: 20% Mid-Term + 80% Final)
 *  - Separate Continuous Assessment / School-Based Assessment (SBA) support
 *  - Explicit distinction between 0 (scored zero) and null/undefined (missing)
 *  - Incomplete status handling: "Pending Final Assessment"
 *  - Admin Assist ECZ Secondary Grading Scale
 */
"use strict";

const DEFAULT_POLICY = {
    assessment_model: "MID_TERM_FINAL",
    mid_term_weight: 20.0,
    final_term_weight: 80.0,
    continuous_assessment_enabled: 0,
    continuous_assessment_weight: 0.0,
    grading_scheme: "ADMIN_ASSIST_ECZ",
};

/**
 * Admin Assist Secondary School ECZ Grading Scale
 */
const getECZGrade = (percentage) => {
    if (percentage === null || percentage === undefined || isNaN(percentage)) {
        return { code: null, classification: "Pending Final Assessment", remarks: "Pending Final Assessment" };
    }
    const val = Number(percentage);
    if (val >= 75) return { code: 1, classification: "Distinction 1", remarks: "Outstanding" };
    if (val >= 70) return { code: 2, classification: "Distinction 2", remarks: "Excellent" };
    if (val >= 64) return { code: 3, classification: "Merit 3",       remarks: "Very Good" };
    if (val >= 60) return { code: 4, classification: "B Merit 4",     remarks: "Good" };
    if (val >= 54) return { code: 5, classification: "Credit 5",      remarks: "Credit Pass" };
    if (val >= 50) return { code: 6, classification: "Credit 6",      remarks: "Credit Pass" };
    if (val >= 40) return { code: 7, classification: "Satisfactory 7",remarks: "Satisfactory" };
    if (val >= 30) return { code: 8, classification: "Satisfactory 8",remarks: "Satisfactory" };
    return { code: 9, classification: "Fail", remarks: "Fail" };
};

/**
 * Validate that weights configured in policy sum to 100.
 */
const validatePolicyWeights = (policy = {}) => {
    const midWeight = Number(policy.mid_term_weight !== undefined ? policy.mid_term_weight : DEFAULT_POLICY.mid_term_weight);
    const finalWeight = Number(policy.final_term_weight !== undefined ? policy.final_term_weight : DEFAULT_POLICY.final_term_weight);
    const caEnabled = Boolean(policy.continuous_assessment_enabled);
    const caWeight = caEnabled ? Number(policy.continuous_assessment_weight || 0) : 0;

    if (midWeight < 0 || finalWeight < 0 || caWeight < 0) {
        throw new Error("Assessment weights cannot be negative.");
    }

    const totalWeight = Math.round((midWeight + finalWeight + caWeight) * 100) / 100;
    if (Math.abs(totalWeight - 100) > 0.01) {
        throw new Error(`Configured assessment weights must sum to 100%. Current sum: ${totalWeight}% (Mid-Term: ${midWeight}%, Final: ${finalWeight}%${caEnabled ? `, CA: ${caWeight}%` : ""})`);
    }

    return { midWeight, finalWeight, caWeight, caEnabled };
};

/**
 * Check if a raw score is provided (distinguishes 0 from null/undefined/"")
 */
const isScoreProvided = (val) => {
    if (val === null || val === undefined) return false;
    if (typeof val === "string" && val.trim() === "") return false;
    const num = Number(val);
    return !isNaN(num);
};

/**
 * Parse and validate a score if provided
 */
const parseScore = (val, fieldName = "Score") => {
    if (!isScoreProvided(val)) return null;
    const num = Number(val);
    if (num < 0 || num > 100) {
        throw new Error(`${fieldName} must be between 0 and 100. Provided: ${val}`);
    }
    return Math.round(num * 100) / 100;
};

/**
 * Authoritative Final Mark & Grade Calculation
 * 
 * @param {Object} params
 * @param {number|null} params.midTermScore
 * @param {number|null} params.finalTermScore
 * @param {number|null} [params.continuousAssessmentScore]
 * @param {Object} [params.policy]
 * @returns {Object} { finalMark, percentage, gradeCode, gradeClassification, remarks, status, isComplete, policySnapshot }
 */
const calculateFinalMark = ({
    midTermScore,
    finalTermScore,
    continuousAssessmentScore = null,
    policy = DEFAULT_POLICY,
}) => {
    // 1. Validate weights
    const { midWeight, finalWeight, caWeight, caEnabled } = validatePolicyWeights(policy);

    // 2. Parse scores (preserving 0 vs null)
    const mid = parseScore(midTermScore, "Mid-Term score");
    const fin = parseScore(finalTermScore, "Final Term score");
    const ca = caEnabled ? parseScore(continuousAssessmentScore, "Continuous Assessment score") : null;

    const policySnapshot = {
        model: policy.assessment_model || DEFAULT_POLICY.assessment_model,
        mid_term_weight: midWeight,
        final_term_weight: finalWeight,
        continuous_assessment_enabled: caEnabled ? 1 : 0,
        continuous_assessment_weight: caWeight,
        calculated_at: new Date().toISOString(),
    };

    // 3. Check for incomplete assessments
    const isMidMissing = (mid === null);
    const isFinMissing = (fin === null);
    const isCaMissing = (caEnabled && ca === null);

    if (isMidMissing || isFinMissing || isCaMissing) {
        return {
            midTermScore: mid,
            finalTermScore: fin,
            continuousAssessmentScore: ca,
            finalMark: null,
            percentage: null,
            gradeCode: null,
            gradeClassification: "Pending Final Assessment",
            remarks: isMidMissing && isFinMissing 
                ? "No Assessment Entered" 
                : (isFinMissing ? "Pending Final Assessment" : "Pending Mid-Term Assessment"),
            status: "INCOMPLETE",
            isComplete: false,
            policySnapshot,
        };
    }

    // 4. Calculate weighted components
    const midContribution = mid * (midWeight / 100);
    const finalContribution = fin * (finalWeight / 100);
    const caContribution = caEnabled ? (ca * (caWeight / 100)) : 0;

    const totalWeighted = midContribution + finalContribution + caContribution;
    const finalMark = Math.min(100, Math.max(0, Math.round(totalWeighted * 10) / 10));

    // 5. Apply grading scheme
    const grade = getECZGrade(finalMark);

    return {
        midTermScore: mid,
        finalTermScore: fin,
        continuousAssessmentScore: ca,
        finalMark,
        percentage: finalMark,
        gradeCode: grade.code,
        gradeClassification: grade.classification,
        remarks: grade.remarks,
        status: "COMPLETE",
        isComplete: true,
        policySnapshot,
    };
};

module.exports = {
    DEFAULT_POLICY,
    getECZGrade,
    validatePolicyWeights,
    isScoreProvided,
    parseScore,
    calculateFinalMark,
};
