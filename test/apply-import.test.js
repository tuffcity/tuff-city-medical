import { test } from "node:test";
import assert from "node:assert/strict";
import { kvFake } from "./kv-fake.js";
import { createStore } from "../src/store.js";
import { runImport, formatReport, main } from "../scripts/apply-import.mjs";

const BY = "import-script";

test("dry run applies ops to the fake, resolves appendNotes, and formats the report", async () => {
  const kv = kvFake();
  const store = createStore(kv);
  const cond = await store.createRecord("conditions", { name: "Example condition", status: "active", notes: "first line" }, BY);
  const payload = {
    title: "Fixture import",
    source: { name: "fixture.pdf", note: "made up" },
    ops: [
      { op: "update", section: "conditions", id: cond.id, appendNotes: "second line", label: "Add note" },
      { op: "create", section: "conditions", group: "added", fields: { name: "Made-up thing", status: "active" }, label: "New condition" },
      { op: "skip", label: "Page 2", reason: "Not in the scan" },
    ],
  };
  const report = await runImport({ kv, store, payload, by: BY });
  assert.deepEqual(report.items.map((i) => i.group), ["updated", "added", "skipped"]);
  const cur = await kv.get(`rec:conditions:${cond.id}`, "json");
  assert.equal(cur.notes, "first line\nsecond line");
  const text = formatReport(report);
  assert.match(text, /updated · Add note/);
  assert.match(text, /skipped · Page 2 · Not in the scan/);
});

test("attach uploads the file first and puts fileId into source", async () => {
  const kv = kvFake();
  const store = createStore(kv);
  const payload = {
    title: "With file", source: { name: "x.pdf" },
    attach: { path: "/fixture", name: "x.pdf", type: "application/pdf", section: "visits", recordId: "abc" },
    ops: [],
  };
  const report = await runImport({ kv, store, payload, by: BY, readFile: async () => new Uint8Array([1, 2, 3]) });
  assert.ok(report.source.fileId);
  const f = await store.getFile(report.source.fileId);
  assert.equal(f.meta.name, "x.pdf");
  assert.equal(f.bytes.byteLength, 3);
});

function spyRest(seed) {
  const inner = kvFake();
  const writes = [];
  const rest = {
    get: (k, t) => inner.get(k, t),
    list: (o) => inner.list(o),
    put: async (k, v, o) => { writes.push(["put", k]); return inner.put(k, v, o); },
    delete: async (k) => { writes.push(["delete", k]); return inner.delete(k); },
  };
  return { rest, writes, inner, seed: (k, v) => inner.put(k, JSON.stringify(v)) };
}

const PAYLOAD = JSON.stringify({
  title: "Spy import", source: { name: "x" },
  ops: [{ op: "create", section: "conditions", group: "added", fields: { name: "Made-up thing", status: "active" }, label: "New" }],
});

test("main without --apply makes zero writes to the real KV", async () => {
  const s = spyRest();
  await s.seed("rec:conditions:c1", { id: "c1", name: "Example condition", status: "active" });
  const out = [];
  const report = await main(["p.json"], { rest: s.rest, readFile: async () => PAYLOAD, log: (l) => out.push(l) });
  assert.deepEqual(s.writes, []);
  assert.equal(report.items.length, 1);
  assert.match(out[0], /^DRY RUN \(loaded 1 records/);
});

test("main with --apply writes to the real KV", async () => {
  const s = spyRest();
  await main(["p.json", "--apply"], { rest: s.rest, readFile: async () => PAYLOAD, log: () => {} });
  assert.ok(s.writes.some(([op, k]) => op === "put" && k.startsWith("rec:conditions:")));
  assert.ok(s.writes.some(([op, k]) => op === "put" && k.startsWith("imp:")));
});

test("a misspelled flag stays a dry run", async () => {
  const s = spyRest();
  await main(["p.json", "--appply"], { rest: s.rest, readFile: async () => PAYLOAD, log: () => {} });
  assert.deepEqual(s.writes, []);
});

test("invalid JSON payload error does not echo the payload text", async () => {
  const s = spyRest();
  await assert.rejects(
    main(["p.json"], { rest: s.rest, readFile: async () => '{"secret medical text"', log: () => {} }),
    (e) => e.message === "payload is not readable JSON" && !e.message.includes("secret"),
  );
});

test("update op with both fields.notes and appendNotes is refused", async () => {
  const kv = kvFake();
  const store = createStore(kv);
  const payload = { title: "t", ops: [{ op: "update", section: "conditions", id: "x", fields: { notes: "a" }, appendNotes: "b" }] };
  await assert.rejects(runImport({ kv, store, payload, by: BY }), /cannot carry both fields.notes and appendNotes/);
});
