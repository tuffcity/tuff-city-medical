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
