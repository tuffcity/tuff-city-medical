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
