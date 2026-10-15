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

test("last seen keeps the LATEST date of a range (exception to earliest rule)", () => {
  const r = cleanRecord("providers", { name: "Dr X", lastSeen: "2016-02-11 to 2016-10-25" });
  assert.equal(r.value.lastSeen, "2016-10-25");
});

test("medications carry a Started / prescribed date used for sorting", () => {
  assert.equal(SECTIONS.medications.date, "since");
  assert.equal(cleanRecord("medications", { name: "Examplazole", since: "2024-12" }).value.since, "2024-12");
});

test("visits and procedures carry cost fields and an itemised breakdown", () => {
  const v = cleanRecord("visits", { date: "2022-06-27", kind: "dental", charged: "$1,200.00", insurancePaid: "$0.00", aaronPaid: "$600.00",
    balance: "$600.00", codes: "D2740, D2954", teeth: "#30", paymentMethod: "Visa", breakdown: "D2740 – crown – #30 – $1,000\nD2954 – post – #30 – $200", billingStatus: "disputed" });
  assert.equal(v.error, undefined);
  assert.equal(v.value.charged, "$1,200.00");
  assert.match(v.value.breakdown, /D2954/);
  const p = cleanRecord("procedures", { name: "Example procedure", charged: "$4,000", allowed: "$1,200", claimNumber: "12345" });
  assert.equal(p.value.allowed, "$1,200");
});

test("treatment plans & quotes section", () => {
  assert.equal(SECTIONS.plans.date, "date");
  const r = cleanRecord("plans", { date: "2022-02-04", provider: "Example Dental", kind: "dental", items: "Crown #30 – $1,500", total: "$1,500", status: "partly done" });
  assert.equal(r.error, undefined);
  assert.match(cleanRecord("plans", { date: "2022", provider: "X", status: "maybe" }).error, /Status/);
});

test("upcoming section", () => {
  assert.equal(cleanRecord("upcoming", { type: "deadline", title: "Medicare plan change", date: "2026-12-07" }).error, undefined);
  assert.match(cleanRecord("upcoming", { type: "deadline", date: "2026-12-07" }).error, /Title is required/);
  assert.match(cleanRecord("upcoming", { type: "meeting", title: "x" }).error, /Type/);
  assert.equal(SECTIONS.upcoming.date, "date");
});

test("upcoming type is required", () => {
  assert.match(cleanRecord("upcoming", { title: "x" }).error, /Type is required/);
});

test("upcoming date is required for appointments and deadlines only", () => {
  assert.equal(cleanRecord("upcoming", { type: "deadline", title: "x" }).error, "Date is required for appointments and deadlines.");
  assert.equal(cleanRecord("upcoming", { type: "appointment", title: "x" }).error, "Date is required for appointments and deadlines.");
  assert.equal(cleanRecord("upcoming", { type: "to-do", title: "x" }).error, undefined);
  assert.equal(cleanRecord("upcoming", { type: "appointment", title: "x", date: "2026-10-15" }).error, undefined);
  assert.equal(cleanRecord("upcoming", { type: "deadline", title: "x" }, { partial: true }).error, undefined);
});

test("visit vitals and clinical fields", () => {
  const input = { date: "2026-02-20", bp: "150/70", weight: "210", height: "5'10\"", bmi: "31.20", pulse: "72", temp: "98.6", spo2: "98%",
    procedures: "Labs", reason: "Checkup", issues: "Example condition A\nExample condition B", tests: "Test one, Test two", instructions: "Fast before draw", followUp: "2027-02-20" };
  const r = cleanRecord("visits", input);
  assert.equal(r.error, undefined);
  for (const k of Object.keys(input)) assert.equal(r.value[k], input[k], k);
});

test("upcoming.time needs AM/PM (or unambiguous 24-hour)", () => {
  const t = (time) => cleanRecord("upcoming", { type: "to-do", title: "x", time });
  for (const ok of ["", "3:15 PM", "3:15pm", "9 AM", "12 pm", "14:30", "00:15"]) assert.equal(t(ok).error, undefined, ok);
  for (const bad of ["3:15", "2:30", "3.15 pm", "25:00", "13:60", "0 AM", "13 PM"]) assert.equal(t(bad).error, 'Time must include AM or PM, e.g. "3:15 PM"', bad);
});

test("every accepted upcoming.time parses in the countdown", async () => {
  const { parseTime } = await import("../public/lib/countdown.mjs");
  const want = { "3:15 PM": [15, 15], "3:15pm": [15, 15], "9 AM": [9, 0], "12 pm": [12, 0], "12:05 AM": [0, 5], "14:30": [14, 30], "00:15": [0, 15] };
  for (const [s, [h, m]] of Object.entries(want)) {
    assert.equal(cleanRecord("upcoming", { type: "to-do", title: "x", time: s }).error, undefined, s);
    assert.deepEqual(parseTime(s), { h, m }, s);
  }
});
