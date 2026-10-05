import { test } from "node:test";
import assert from "node:assert/strict";
import { planImport } from "../src/importer.js";

const findings = {
  providers: [
    { name: "Dr. Jane Smith", specialty: "Cardiology", kind: "medical", phone: "212-555-0101", source: "Gmail 2025-03-01 'Appt'" },
    { name: "Dr. Jane Smith", specialty: "Cardiology", kind: "medical", source: "dup within batch" },
    { name: "Bright Smiles Dental", kind: "dental", source: "Drive: card.pdf" },
  ],
  visits: [{ date: "2025-03-14", provider: "Dr. Jane Smith", kind: "medical", reason: "Checkup", source: "s" }],
  allergies: [{ name: "Penicillin", reaction: "hives", source: "s" }, { name: "", source: "blank name skipped" }],
  insurance: [{ type: "medicare", carrier: "Medicare", memberId: "1EG4-TE5-MK73", source: "s" }, { type: "dental", carrier: "Delta", notes: "SSN 123-45-6789", source: "bad" }],
  medications: [{ name: "Lisinopril", status: "unknown", source: "s" }],
  immunizations: [{ name: "Flu", date: "10/2/2024", source: "bad date → kept without date" }],
  gaps: ["no dental x-rays found"],
  junk: [{ x: 1 }],
};

test("maps findings to reviewed:false records with sources", () => {
  const plan = planImport(findings, []);
  const by = (s) => plan.records.filter((r) => r.section === s);
  assert.equal(by("providers").length, 2, "in-batch duplicate removed");
  assert.equal(by("visits").length, 1);
  assert.equal(by("allergies").length, 1);
  assert.equal(by("insurance").length, 1, "guard-failing item skipped");
  assert.ok(plan.records.every((r) => r.fields.reviewed === false && r.fields.source));
  assert.equal(by("medications")[0].fields.status, "", "unknown enum value blanked, not rejected");
  assert.equal(by("immunizations")[0].fields.date, "", "bad date blanked");
  assert.equal(plan.skipped.sensitive, 1);
  assert.equal(plan.skipped.invalid, 1);
  assert.equal(plan.skipped.duplicate, 1);
  assert.deepEqual(plan.gaps, ["no dental x-rays found"]);
});

test("skips records that already exist", () => {
  const existing = [{ section: "allergies", name: "penicillin " }, { section: "visits", date: "2025-03-14", provider: "Dr. Jane Smith", kind: "medical" }];
  const plan = planImport(findings, existing);
  assert.equal(plan.records.filter((r) => r.section === "allergies").length, 0);
  assert.equal(plan.records.filter((r) => r.section === "visits").length, 0);
  assert.equal(plan.skipped.duplicate, 3);
});

test("garbage input yields nothing and does not throw", () => {
  for (const bad of [null, 5, "x", [], { providers: "nope" }]) {
    const p = planImport(bad, []);
    assert.equal(p.records.length, 0);
  }
});
