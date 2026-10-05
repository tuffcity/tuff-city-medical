// MED — Aaron's medical, dental & insurance records. Reachable only through the
// Access-gated custom domain (Nanci + Aaron policy); every request — page and API —
// is re-checked against ALLOWED_EMAILS here as defence in depth.
//
// Privacy rules: records and files live in KV (never in git); SSNs and birth dates are
// refused before anything is saved; nothing is cached (no-store everywhere).

import { emailOf, parseAllowList, isAllowed } from "./src/auth.js";
import { findSensitive, sensitiveReason } from "./src/guard.js";
import { SECTIONS, cleanRecord } from "./src/schema.js";
import { createStore, MAX_FILE_BYTES } from "./src/store.js";
import { planImport } from "./src/importer.js";
import { ask } from "./src/assistant.js";

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

function secure(res) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) r.headers.set(k, v);
  return r;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

const refuse = (why) =>
  json({ error: `That looks like it contains ${why}. MED never stores those — take it out and try again.` }, 422);

async function readJson(req, maxBytes = 2_000_000) {
  const text = await req.text();
  if (text.length > maxBytes) throw Object.assign(new Error("Too large."), { status: 413 });
  try { return JSON.parse(text); } catch { throw Object.assign(new Error("Invalid JSON."), { status: 400 }); }
}

async function route(req, env, me) {
  const url = new URL(req.url);
  const p = url.pathname;
  if (!p.startsWith("/api/")) return env.ASSETS.fetch(req);
  const store = createStore(env.RECORDS);

  if (p === "/api/me") return json({ email: me, assistant: !!env.ANTHROPIC_API_KEY });
  if (p === "/api/schema") return json(SECTIONS);

  if (p === "/api/records" && req.method === "GET") return json({ records: await store.listRecords() });

  if (p === "/api/records" && req.method === "POST") {
    const body = await readJson(req);
    const why = findSensitive(body);
    if (why) return refuse(why);
    const { value, error } = cleanRecord(body.section, body);
    if (error) return json({ error }, 400);
    return json(await store.createRecord(body.section, value, me), 201);
  }

  const rm = p.match(/^\/api\/records\/([a-z]+)\/([0-9a-f-]{36})$/);
  if (rm) {
    const [, section, id] = rm;
    if (!SECTIONS[section]) return json({ error: "Unknown section." }, 404);
    if (req.method === "PUT") {
      const body = await readJson(req);
      const why = findSensitive(body);
      if (why) return refuse(why);
      const { value, error } = cleanRecord(section, body, { partial: true });
      if (error) return json({ error }, 400);
      const rec = await store.updateRecord(section, id, value, me);
      return rec ? json(rec) : json({ error: "Not found." }, 404);
    }
    if (req.method === "DELETE") {
      return (await store.deleteRecord(section, id, me)) ? json({ ok: true }) : json({ error: "Not found." }, 404);
    }
    return json({ error: "Method not allowed." }, 405);
  }

  if (p === "/api/files" && req.method === "GET") return json({ files: await store.listFiles() });

  if (p === "/api/files" && req.method === "POST") {
    let form;
    try { form = await req.formData(); } catch { return json({ error: "Send the file as a form upload." }, 400); }
    const file = form.get("file");
    if (!file || typeof file === "string") return json({ error: "No file attached." }, 400);
    if (file.size > MAX_FILE_BYTES) return json({ error: "Files must be 10 MB or smaller." }, 413);
    const why = sensitiveReason(file.name);
    if (why) return refuse(why);
    const meta = await store.putFile({
      name: file.name, type: file.type, bytes: await file.arrayBuffer(),
      section: SECTIONS[form.get("section")] ? form.get("section") : "", recordId: String(form.get("recordId") || ""),
    }, me);
    return json(meta, 201);
  }

  const fm = p.match(/^\/api\/files\/([0-9a-f-]{36})$/);
  if (fm) {
    if (req.method === "GET") {
      const f = await store.getFile(fm[1]);
      if (!f) return json({ error: "Not found." }, 404);
      return new Response(f.bytes, { headers: {
        "content-type": f.meta.type || "application/octet-stream",
        "content-disposition": `inline; filename="${f.meta.name.replace(/[^\w.\- ]/g, "_")}"`,
        // An uploaded HTML/SVG file can never run script in the app's origin.
        "content-security-policy": "sandbox",
      } });
    }
    if (req.method === "DELETE") return (await store.deleteFile(fm[1], me)) ? json({ ok: true }) : json({ error: "Not found." }, 404);
    return json({ error: "Method not allowed." }, 405);
  }

  if (p === "/api/import" && req.method === "POST") {
    const findings = await readJson(req, 5_000_000);
    const plan = planImport(findings, await store.listRecords());
    for (const r of plan.records) await store.createRecord(r.section, r.fields, me, "import");
    return json({ added: plan.records.length, skipped: plan.skipped, gaps: plan.gaps });
  }

  if (p === "/api/audit") return json({ entries: await store.listAudit() });

  if (p === "/api/export") {
    return json({ exportedAt: new Date().toISOString(), exportedBy: me, records: await store.listRecords(), files: await store.listFiles() });
  }

  if (p === "/api/ask" && req.method === "POST") {
    if (!env.ANTHROPIC_API_KEY) return json({ error: "The assistant isn't switched on yet (no API key on the Worker)." }, 503);
    const body = await readJson(req, 200_000);
    const question = String(body.question || "").trim().slice(0, 4000);
    if (!question) return json({ error: "Type a question first." }, 400);
    const why = sensitiveReason(question);
    if (why) return refuse(why);
    try {
      const answer = await ask({
        apiKey: env.ANTHROPIC_API_KEY, me, question,
        history: Array.isArray(body.history) ? body.history : [],
        records: await store.listRecords(), files: await store.listFiles(),
      });
      return json({ answer });
    } catch (e) {
      return json({ error: e.message || "Something went wrong." }, 502);
    }
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(req, env) {
    const me = emailOf(req);
    if (!isAllowed(me, parseAllowList(env.ALLOWED_EMAILS))) {
      return secure(new Response("MED is private to Nanci and Aaron.", { status: 403, headers: { "content-type": "text/plain" } }));
    }
    try {
      return secure(await route(req, env, me));
    } catch (e) {
      if (e.status) return secure(json({ error: e.message }, e.status));
      console.log("error", e && e.stack);
      return secure(json({ error: "Something went wrong." }, 500));
    }
  },
};
