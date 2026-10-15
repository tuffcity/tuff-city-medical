import { test } from "node:test";
import assert from "node:assert/strict";
import { kvFake } from "./kv-fake.js";
import worker from "../worker.js";

const NANCI = { "Cf-Access-Authenticated-User-Email": "nanci@tuffcity.com" };
const env = () => ({
  RECORDS: kvFake(),
  ALLOWED_EMAILS: "nanci@tuffcity.com, aaronf@tuffcity.com",
  ASSETS: { fetch: async () => new Response("<html>", { headers: { "content-type": "text/html" } }) },
});
const call = (e, path, { method = "GET", headers = NANCI, body } = {}) =>
  worker.fetch(new Request("https://med.tuffcityrecords.com" + path, {
    method, headers: { ...headers, ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  }), e);

test("non-allow-listed email gets 403 on the API and on the page", async () => {
  const e = env();
  const r = await call(e, "/api/records", { headers: { "Cf-Access-Authenticated-User-Email": "admin@tuffcity.com" } });
  assert.equal(r.status, 403);
  assert.equal((await call(e, "/", { headers: {} })).status, 403);
});

test("security headers on API and asset responses", async () => {
  const e = env();
  for (const p of ["/api/me", "/"]) {
    const r = await call(e, p);
    assert.equal(r.headers.get("cache-control"), "no-store", p);
    assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow", p);
    assert.equal(r.headers.get("x-frame-options"), "DENY", p);
  }
});

test("me, schema and CRUD round trip", async () => {
  const e = env();
  const me = await (await call(e, "/api/me")).json();
  assert.deepEqual(me, { email: "nanci@tuffcity.com", assistant: false });
  assert.ok((await (await call(e, "/api/schema")).json()).providers);

  let r = await call(e, "/api/records", { method: "POST", body: { section: "allergies", name: "Penicillin" } });
  assert.equal(r.status, 201);
  const rec = await r.json();
  r = await call(e, `/api/records/allergies/${rec.id}`, { method: "PUT", body: { reaction: "hives" } });
  assert.equal((await r.json()).reaction, "hives");
  assert.equal((await (await call(e, "/api/records")).json()).records.length, 1);
  r = await call(e, `/api/records/allergies/${rec.id}`, { method: "DELETE" });
  assert.equal(r.status, 200);
  assert.equal((await call(e, `/api/records/allergies/${rec.id}`, { method: "DELETE" })).status, 404);
  assert.equal((await (await call(e, "/api/audit")).json()).entries.length, 3);
});

test("validation and guard errors are 400 / 422", async () => {
  const e = env();
  assert.equal((await call(e, "/api/records", { method: "POST", body: { section: "providers" } })).status, 400);
  assert.equal((await call(e, "/api/records", { method: "POST", body: { section: "allergies", name: "x", reaction: "SSN 123-45-6789" } })).status, 422);
});

test("import route adds unreviewed records and reports counts", async () => {
  const e = env();
  const r = await call(e, "/api/import", { method: "POST", body: { allergies: [{ name: "Latex", source: "Gmail" }], gaps: ["x"] } });
  const out = await r.json();
  assert.equal(out.added, 1);
  assert.deepEqual(out.gaps, ["x"]);
  const recs = (await (await call(e, "/api/records")).json()).records;
  assert.equal(recs[0].reviewed, false);
});

test("file upload, download and export", async () => {
  const e = env();
  const fd = new FormData();
  fd.append("file", new Blob(["card"], { type: "image/png" }), "card.png");
  fd.append("section", "insurance");
  const up = await call(e, "/api/files", { method: "POST", body: fd });
  assert.equal(up.status, 201);
  const meta = await up.json();
  const dl = await call(e, `/api/files/${meta.id}`);
  assert.equal(dl.headers.get("content-type"), "image/png");
  assert.equal(await dl.text(), "card");
  const ex = await (await call(e, "/api/export")).json();
  assert.equal(ex.files.length, 1);
  assert.ok(ex.exportedAt);
});

test("ask without API key is 503; unknown path 404", async () => {
  const e = env();
  assert.equal((await call(e, "/api/ask", { method: "POST", body: { question: "hi" } })).status, 503);
  assert.equal((await call(e, "/api/nope")).status, 404);
});

const ADMIN = { "Cf-Access-Authenticated-User-Email": "admin@tuffcity.com" };

test("version route returns MED_VERSION or dev, with security headers", async () => {
  const e = env();
  let r = await call(e, "/api/version");
  assert.deepEqual(await r.json(), { version: "dev" });
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  e.MED_VERSION = "abc1234";
  assert.deepEqual(await (await call(e, "/api/version")).json(), { version: "abc1234" });
});

test("write responses carry logKey and undo round-trips over HTTP", async () => {
  const e = env();
  let r = await call(e, "/api/records", { method: "POST", body: { section: "allergies", name: "Penicillin" } });
  const rec = await r.json();
  assert.ok(rec.logKey);
  r = await call(e, `/api/records/allergies/${rec.id}`, { method: "PUT", body: { reaction: "hives" } });
  const upd = await r.json();
  assert.ok(upd.logKey && upd.logKey !== rec.logKey);
  // stale: the create can't be undone while a newer change exists
  r = await call(e, "/api/undo", { method: "POST", body: { key: rec.logKey } });
  assert.equal(r.status, 409);
  assert.ok((await r.json()).error);
  r = await call(e, "/api/undo", { method: "POST", body: { key: upd.logKey } });
  assert.equal(r.status, 200);
  assert.ok((await r.json()).entry);
  const stored = (await (await call(e, "/api/records")).json()).records[0];
  assert.ok(!stored.reaction && !("logKey" in stored));
  r = await call(e, `/api/records/allergies/${rec.id}`, { method: "DELETE" });
  const del = await r.json();
  assert.equal(del.ok, true);
  assert.ok(del.logKey);
  assert.equal((await call(e, "/api/undo", { method: "POST", body: { key: del.logKey } })).status, 200);
  assert.equal((await (await call(e, "/api/records")).json()).records.length, 1);
  assert.equal((await call(e, "/api/undo", { method: "POST", body: {} })).status, 400);
});

test("file upload and delete carry logKey; delete is undoable", async () => {
  const e = env();
  const form = new FormData();
  form.set("file", new File(["hello"], "note.txt", { type: "text/plain" }));
  const up = await (await call(e, "/api/files", { method: "POST", body: form })).json();
  assert.ok(up.logKey && up.id);
  const del = await (await call(e, `/api/files/${up.id}`, { method: "DELETE" })).json();
  assert.ok(del.ok && del.logKey);
  assert.equal((await call(e, "/api/undo", { method: "POST", body: { key: del.logKey } })).status, 200);
  assert.equal((await call(e, `/api/files/${up.id}`)).status, 200);
});

test("imports: create, list, get, settle", async () => {
  const e = env();
  const body = { title: "Visit PDF", source: { name: "visit.pdf" }, ops: [
    { op: "create", section: "allergies", fields: { name: "Latex" }, group: "added", label: "Latex allergy" },
  ] };
  let r = await call(e, "/api/imports", { method: "POST", body });
  assert.equal(r.status, 201);
  const rep = await r.json();
  assert.equal(rep.items.length, 1);
  const list = await (await call(e, "/api/imports")).json();
  assert.equal(list.imports.length, 1);
  assert.equal((await (await call(e, `/api/imports/${rep.id}`)).json()).id, rep.id);
  assert.equal((await call(e, "/api/imports/00000000-0000-0000-0000-000000000000")).status, 404);
  r = await call(e, `/api/imports/${rep.id}/items/1`, { method: "POST", body: { action: "undo" } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).items[0].decision, "undone");
  r = await call(e, `/api/imports/${rep.id}/items/1`, { method: "POST", body: { action: "bogus" } });
  assert.equal(r.status, 200); // already settled: returns report unchanged
  r = await call(e, `/api/imports/${rep.id}/items/9`, { method: "POST", body: { action: "keep" } });
  assert.equal(r.status, 404);
  const r2 = await (await call(e, "/api/imports", { method: "POST", body })).json();
  r = await call(e, `/api/imports/${r2.id}/items/1`, { method: "POST", body: { action: "bogus" } });
  assert.equal(r.status, 409);
  assert.ok((await r.json()).error);
});

test("new routes are 403 for a non-allow-listed email", async () => {
  const e = env();
  const id = "00000000-0000-0000-0000-000000000000";
  for (const [method, path] of [
    ["GET", "/api/version"], ["POST", "/api/undo"], ["GET", "/api/imports"], ["POST", "/api/imports"],
    ["GET", `/api/imports/${id}`], ["POST", `/api/imports/${id}/items/1`],
  ]) {
    assert.equal((await call(e, path, { method, headers: ADMIN, body: method === "POST" ? {} : undefined })).status, 403, path);
  }
});

test("imports: force is an accepted settle action", async () => {
  const e = env();
  const rec = await (await call(e, "/api/records", { method: "POST", body: { section: "conditions", name: "Example", status: "active" } })).json();
  const id = rec.id;
  const body = { title: "F", ops: [{ op: "conflict", label: "C", choices: [{ id: "a", label: "A", patch: { section: "conditions", id, fields: { notes: "n1" } } }] }] };
  const rep = await (await call(e, "/api/imports", { method: "POST", body })).json();
  const r = await call(e, `/api/imports/${rep.id}/items/1`, { method: "POST", body: { action: "force", choice: "a" } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).items[0].decision, "a");
});
