/**
 * timetable.test.js — Tests for Timetable Controller & Scheduling Logic
 */
"use strict";

const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/db");

const {
    VALID_DAYS,
    normalizeTime,
    getZambianCurrentDayAndDate
} = require("../src/controllers/timetableController");

describe("Timetable Logic & Validation", () => {

    describe("Time normalization", () => {
        test("normalizes HH:MM to HH:MM:00", () => {
            assert.equal(normalizeTime("08:30"), "08:30:00");
            assert.equal(normalizeTime("9:05"), "09:05:00");
            assert.equal(normalizeTime("14:00"), "14:00:00");
        });

        test("handles HH:MM:SS format safely", () => {
            assert.equal(normalizeTime("10:15:30"), "10:15:30");
        });

        test("returns empty string for empty input", () => {
            assert.equal(normalizeTime(""), "");
            assert.equal(normalizeTime(null), "");
        });
    });

    describe("Days of week validation", () => {
        test("contains all 7 standard days in order", () => {
            assert.deepEqual(VALID_DAYS, [
                "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
            ]);
        });

        test("identifies invalid days", () => {
            assert.equal(VALID_DAYS.includes("Mon"), false);
            assert.equal(VALID_DAYS.includes("monday"), false);
            assert.equal(VALID_DAYS.includes("InvalidDay"), false);
        });
    });

    describe("Zambia Timezone (Africa/Lusaka) Resolution", () => {
        test("resolves day and date in Africa/Lusaka", () => {
            const res = getZambianCurrentDayAndDate();
            assert.ok(res.dayName);
            assert.ok(VALID_DAYS.includes(res.dayName));
            assert.ok(res.formattedDate);
            assert.ok(res.formattedDate.includes("202"));
        });
    });

    describe("Time overlap interval logic", () => {
        function intervalsOverlap(start1, end1, start2, end2) {
            return start1 < end2 && end1 > start2;
        }

        test("detects overlapping periods", () => {
            // Period 1: 08:00 - 09:00, Period 2: 08:30 - 09:30
            assert.equal(intervalsOverlap("08:00:00", "09:00:00", "08:30:00", "09:30:00"), true);

            // Period 1: 09:00 - 10:00, Period 2: 08:00 - 11:00 (enclosing)
            assert.equal(intervalsOverlap("09:00:00", "10:00:00", "08:00:00", "11:00:00"), true);

            // Period 1: 08:00 - 10:00, Period 2: 08:30 - 09:30 (enclosed)
            assert.equal(intervalsOverlap("08:00:00", "10:00:00", "08:30:00", "09:30:00"), true);
        });

        test("allows adjacent/back-to-back periods without conflict", () => {
            // Period 1 ends exactly when Period 2 starts (08:50 and 08:50)
            assert.equal(intervalsOverlap("08:00:00", "08:50:00", "08:50:00", "09:40:00"), false);
            assert.equal(intervalsOverlap("08:50:00", "09:40:00", "08:00:00", "08:50:00"), false);
        });

        test("allows completely disjoint periods", () => {
            assert.equal(intervalsOverlap("08:00:00", "08:50:00", "10:00:00", "10:50:00"), false);
        });
    });

    after(async () => {
        try {
            await pool.end();
        } catch (_) {}
    });
});
