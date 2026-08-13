/**
 * smoke.test.js — Admin Assist Integration & Smoke Tests
 * Uses Node.js native test runner (node --test). Zero external test dependencies required.
 *
 * Run with: npm test (or node --test Backend/tests/smoke.test.js)
 */
"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);

// Import app without starting HTTP server port
const app = require("../src/app");
const { getECZGrade } = require("../src/controllers/resultsController");

describe("Admin Assist — API & System Smoke Tests", () => {

    describe("Health Check Endpoint", () => {
        test("GET / returns HTTP 200 with API status ok", async () => {
            const http = require("http");
            const server = http.createServer(app);

            await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
            const port = server.address().port;

            try {
                const res = await fetch(`http://127.0.0.1:${port}/`);
                assert.equal(res.status, 200);
                const data = await res.json();
                assert.equal(data.status, "ok");
                assert.equal(data.message, "Admin Assist API");
            } finally {
                await new Promise(resolve => server.close(resolve));
            }
        });
    });

    describe("ECZ Grading Logic (resultsController)", () => {
        test("90% maps to Grade 1 (Distinction 1 - Outstanding)", () => {
            const g = getECZGrade(90);
            assert.equal(g.code, 1);
            assert.equal(g.classification, "Distinction 1");
            assert.equal(g.remarks, "Outstanding");
        });

        test("75% maps to Grade 1 (Distinction 1 - Outstanding)", () => {
            const g = getECZGrade(75);
            assert.equal(g.code, 1);
            assert.equal(g.classification, "Distinction 1");
        });

        test("65% maps to Grade 3 (Merit - Very Good)", () => {
            const g = getECZGrade(65);
            assert.equal(g.code, 3);
            assert.equal(g.classification, "Merit");
            assert.equal(g.remarks, "Very Good");
        });

        test("55% maps to Grade 5 (Credit - Credit Pass)", () => {
            const g = getECZGrade(55);
            assert.equal(g.code, 5);
            assert.equal(g.classification, "Credit");
            assert.equal(g.remarks, "Credit Pass");
        });

        test("45% maps to Grade 7 (Satisfactory - Satisfactory)", () => {
            const g = getECZGrade(45);
            assert.equal(g.code, 7);
            assert.equal(g.classification, "Satisfactory");
        });

        test("25% maps to Grade 9 (Fail - Fail)", () => {
            const g = getECZGrade(25);
            assert.equal(g.code, 9);
            assert.equal(g.classification, "Fail");
            assert.equal(g.remarks, "Fail");
        });
    });

    describe("Password Security (Scrypt algorithm)", () => {
        test("scrypt password hashing & verification contract", async () => {
            const rawPassword = "TestPassword123!";
            const salt = crypto.randomBytes(16).toString("hex");
            const hashBuf = await scrypt(rawPassword, salt, 64);
            const storedHash = `scrypt$${salt}$${hashBuf.toString("hex")}`;

            // Verify matching password
            const [, extractedSalt, originalHex] = storedHash.split("$");
            const originalBuf = Buffer.from(originalHex, "hex");
            const recomputedBuf = await scrypt(rawPassword, extractedSalt, originalBuf.length);
            const match = crypto.timingSafeEqual(originalBuf, recomputedBuf);

            assert.equal(match, true);

            // Verify wrong password fails
            const wrongBuf = await scrypt("WrongPassword!", extractedSalt, originalBuf.length);
            const wrongMatch = crypto.timingSafeEqual(originalBuf, wrongBuf);
            assert.equal(wrongMatch, false);
        });
    });

});
