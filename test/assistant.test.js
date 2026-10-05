import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContext, systemPrompt, ask } from "../src/assistant.js";

const records = [
  { section: "allergies", id: "a", name: "Penicillin", reaction: "hives", reviewed: true, createdBy: "n" },
  { section: "insurance", id: "b", type: "medicare", carrier: "Medicare", memberId: "1EG4", reviewed: false },
];
const files = [{ id: "f", name: "card.png", section: "insurance", size: 10 }];

test("context groups by section, flags unreviewed, lists files without bytes", () => {
  const c = buildContext(records, files);
  assert.match(c, /## allergies/);
  assert.match(c, /Penicillin/);
  assert.match(c, /UNREVIEWED/);
  assert.match(c, /card\.png/);
  assert.doesNotMatch(c, /createdBy/);
});

test("system prompt forbids inventing and names the person", () => {
  const p = systemPrompt("nanci@tuffcity.com", "CTX");
  assert.match(p, /Aaron Fuchs/);
  assert.match(p, /only/i);
  assert.match(p, /CTX/);
});

test("ask calls Claude with records context and no tools", async () => {
  let body;
  const fetchStub = async (url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ content: [{ type: "text", text: "Penicillin (hives)." }], stop_reason: "end_turn" }));
  };
  const out = await ask({ apiKey: "k", fetch: fetchStub, me: "nanci@tuffcity.com", records, files, question: "Allergies?", history: [{ role: "user", text: "hi" }, { role: "assistant", text: "hello" }] });
  assert.equal(out, "Penicillin (hives).");
  assert.equal(body.tools, undefined);
  assert.match(body.system, /Penicillin/);
  assert.deepEqual(body.messages.map((m) => m.role), ["user", "assistant", "user"]);
});

test("API errors become plain words", async () => {
  const f = (status, text = "") => async () => new Response(text, { status });
  await assert.rejects(() => ask({ apiKey: "k", fetch: f(401), records: [], files: [], question: "q" }), /API key/);
  await assert.rejects(() => ask({ apiKey: "k", fetch: f(400, "credit balance is too low"), records: [], files: [], question: "q" }), /credit/);
  await assert.rejects(() => ask({ apiKey: "k", fetch: f(429), records: [], files: [], question: "q" }), /busy/);
});
