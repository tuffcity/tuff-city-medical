import { test } from "node:test";
import assert from "node:assert/strict";
import { kvFake } from "./kv-fake.js";
import { createStore } from "../src/store.js";
import { applyImport, listImports, getImport, settleItem } from "../src/imports.js";

const BY = "nanci@tuffcity.com";

async function setup() {
  const kv = kvFake({ pageSize: 2 });
  const store = createStore(kv);
  const cond = await store.createRecord("conditions", { name: "Hypertension", status: "active" }, BY);
  return { kv, store, cond };
}

const baseOps = (cond) => [
  { op: "create", section: "visits", fields: { date: "2026-09-01", reason: "Checkup", source: "visit.pdf" }, group: "added", label: "Checkup visit" },
  { op: "update", section: "conditions", id: cond.id, fields: { status: "resolved" }, label: "Hypertension resolved" },
  { op: "conflict", label: "Medication dose differs", detail: "Chart says 10mg, PDF says 20mg", choices: [
    { id: "pdf", label: "Use PDF", patch: { section: "conditions", id: cond.id, fields: { notes: "20mg" } } },
    { id: "chart", label: "Keep chart" },
  ] },
  { op: "skip", label: "Lab panel", reason: "Already on file." },
];

test("create + update + conflict + skip produce 4 items with correct groups", async () => {
  const { kv, store, cond } = await setup();
  const r = await applyImport(store, kv, { title: "Visit PDF", source: { name: "visit.pdf" }, ops: baseOps(cond) }, BY);
  assert.deepEqual(r.items.map((i) => i.group), ["added", "updated", "conflict", "skipped"]);
  assert.deepEqual(r.items.map((i) => i.n), [1, 2, 3, 4]);
  const [c, u] = r.items;
  assert.equal(c.before, null);
  assert.equal(c.after.reviewed, false);
  assert.equal(c.after.source, "visit.pdf");
  assert.ok(c.logKey && c.recordId === c.after.id);
  assert.equal(u.before.status, "active");
  assert.equal(u.after.status, "resolved");
  assert.ok(u.logKey);
  assert.equal(r.items[3].reason, "Already on file.");
  assert.equal(r.items[3].decision, null);
  assert.equal(r.open, true);
  assert.deepEqual(await getImport(kv, r.id), r);
  const list = await listImports(kv);
  assert.equal(list.length, 1);
  assert.deepEqual({ open: list[0].open, settled: list[0].settled, total: list[0].total }, { open: true, settled: 1, total: 4 });
});

test("upcoming group is kept for upcoming creates", async () => {
  const { kv, store } = await setup();
  const r = await applyImport(store, kv, { title: "T", ops: [
    { op: "create", section: "upcoming", fields: { type: "appointment", title: "Cardiology", date: "2026-11-01" }, group: "upcoming", label: "Cardiology" },
  ] }, BY);
  assert.equal(r.items[0].group, "upcoming");
});

test("bad op skipped; other ops still apply", async () => {
  const { kv, store, cond } = await setup();
  const r = await applyImport(store, kv, { title: "Bad", ops: [
    { op: "create", section: "visits", fields: { date: "2026-09-01", notes: "SSN 123-45-6789" }, group: "added", label: "Has SSN" },
    { op: "create", section: "visits", fields: { reason: "no date" }, group: "added", label: "No date" },
    { op: "update", section: "conditions", id: cond.id, fields: { notes: "fine" }, label: "ok" },
  ] }, BY);
  assert.equal(r.items[0].group, "skipped");
  assert.equal(r.items[0].reason, "Contains a Social Security number; not imported.");
  assert.equal(r.items[1].group, "skipped");
  assert.match(r.items[1].reason, /Date is required/);
  assert.equal(r.items[2].group, "updated");
  assert.equal((await store.listRecords()).filter((x) => x.section === "visits").length, 0);
});

test("keep settles; settling is idempotent", async () => {
  const { kv, store, cond } = await setup();
  const r = await applyImport(store, kv, { title: "K", ops: baseOps(cond) }, BY);
  await assert.rejects(() => settleItem(store, kv, r.id, 3, { action: "keep" }, BY), /Choose an option/);
  const k = await settleItem(store, kv, r.id, 1, { action: "keep" }, BY);
  assert.equal(k.items[0].decision, "kept");
  assert.equal((await getImport(kv, r.id)).items[0].decision, "kept");
  const again = await settleItem(store, kv, r.id, 1, { action: "undo" }, BY);
  assert.equal(again.items[0].decision, "kept");
  const skipped = await settleItem(store, kv, r.id, 4, { action: "keep" }, BY);
  assert.equal(skipped.items[3].decision, null);
  await assert.rejects(() => settleItem(store, kv, r.id, 9, { action: "keep" }, BY), /Not found/);
  await assert.rejects(() => settleItem(store, kv, "nope", 1, { action: "keep" }, BY), /Not found/);
});

test("undo reverts the record and sets undone", async () => {
  const { kv, store, cond } = await setup();
  const r = await applyImport(store, kv, { title: "U", ops: baseOps(cond) }, BY);
  const out = await settleItem(store, kv, r.id, 1, { action: "undo" }, BY);
  assert.equal(out.items[0].decision, "undone");
  assert.equal((await store.listRecords()).some((x) => x.section === "visits"), false);
  const out2 = await settleItem(store, kv, r.id, 2, { action: "undo" }, BY);
  assert.equal(out2.items[1].decision, "undone");
  assert.equal((await store.listRecords()).find((x) => x.id === cond.id).status, "active");
});

test("failed undo throws and leaves the item open", async () => {
  const { kv, store, cond } = await setup();
  const r = await applyImport(store, kv, { title: "F", ops: baseOps(cond) }, BY);
  await store.updateRecord("conditions", cond.id, { notes: "later" }, BY);
  await assert.rejects(() => settleItem(store, kv, r.id, 2, { action: "undo" }, BY), /changed again/);
  assert.equal((await getImport(kv, r.id)).items[1].decision, null);
});

test("choose applies the patch", async () => {
  const { kv, store, cond } = await setup();
  const r = await applyImport(store, kv, { title: "C", ops: baseOps(cond) }, BY);
  const out = await settleItem(store, kv, r.id, 3, { action: "choose", choice: "pdf" }, BY);
  assert.equal(out.items[2].decision, "pdf");
  assert.equal((await store.listRecords()).find((x) => x.id === cond.id).notes, "20mg");
  const r2 = await applyImport(store, kv, { title: "C2", ops: baseOps(cond) }, BY);
  await assert.rejects(() => settleItem(store, kv, r2.id, 3, { action: "choose", choice: "zzz" }, BY), /Unknown choice/);
  const nop = await settleItem(store, kv, r2.id, 3, { action: "choose", choice: "chart" }, BY);
  assert.equal(nop.items[2].decision, "chart");
});

test("report closes when all are settled; list sorts open first", async () => {
  const { kv, store, cond } = await setup();
  const r = await applyImport(store, kv, { title: "Closing", ops: baseOps(cond) }, BY);
  await settleItem(store, kv, r.id, 1, { action: "keep" }, BY);
  await settleItem(store, kv, r.id, 2, { action: "keep" }, BY);
  const last = await settleItem(store, kv, r.id, 3, { action: "choose", choice: "chart" }, BY);
  assert.equal(last.open, false);
  const r2 = await applyImport(store, kv, { title: "Newer", ops: baseOps(cond).slice(3) }, BY);
  assert.equal(r2.open, false, "only skipped items -> not open");
  const r3 = await applyImport(store, kv, { title: "Open", ops: baseOps(cond).slice(0, 1) }, BY);
  const list = await listImports(kv);
  assert.equal(list[0].id, r3.id);
  assert.equal(list.length, 3);
  assert.equal(list.find((x) => x.id === r.id).settled, 4);
});

test("a throwing op becomes skipped; the rest apply and the report is saved", async () => {
  const { kv, store, cond } = await setup();
  const real = store.createRecord.bind(store);
  const flaky = Object.create(store);
  flaky.createRecord = async (section, fields, by) => {
    if (fields.reason === "boom") throw new Error("kv down");
    return real(section, fields, by);
  };
  Object.defineProperty(flaky, "lastLogKey", { get: () => store.lastLogKey });
  const r = await applyImport(flaky, kv, { title: "Flaky", ops: [
    { op: "create", section: "visits", fields: { date: "2026-09-01", reason: "ok" }, group: "added", label: "A" },
    { op: "create", section: "visits", fields: { date: "2026-09-02", reason: "boom" }, group: "added", label: "B" },
    null,
    { op: "conflict", label: "C", choices: [null, { id: "x", label: "X" }] },
    { op: "update", section: "conditions", id: cond.id, label: "no fields" },
  ] }, BY);
  assert.deepEqual(r.items.map((i) => i.group), ["added", "skipped", "skipped", "conflict", "updated"]);
  assert.match(r.items[1].reason, /Couldn't apply: kv down/);
  assert.equal(r.items[3].choices.length, 1);
  assert.deepEqual(await getImport(kv, r.id), r);
});

test("stale choose is refused and the item stays open", async () => {
  const { kv, store, cond } = await setup();
  const r = await applyImport(store, kv, { title: "S", ops: baseOps(cond) }, BY);
  assert.ok(r.items[2].choices[0].patch.baseUpdatedAt);
  await store.updateRecord("conditions", cond.id, { notes: "newer edit" }, BY);
  await assert.rejects(() => settleItem(store, kv, r.id, 3, { action: "choose", choice: "pdf" }, BY), /changed since the import/);
  assert.equal((await getImport(kv, r.id)).items[2].decision, null);
  assert.equal((await store.listRecords()).find((x) => x.id === cond.id).notes, "newer edit");
});

test("sensitive text in report-level strings is replaced", async () => {
  const { kv, store } = await setup();
  const r = await applyImport(store, kv, { title: "DOB: born on 01/02/1950", source: { name: "a.pdf", note: "SSN 123-45-6789" }, ops: [
    { op: "skip", label: "Patient born on 03/04/1960", reason: "dup" },
    { op: "conflict", label: "ok", detail: "SSN 123-45-6789", choices: [{ id: "a", label: "date of birth 1/1/1950" }] },
  ] }, BY);
  const json = JSON.stringify(r);
  assert.doesNotMatch(json, /123-45-6789|1950|1960/);
  assert.match(r.items[0].label, /^\[removed: contains a birth date\]$/);
});
