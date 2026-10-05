import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTIONS, cleanRecord } from "../src/schema.js";

test("all v1 sections exist", () => {
  for (const s of ["providers", "visits", "procedures", "conditions", "medications", "allergies", "immunizations", "insurance", "claims", "contacts"]) {
    assert.ok(SECTIONS[s], s);
  }
});

test("unknown section is rejected", () => {
  assert.equal(cleanRecord("pets", { name: "x" }).error, "Unknown section.");
});

test("required fields enforced", () => {
  assert.match(cleanRecord("providers", { specialty: "x" }).error, /Name is required/);
  assert.match(cleanRecord("insurance", { type: "medical" }).error, /Carrier is required/);
});

test("unknown and system fields are dropped, strings trimmed and capped", () => {
  const r = cleanRecord("allergies", { name: "  Penicillin ", id: "hack", createdBy: "x", evil: 1, reaction: "a".repeat(5000) });
  assert.equal(r.error, undefined);
  assert.equal(r.value.name, "Penicillin");
  assert.equal(r.value.id, undefined);
  assert.equal(r.value.createdBy, undefined);
  assert.equal(r.value.evil, undefined);
  assert.equal(r.value.reaction.length, 500);
});

test("enums validated; blank enum allowed unless required", () => {
  assert.match(cleanRecord("providers", { name: "Dr X", kind: "astral" }).error, /Kind/);
  assert.equal(cleanRecord("providers", { name: "Dr X", kind: "" }).error, undefined);
  assert.match(cleanRecord("insurance", { carrier: "Aetna", type: "" }).error, /Type is required/);
});

test("dates accept YYYY, YYYY-MM, YYYY-MM-DD only", () => {
  for (const d of ["2019", "2019-04", "2019-04-12", ""]) assert.equal(cleanRecord("immunizations", { name: "Flu", date: d }).error, undefined, d);
  for (const d of ["4/12/2019", "2019-13-01", "2019-4-1", "yesterday"]) assert.match(cleanRecord("immunizations", { name: "Flu", date: d }).error, /Date/, d);
});

test("reviewed is a boolean pass-through", () => {
  assert.equal(cleanRecord("allergies", { name: "Latex", reviewed: true }).value.reviewed, true);
  assert.equal(cleanRecord("allergies", { name: "Latex", reviewed: "yes" }).value.reviewed, undefined);
});

test("partial update mode skips required checks for absent fields", () => {
  const r = cleanRecord("providers", { phone: "212" }, { partial: true });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.value, { phone: "212" });
});
