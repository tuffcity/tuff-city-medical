import test from "node:test";
import assert from "node:assert/strict";
import { parseTime, targetMs, parts, tier, comingUp } from "../public/lib/countdown.mjs";

const H = 3600000, D = 24 * H, MIN = 60000;

test("tier boundaries", () => {
  const now = Date.UTC(2026, 9, 1);
  assert.equal(tier(now + 7 * D, now), "near");
  assert.equal(tier(now + 7 * D + MIN, now), "far");
  assert.equal(tier(now + D, now), "imminent");
  assert.equal(tier(now + D + MIN, now), "near");
  assert.equal(tier(now - 1, now), "past");
});

test("targetMs New York wall clock", () => {
  assert.equal(targetMs("2026-10-15", "3:15 PM"), Date.UTC(2026, 9, 15, 19, 15));
  assert.equal(targetMs("2026-12-07", ""), Date.UTC(2026, 11, 8, 4, 59));
  assert.equal(targetMs("2027-02", "3pm"), null);
  assert.equal(targetMs("2027", ""), null);
  assert.equal(targetMs("", "3pm"), null);
});

test("parts across DST", () => {
  const p = parts(targetMs("2026-11-02", "9:00 AM"), Date.UTC(2026, 10, 1, 13, 0));
  assert.deepEqual({ d: p.d, h: p.h, m: p.m }, { d: 1, h: 1, m: 0 });
  assert.deepEqual(parts(0, 5), { d: 0, h: 0, m: 0, past: true });
});

test("time parsing", () => {
  assert.deepEqual(parseTime("noon"), { h: 12, m: 0 });
  assert.deepEqual(parseTime("3pm"), { h: 15, m: 0 });
  assert.deepEqual(parseTime("3:15pm"), { h: 15, m: 15 });
  assert.deepEqual(parseTime("15:15"), { h: 15, m: 15 });
  assert.deepEqual(parseTime("3 PM"), { h: 15, m: 0 });
  assert.equal(parseTime(""), null);
  assert.equal(parseTime("soon"), null);
});

test("comingUp", () => {
  const now = Date.UTC(2026, 9, 15, 16, 0);
  const up = (o) => ({ section: "upcoming", type: "appointment", status: "confirmed", ...o });
  const records = [
    up({ id: "a", title: "later", date: "2026-11-01", time: "9am" }),
    up({ id: "b", title: "soon", date: "2026-10-16", time: "9am" }),
    up({ id: "c", title: "done", date: "2026-10-20", status: "done" }),
    up({ id: "d", title: "cancelled", date: "2026-10-20", status: "cancelled" }),
    up({ id: "e", title: "past", date: "2026-10-01" }),
    up({ id: "f", type: "to-do", title: "undated", date: "" }),
    up({ id: "g", type: "to-do", title: "partial", date: "2027-02" }),
    up({ id: "h", title: "matched", date: "2026-12-01", provider: "Dr. Who", visitId: "v1" }),
    { section: "visits", id: "v1", date: "2026-12-01", provider: "Other" },
    { section: "visits", id: "v2", date: "2026-11-01", provider: " dr. smith " },
    { section: "visits", id: "v3", date: "2026-11-01", provider: "DR. SMITH" },
    up({ id: "i", title: "by provider", date: "2026-11-05", provider: "Dr. Jones" }),
    { section: "visits", id: "v4", date: "2026-11-05", provider: "dr. jones" },
    { section: "visits", id: "v5", date: "2026-10-30", provider: "Dr. New" },
    { section: "visits", id: "v6", date: "2026-09-01", provider: "Dr. Old" },
  ];
  const r = comingUp(records, now);
  const ids = r.dated.map((x) => x.id);
  assert.ok(!ids.includes("c") && !ids.includes("d") && !ids.includes("e") && !ids.includes("v6"));
  assert.ok(!ids.includes("v1") && !ids.includes("v4"));
  assert.deepEqual(r.todos.map((x) => x.id).sort(), ["f", "g"]);
  const v5 = r.dated.find((x) => x.id === "v5");
  assert.equal(v5.fromVisit, true);
  assert.equal(v5.type, "appointment");
  assert.equal(r.dated[0].id, "b");
  assert.equal(ids.indexOf("b"), 0);
  assert.ok(ids.indexOf("v5") < ids.indexOf("a"));
});
