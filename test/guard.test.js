import { test } from "node:test";
import assert from "node:assert/strict";
import { sensitiveReason, findSensitive } from "../src/guard.js";

test("dashed SSN is refused", () => {
  assert.equal(sensitiveReason("ss 123-45-6789"), "a Social Security number");
});

test("bare 9 digits refused only near SSN wording", () => {
  assert.equal(sensitiveReason("SSN 123456789"), "a Social Security number");
  assert.equal(sensitiveReason("claim 123456789"), null);
});

test("phones, member IDs, Medicare MBI and visit dates are allowed", () => {
  for (const s of ["(212) 555-0199", "212-555-0199", "XGH123456789", "1EG4-TE5-MK73", "2026-03-14", "Visit 3/14/2026 cleaning"]) {
    assert.equal(sensitiveReason(s), null, s);
  }
});

test("birth date with keyword is refused", () => {
  assert.equal(sensitiveReason("DOB 04/12/1950"), "a birth date");
  assert.equal(sensitiveReason("date of birth: 1950-04-12"), "a birth date");
  assert.equal(sensitiveReason("born on March 3"), "a birth date");
});

test("findSensitive walks nested objects and arrays", () => {
  assert.equal(findSensitive({ a: "ok", b: [{ c: "SSN 123-45-6789" }] }), "a Social Security number");
  assert.equal(findSensitive({ a: "ok", n: 5, z: null }), null);
});
