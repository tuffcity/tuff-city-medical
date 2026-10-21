import test from "node:test";
import assert from "node:assert/strict";
import { num, bpParts, delta, flags, trend } from "../public/lib/vitals.mjs";

test("num and bpParts", () => {
  assert.equal(num("200 lb"), 200);
  assert.equal(num("150/70"), 150);
  assert.equal(num("31.20"), 31.20);
  assert.equal(num(""), null);
  assert.equal(num("n/a"), null);
  assert.deepEqual(bpParts("150/70"), { sys: 150, dia: 70 });
  assert.equal(bpParts("152"), null);
});

test("flags", () => {
  assert.ok(flags({ bp: "140/72" }).has("bp"));
  assert.equal(flags({ bp: "139/89" }).size, 0);
  assert.ok(flags({ bp: "120/90" }).has("bp"));
  assert.ok(flags({ bmi: "30" }).has("bmi"));
  assert.ok(!flags({ bmi: "29.99" }).has("bmi"));
  assert.equal(flags({ spo2: "95%" }).size, 0);
  assert.ok(flags({ spo2: "94%" }).has("spo2"));
  assert.equal(flags({ pulse: "100" }).size, 0);
  assert.ok(flags({ pulse: "101" }).has("pulse"));
});

test("delta", () => {
  const a = { id: "a", date: "2026-01-01", weight: "194 lb", bmi: "30.55" };
  const b = { id: "b", date: "2025-01-01", weight: "200 lb" };
  const c = { id: "c", date: "2026-06-01", weight: "200 lb", bmi: "31.20" };
  assert.equal(delta([a, b, c], c, "weight"), 6);
  assert.equal(delta([a, b, c], c, "bmi"), 0.65);
  assert.equal(delta([a, b, c], b, "weight"), null);
  assert.equal(delta([a, b, c], c, "pulse"), null);
});

test("trend", () => {
  const vs = [
    { date: "2025-01-01", bp: "130/80" },
    { date: "2026-01-01", pulse: "70" },
    { date: "2026-06-01", weight: "200 lb", bmi: "30" },
  ];
  assert.deepEqual(trend(vs).map((t) => t.date), ["2026-06-01", "2025-01-01"]);
});
