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
  assert.equal(cleanRecord("immunizations", { name: "Flu", date: "4/12/2019" }).value.date, "2019-04-12", "US date converted");
  for (const d of ["2019-13-01", "2019-4-1", "yesterday", "13/45/2019"]) assert.match(cleanRecord("immunizations", { name: "Flu", date: d }).error, /Date/, d);
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

test("date ranges keep the earliest date", () => {
  const d = (v) => cleanRecord("immunizations", { name: "Flu", date: v }).value?.date;
  assert.equal(d("2019-2021"), "2019");
  assert.equal(d("2021-12-31 to 2019-01-01"), "2019-01-01");
  assert.equal(d("2022-03 – 2024-11"), "2022-03");
  assert.equal(d("3/14/2024 - 5/1/2024"), "2024-03-14");
  assert.equal(d("2018, 2020 and 2016-07"), "2016-07");
  assert.equal(d("2024-04-11"), "2024-04-11", "single dates untouched");
});

test("text with no usable date is still rejected", () => {
  assert.match(cleanRecord("immunizations", { name: "Flu", date: "sometime" }).error, /Date/);
});
