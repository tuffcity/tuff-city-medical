import { test } from "node:test";
import assert from "node:assert/strict";
import { kvFake } from "./kv-fake.js";
import { createStore, MAX_FILE_BYTES } from "../src/store.js";

test("record create → list → update → delete with audit trail", async () => {
  const kv = kvFake({ pageSize: 2 });
  const s = createStore(kv);
  const a = await s.createRecord("allergies", { name: "Penicillin" }, "nanci@tuffcity.com");
  const b = await s.createRecord("contacts", { name: "Nanci" }, "nanci@tuffcity.com");
  await s.createRecord("contacts", { name: "Other" }, "nanci@tuffcity.com");
  assert.ok(a.id && a.createdAt && a.createdBy === "nanci@tuffcity.com");
  assert.equal(a.reviewed, true, "manual entries are reviewed by default");
  assert.equal((await s.listRecords()).length, 3, "pagination followed");

  const u = await s.updateRecord("contacts", b.id, { phone: "212" }, "aaronf@tuffcity.com");
  assert.equal(u.phone, "212");
  assert.equal(u.name, "Nanci");
  assert.equal(u.updatedBy, "aaronf@tuffcity.com");
  assert.equal(await s.updateRecord("contacts", "nope", {}, "x"), null);

  assert.equal(await s.deleteRecord("contacts", b.id, "nanci@tuffcity.com"), true);
  assert.equal(await s.deleteRecord("contacts", b.id, "nanci@tuffcity.com"), false);
  assert.equal((await s.listRecords()).length, 2);

  const log = await s.listAudit();
  assert.deepEqual(log.map((e) => e.action), ["delete", "update", "create", "create", "create"], "newest first");
  assert.equal(log[0].by, "nanci@tuffcity.com");
  assert.equal(log[0].label, "Nanci");
});

test("imported records keep reviewed:false", async () => {
  const s = createStore(kvFake());
  const r = await s.createRecord("allergies", { name: "Latex", reviewed: false, source: "Gmail x" }, "nanci@tuffcity.com", "import");
  assert.equal(r.reviewed, false);
  assert.equal(r.source, "Gmail x");
  assert.equal((await s.listAudit())[0].action, "import");
});

test("files put/get/delete with size cap", async () => {
  const s = createStore(kvFake());
  const bytes = new TextEncoder().encode("card").buffer;
  const f = await s.putFile({ name: "card.png", type: "image/png", bytes, section: "insurance", recordId: "r1" }, "nanci@tuffcity.com");
  assert.equal(f.size, 4);
  const got = await s.getFile(f.id);
  assert.equal(got.meta.name, "card.png");
  assert.equal(new TextDecoder().decode(got.bytes), "card");
  assert.equal((await s.listFiles()).length, 1);
  await assert.rejects(() => s.putFile({ name: "big", type: "x", bytes: new ArrayBuffer(MAX_FILE_BYTES + 1) }, "n"), /10 MB/);
  assert.equal(await s.deleteFile(f.id, "n"), true);
  assert.equal(await s.getFile(f.id), null);
});

const U = "nanci@tuffcity.com";
const lastKey = async (s) => (await s.listAudit(1))[0].key;

test("listAudit entries carry key, before and after", async () => {
  const s = createStore(kvFake());
  const r = await s.createRecord("allergies", { name: "Latex" }, U);
  const [e] = await s.listAudit();
  assert.match(e.key, /^log:\d{13}:/);
  assert.equal(e.before, null);
  assert.equal(e.after.id, r.id);
  assert.equal(s.lastLogKey, e.key);
  assert.deepEqual(await s.getAudit(e.key), e);
  assert.equal(await s.getAudit("log:nope"), null);
});

test("undo create removes the record", async () => {
  const s = createStore(kvFake());
  const r = await s.createRecord("allergies", { name: "Latex" }, U);
  const res = await s.undo(await lastKey(s), U);
  assert.equal(res.ok, true);
  assert.equal((await s.listRecords()).length, 0);
  const [e] = await s.listAudit();
  assert.equal(e.action, "undo");
  assert.equal(e.undoes.startsWith("log:"), true);
  assert.equal(s.lastLogKey, e.key);
  assert.equal(r.id, e.id);
});

test("undo update restores fields", async () => {
  const s = createStore(kvFake());
  const r = await s.createRecord("contacts", { name: "Nanci", phone: "1" }, U);
  await s.updateRecord("contacts", r.id, { phone: "2" }, U);
  const res = await s.undo(await lastKey(s), U);
  assert.equal(res.ok, true);
  const [cur] = await s.listRecords();
  assert.equal(cur.phone, "1");
});

test("undo confirm makes reviewed false again", async () => {
  const s = createStore(kvFake());
  const r = await s.createRecord("allergies", { name: "Latex", reviewed: false }, U, "import");
  await s.updateRecord("allergies", r.id, { reviewed: true }, U);
  assert.equal((await s.listAudit())[0].action, "confirm");
  await s.undo(await lastKey(s), U);
  assert.equal((await s.listRecords())[0].reviewed, false);
});

test("undo delete restores same id and createdAt", async () => {
  const s = createStore(kvFake());
  const r = await s.createRecord("contacts", { name: "Nanci" }, U);
  await s.deleteRecord("contacts", r.id, U);
  const res = await s.undo(await lastKey(s), U);
  assert.equal(res.ok, true);
  const [cur] = await s.listRecords();
  assert.equal(cur.id, r.id);
  assert.equal(cur.createdAt, r.createdAt);
  assert.deepEqual(cur, r);
});

test("redo: undoing the undo entry reapplies the change", async () => {
  const s = createStore(kvFake());
  const r = await s.createRecord("contacts", { name: "Nanci", phone: "1" }, U);
  await s.updateRecord("contacts", r.id, { phone: "2" }, U);
  await s.undo(await lastKey(s), U);
  assert.equal((await s.listRecords())[0].phone, "1");
  const redo = await s.undo(await lastKey(s), U);
  assert.equal(redo.ok, true);
  assert.equal((await s.listRecords())[0].phone, "2");
  // redo of a delete-undo and of a create-undo
  await s.deleteRecord("contacts", r.id, U);
  await s.undo(await lastKey(s), U);
  assert.equal((await s.listRecords()).length, 1);
  await s.undo(await lastKey(s), U);
  assert.equal((await s.listRecords()).length, 0);
});

test("undo refuses when changed again since", async () => {
  const s = createStore(kvFake());
  const r = await s.createRecord("contacts", { name: "Nanci", phone: "1" }, U);
  await s.updateRecord("contacts", r.id, { phone: "A" }, U);
  const keyA = await lastKey(s);
  await s.updateRecord("contacts", r.id, { phone: "B" }, U);
  const res = await s.undo(keyA, U);
  assert.deepEqual(res, { ok: false, error: "This was changed again since; undo the newer change first." });
  assert.equal((await s.listRecords())[0].phone, "B");
  assert.equal((await s.listAudit())[0].action, "update", "no undo entry written");
  // undo of a create whose record was deleted since is also stale
  const c = await s.createRecord("contacts", { name: "X" }, U);
  const keyC = await lastKey(s);
  await s.deleteRecord("contacts", c.id, U);
  assert.equal((await s.undo(keyC, U)).ok, false);
});

test("undo unknown key", async () => {
  const s = createStore(kvFake());
  assert.deepEqual(await s.undo("log:missing", U), { ok: false, error: "Nothing to undo." });
});

test("undo file delete restores bytes from trash; undo upload trashes", async () => {
  const kv = kvFake();
  const s = createStore(kv);
  const bytes = new TextEncoder().encode("card").buffer;
  const f = await s.putFile({ name: "card.png", type: "image/png", bytes }, U);
  const upKey = await lastKey(s);
  assert.equal((await s.listAudit())[0].kind, "file");
  await s.deleteFile(f.id, U);
  assert.equal(s.lastLogKey, await lastKey(s));
  assert.equal(await s.getFile(f.id), null);
  assert.ok(kv.data.has(`trash:file:${f.id}`));
  const res = await s.undo(await lastKey(s), U);
  assert.equal(res.ok, true);
  const got = await s.getFile(f.id);
  assert.equal(new TextDecoder().decode(got.bytes), "card");
  assert.equal(got.meta.name, "card.png");
  // the file exists again, so the original upload entry (after = meta) is fresh and can be undone
  const res2 = await s.undo(upKey, U);
  assert.equal(res2.ok, true);
  assert.equal(await s.getFile(f.id), null);
  // redo restores again
  assert.equal((await s.undo(await lastKey(s), U)).ok, true);
  assert.ok(await s.getFile(f.id));
});

test("undo file delete reports unrecoverable when trash is gone", async () => {
  const kv = kvFake();
  const s = createStore(kv);
  const f = await s.putFile({ name: "a", type: "x", bytes: new ArrayBuffer(1) }, U);
  await s.deleteFile(f.id, U);
  kv.data.delete(`trash:file:${f.id}`);
  assert.deepEqual(await s.undo(await lastKey(s), U), { ok: false, error: "That file is no longer recoverable." });
});

test("two updates in the same millisecond still make the older undo stale", async () => {
  const s = createStore(kvFake());
  const r = await s.createRecord("contacts", { name: "N", phone: "1" }, U);
  await s.updateRecord("contacts", r.id, { phone: "A" }, U);
  const keyA = await lastKey(s);
  const b = await s.updateRecord("contacts", r.id, { phone: "B" }, U);
  const a = (await s.getAudit(keyA)).after;
  assert.ok(b.updatedAt > a.updatedAt);
  const res = await s.undo(keyA, U);
  assert.equal(res.ok, false);
  assert.equal((await s.listRecords())[0].phone, "B");
});

test("undo of a legacy audit entry (no before/after) is Nothing to undo", async () => {
  const kv = kvFake();
  const s = createStore(kv);
  const key = "log:8000000000000:old";
  await kv.put(key, JSON.stringify({ at: 1, by: U, action: "create", section: "contacts", id: "old", label: "x" }));
  assert.deepEqual(await s.undo(key, U), { ok: false, error: "Nothing to undo." });
});

test("lastLogKey is null after a write that wrote nothing", async () => {
  const s = createStore(kvFake());
  await s.createRecord("contacts", { name: "N" }, U);
  assert.ok(s.lastLogKey);
  assert.equal(await s.deleteRecord("contacts", "missing", U), false);
  assert.equal(s.lastLogKey, null);
  await s.createRecord("contacts", { name: "N" }, U);
  assert.equal(await s.updateRecord("contacts", "missing", {}, U), null);
  assert.equal(s.lastLogKey, null);
  await s.createRecord("contacts", { name: "N" }, U);
  assert.equal(await s.deleteFile("missing", U), false);
  assert.equal(s.lastLogKey, null);
  await s.createRecord("contacts", { name: "N" }, U);
  await s.undo("log:missing", U);
  assert.equal(s.lastLogKey, null);
});
