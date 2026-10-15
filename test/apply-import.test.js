import { test } from "node:test";
import assert from "node:assert/strict";
import { kvFake } from "./kv-fake.js";
import { createStore } from "../src/store.js";
import { runImport, formatReport } from "../scripts/apply-import.mjs";

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
