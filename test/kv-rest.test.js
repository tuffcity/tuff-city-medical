import { test } from "node:test";
import assert from "node:assert/strict";
import { createKvRest } from "../scripts/lib/kv-rest.mjs";

const BASE = "https://api.cloudflare.com/client/v4/accounts/ACC/storage/kv/namespaces/NS";

function harness(responder) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return responder(String(url), init);
  };
  return { calls, kv: createKvRest({ account: "ACC", namespace: "NS", token: "tok", fetch }) };
}
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

test("get json: GET values/<key>, bearer auth, timeout signal", async () => {
  const { calls, kv } = harness(() => new Response('{"a":1}'));
  assert.deepEqual(await kv.get("rec:visits:x y", "json"), { a: 1 });
  assert.equal(calls[0].url, `${BASE}/values/rec%3Avisits%3Ax%20y`);
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test("get returns null on 404; text and arrayBuffer types", async () => {
  const miss = harness(() => new Response("not found", { status: 404 }));
  assert.equal(await miss.kv.get("k", "json"), null);
  const t = harness(() => new Response("hello"));
  assert.equal(await t.kv.get("k"), "hello");
  const b = harness(() => new Response(new Uint8Array([1, 2, 3])));
  assert.deepEqual([...new Uint8Array(await b.kv.get("k", "arrayBuffer"))], [1, 2, 3]);
});

test("get throws on other errors without leaking the token", async () => {
  const { kv } = harness(() => new Response("boom", { status: 500 }));
  await assert.rejects(() => kv.get("k"), (e) => /500/.test(e.message) && !/tok/.test(e.message));
});

test("getWithMetadata reads value then metadata", async () => {
  const { calls, kv } = harness((url) => url.includes("/metadata/") ? json({ success: true, result: { n: 1 } }) : new Response("v"));
  assert.deepEqual(await kv.getWithMetadata("file:1"), { value: "v", metadata: { n: 1 } });
  assert.ok(calls.some((c) => c.url === `${BASE}/metadata/file%3A1`));
});

test("getWithMetadata of a missing key gives nulls", async () => {
  const { kv } = harness(() => new Response("nf", { status: 404 }));
  assert.deepEqual(await kv.getWithMetadata("x"), { value: null, metadata: null });
});

test("put with metadata sends multipart value+metadata and expiration_ttl", async () => {
  const { calls, kv } = harness(() => json({ success: true }));
  await kv.put("k", "val", { metadata: { a: 1 }, expirationTtl: 60 });
  const c = calls[0];
  assert.equal(c.init.method, "PUT");
  assert.equal(c.url, `${BASE}/values/k?expiration_ttl=60`);
  assert.ok(c.init.body instanceof FormData);
  assert.equal(c.init.body.get("value"), "val");
  assert.equal(c.init.body.get("metadata"), '{"a":1}');
});

test("put without metadata sends the raw body; binary values work", async () => {
  const { calls, kv } = harness(() => json({ success: true }));
  await kv.put("k", "val");
  assert.equal(calls[0].url, `${BASE}/values/k`);
  assert.equal(calls[0].init.body, "val");
  await kv.put("f", new Uint8Array([9]).buffer, { metadata: { m: 1 } });
  const blob = calls[1].init.body.get("value");
  assert.equal(blob.size, 1);
});

test("delete and list shapes", async () => {
  const { calls, kv } = harness((url) => url.includes("/keys") ? json({ result: [{ name: "a", metadata: { z: 1 } }, { name: "b" }], result_info: { cursor: "C2" } }) : json({ success: true }));
  await kv.delete("k");
  assert.equal(calls[0].init.method, "DELETE");
  assert.equal(calls[0].url, `${BASE}/values/k`);
  const page = await kv.list({ prefix: "rec:", cursor: "C1" });
  assert.ok(calls[1].url.startsWith(`${BASE}/keys?`));
  const u = new URL(calls[1].url);
  assert.equal(u.searchParams.get("prefix"), "rec:");
  assert.equal(u.searchParams.get("cursor"), "C1");
  assert.deepEqual(page.keys.map((k) => k.name), ["a", "b"]);
  assert.equal(page.list_complete, false);
  assert.equal(page.cursor, "C2");
});

test("list with no further cursor is complete", async () => {
  const { kv } = harness(() => json({ result: [], result_info: { cursor: "" } }));
  const p = await kv.list({ prefix: "x" });
  assert.equal(p.list_complete, true);
});

test("defaults come from env and the token is required", () => {
  assert.throws(() => createKvRest({ fetch: async () => {}, env: {} }), /CLOUDFLARE_API_TOKEN/);
});
