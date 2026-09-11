/**
 * assessment.test.js — Tests for Centralized Zambian Assessment Calculation Service
 */
"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
    DEFAULT_POLICY,
    getECZGrade,
    validatePolicyWeights,
    isScoreProvided,
    parseScore,
    calculateFinalMark,
} = require("../src/services/assessmentCalculationService");

describe("Assessment Calculation Service — Zambian Secondary School Model", () => {

    describe("Policy Weight Validation", () => {
        test("accepts default weights summing to 100 (20% mid-term + 80% final)", () => {
            const res = validatePolicyWeights(DEFAULT_POLICY);
            assert.equal(res.midWeight, 20);
            assert.equal(res.finalWeight, 80);
            assert.equal(res.caWeight, 0);
            assert.equal(res.caEnabled, false);
        });

        test("accepts valid custom weights with Continuous Assessment enabled (20% mid + 60% final + 20% CA)", () => {
            const custom = {
                mid_term_weight: 20,
                final_term_weight: 60,
                continuous_assessment_enabled: 1,
                continuous_assessment_weight: 20,
            };
            const res = validatePolicyWeights(custom);
            assert.equal(res.midWeight, 20);
            assert.equal(res.finalWeight, 60);
            assert.equal(res.caWeight, 20);
            assert.equal(res.caEnabled, true);
        });

        test("rejects weights that do not sum to 100", () => {
            assert.throws(() => {
                validatePolicyWeights({ mid_term_weight: 30, final_term_weight: 80 });
            }, /Configured assessment weights must sum to 100%/);
        });

        test("rejects negative weights", () => {
            assert.throws(() => {
                validatePolicyWeights({ mid_term_weight: -10, final_term_weight: 110 });
            }, /Assessment weights cannot be negative/);
        });
    });

    describe("Score Parsing & Zero Handling", () => {
        test("distinguishes 0 from null/undefined/empty string", () => {
            assert.equal(isScoreProvided(0), true);
            assert.equal(isScoreProvided("0"), true);
            assert.equal(isScoreProvided(null), false);
            assert.equal(isScoreProvided(undefined), false);
            assert.equal(isScoreProvided(""), false);
            assert.equal(isScoreProvided("   "), false);
        });

        test("parseScore returns 0 for 0 and null for null", () => {
            assert.equal(parseScore(0), 0);
            assert.equal(parseScore("0"), 0);
            assert.equal(parseScore(null), null);
            assert.equal(parseScore(""), null);
        });

        test("parseScore rejects scores outside 0-100", () => {
            assert.throws(() => parseScore(-5), /must be between 0 and 100/);
            assert.throws(() => parseScore(105), /must be between 0 and 100/);
        });
    });

    describe("Calculation: 20% Mid-Term + 80% Final Term", () => {
        test("calculates weighted final mark accurately (Mid: 70, Final: 85 -> 14 + 68 = 82)", () => {
            const calc = calculateFinalMark({
                midTermScore: 70,
                finalTermScore: 85,
            });

            assert.equal(calc.status, "COMPLETE");
            assert.equal(calc.isComplete, true);
            assert.equal(calc.finalMark, 82);
            assert.equal(calc.gradeCode, 1);
            assert.equal(calc.gradeClassification, "Distinction 1");
        });

        test("handles score of 0 correctly without treating it as missing (Mid: 0, Final: 50 -> 0 + 40 = 40)", () => {
            const calc = calculateFinalMark({
                midTermScore: 0,
                finalTermScore: 50,
            });

            assert.equal(calc.status, "COMPLETE");
            assert.equal(calc.isComplete, true);
            assert.equal(calc.finalMark, 40);
            assert.equal(calc.gradeCode, 7);
            assert.equal(calc.gradeClassification, "Satisfactory 7");
        });

        test("returns INCOMPLETE and 'Pending Final Assessment' when final term score is missing", () => {
            const calc = calculateFinalMark({
                midTermScore: 75,
                finalTermScore: null,
            });

            assert.equal(calc.status, "INCOMPLETE");
            assert.equal(calc.isComplete, false);
            assert.equal(calc.finalMark, null);
            assert.equal(calc.gradeCode, null);
            assert.equal(calc.gradeClassification, "Pending Final Assessment");
            assert.equal(calc.remarks, "Pending Final Assessment");
        });

        test("returns INCOMPLETE when mid term score is missing", () => {
            const calc = calculateFinalMark({
                midTermScore: null,
                finalTermScore: 80,
            });

            assert.equal(calc.status, "INCOMPLETE");
            assert.equal(calc.isComplete, false);
            assert.equal(calc.finalMark, null);
            assert.equal(calc.gradeCode, null);
            assert.equal(calc.gradeClassification, "Pending Final Assessment");
        });
    });

    describe("Continuous Assessment / SBA Integration", () => {
        test("incorporates CA score when enabled in policy (Mid: 80 [20%], Final: 70 [60%], CA: 90 [20%] -> 16 + 42 + 18 = 76)", () => {
            const policy = {
                assessment_model: "MID_TERM_FINAL_SBA",
                mid_term_weight: 20,
                final_term_weight: 60,
                continuous_assessment_enabled: 1,
                continuous_assessment_weight: 20,
            };

            const calc = calculateFinalMark({
                midTermScore: 80,
                finalTermScore: 70,
                continuousAssessmentScore: 90,
                policy,
            });

            assert.equal(calc.status, "COMPLETE");
            assert.equal(calc.finalMark, 76);
            assert.equal(calc.gradeCode, 1);
            assert.equal(calc.gradeClassification, "Distinction 1");
        });

        test("ignores CA score when CA is disabled in policy", () => {
            const policy = {
                assessment_model: "MID_TERM_FINAL",
                mid_term_weight: 20,
                final_term_weight: 80,
                continuous_assessment_enabled: 0,
                continuous_assessment_weight: 0,
            };

            const calc = calculateFinalMark({
                midTermScore: 80,
                finalTermScore: 70,
                continuousAssessmentScore: 99, // Should be ignored because continuous_assessment_enabled = 0
                policy,
            });

            assert.equal(calc.status, "COMPLETE");
            assert.equal(calc.finalMark, 72); // 80*0.2 + 70*0.8 = 16 + 56 = 72
            assert.equal(calc.gradeCode, 2);
            assert.equal(calc.gradeClassification, "Distinction 2");
        });
    });

});
