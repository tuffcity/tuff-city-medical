// Import reports: a batch of record changes applied from a document, each audited and
// individually keepable or undoable. Stored at imp:<id> (spec §3.3).

import { cleanRecord } from "./schema.js";
import { findSensitive } from "./guard.js";

const notFound = () => new Error("Not found.");
const isSettled = (it) => it.group === "skipped" || it.decision !== null;
const isOpen = (r) => r.items.some((it) => it.group !== "skipped" && it.decision === null);

async function listAll(kv, prefix) {
  const keys = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return keys;
}

// Report text is stored and shown; never let a sensitive value ride along in it.
const scrub = (v) => {
  const text = String(v ?? "");
  const hit = findSensitive(text);
  return hit ? `[removed: contains ${hit}]` : text;
};

// Replace every sensitive string anywhere in a value tree (objects and arrays included).
function scrubDeep(v) {
  if (typeof v === "string") return scrub(v);
  if (Array.isArray(v)) return v.map(scrubDeep);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubDeep(x)]));
  return v;
}

// KV allows about one write per second per key; back off on a 429 (delays are overridable in tests).
export const retry = { delays: [300, 600, 1200] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function putWithRetry(kv, key, value) {
  for (let i = 0; ; i++) {
    try { return await kv.put(key, value); } catch (err) {
      if (i >= retry.delays.length || !/429|rate/i.test(String(err?.message ?? err))) throw err;
      await sleep(retry.delays[i]);
    }
  }
}

const save = async (kv, report) => {
  const clean = scrubDeep(report);
  clean.open = isOpen(clean);
  await putWithRetry(kv, `imp:${clean.id}`, JSON.stringify(clean));
  return clean;
};

const sensitiveSkip = (reason) => `Contains ${reason}; not imported.`;

// → { skip: reason } or { fields } for a patch / op fields (partial = update).
function vet(section, fields, partial) {
  const hit = findSensitive(fields);
  if (hit) return { skip: sensitiveSkip(hit) };
  const c = cleanRecord(section, fields, { partial });
  if (c.error) return { skip: c.error };
  return { fields: c.value };
}

async function applyOp(store, kv, op, n, by) {
  const label = scrub(op?.label);
  const item = { n, group: "skipped", label, section: op?.section ?? null, recordId: null, logKey: null, before: null, after: null, choices: null, decision: null };
  const skip = (reason) => ({ ...item, group: "skipped", reason: scrub(reason) });

  if (!op || typeof op !== "object") return skip("Unreadable item.");
  if (op.op === "skip") return skip(op.reason ?? "Skipped.");

  if (op.op === "create") {
    const v = vet(op.section, op.fields ?? {}, false);
    if (v.skip) return skip(v.skip);
    const rec = await store.createRecord(op.section, { ...v.fields, reviewed: false }, by);
    return { ...item, group: op.group === "upcoming" ? "upcoming" : "added", recordId: rec.id, logKey: store.lastLogKey, after: rec };
  }

  if (op.op === "update") {
    const v = vet(op.section, op.fields ?? {}, true);
    if (v.skip) return skip(v.skip);
    const entry0 = await store.updateRecord(op.section, op.id, v.fields, by);
    if (!entry0) return skip("That record no longer exists.");
    const logKey = store.lastLogKey;
    const entry = await store.getAudit(logKey);
    return { ...item, group: "updated", recordId: op.id, logKey, before: entry?.before ?? null, after: entry0 };
  }

  if (op.op === "conflict") {
    const choices = [];
    for (const ch of Array.isArray(op.choices) ? op.choices : []) {
      if (!ch || typeof ch !== "object") continue;
      const out = { id: String(ch.id), label: scrub(ch.label) };
      if (ch.patch && typeof ch.patch === "object") {
        const v = vet(ch.patch.section, ch.patch.fields ?? {}, true);
        if (v.skip) return skip(v.skip);
        const cur = await kv.get(`rec:${ch.patch.section}:${ch.patch.id}`, "json");
        if (!cur) return skip("That record no longer exists.");
        out.patch = { section: ch.patch.section, id: ch.patch.id, fields: v.fields, baseUpdatedAt: cur.updatedAt };
      }
      choices.push(out);
    }
    return { ...item, group: "conflict", detail: scrub(op.detail), choices };
  }

  return skip("Unknown item type.");
}

export async function applyImport(store, kv, { title, source, ops }, by) {
  const items = [];
  for (const op of Array.isArray(ops) ? ops : []) {
    const n = items.length + 1;
    try {
      items.push(await applyOp(store, kv, op, n, by));
    } catch (err) {
      items.push({ n, group: "skipped", label: scrub(op?.label), section: op?.section ?? null, recordId: null, logKey: null,
        before: null, after: null, choices: null, decision: null, reason: scrub(`Couldn't apply: ${err?.message ?? err}`) });
    }
  }
  // Second pass: a conflict patch is stale only if its record changed after the whole import.
  for (const it of items) {
    for (const ch of it.choices ?? []) {
      if (!ch.patch) continue;
      const cur = await kv.get(`rec:${ch.patch.section}:${ch.patch.id}`, "json");
      if (cur) ch.patch.baseUpdatedAt = cur.updatedAt;
    }
  }
  const src = source && typeof source === "object" ? source : null;
  const report = {
    id: crypto.randomUUID(), title: scrub(title ?? "Import").slice(0, 200), createdAt: Date.now(), createdBy: by,
    source: src, items,
  };
  return save(kv, report);
}

export async function getImport(kv, id) {
  return kv.get(`imp:${id}`, "json");
}

export async function listImports(kv) {
  const keys = await listAll(kv, "imp:");
  const reports = (await Promise.all(keys.map((k) => kv.get(k.name, "json")))).filter(Boolean);
  return reports
    .map((r) => ({
      id: r.id, title: r.title, createdAt: r.createdAt, open: isOpen(r),
      settled: r.items.filter(isSettled).length, total: r.items.length,
    }))
    .sort((a, b) => (b.open - a.open) || (b.createdAt - a.createdAt));
}

export async function settleItem(store, kv, id, n, { action, choice } = {}, by) {
  const report = await getImport(kv, id);
  const item = report?.items.find((it) => it.n === Number(n));
  if (!item) throw notFound();
  if (item.group === "skipped" || item.decision !== null) return report;

  if (action === "keep") {
    if (item.group === "conflict") throw new Error("Choose an option for this conflict.");
    item.decision = "kept";
  } else if (action === "undo") {
    if (!item.logKey) throw new Error("Nothing to undo.");
    const res = await store.undo(item.logKey, by);
    if (!res.ok) throw new Error(res.error);
    item.decision = "undone";
  } else if (action === "choose" || action === "force") {
    const ch = (item.choices ?? []).find((c) => c.id === choice);
    if (!ch) throw new Error("Unknown choice.");
    if (ch.patch) {
      const v = vet(ch.patch.section, ch.patch.fields, true);
      if (v.skip) throw new Error(v.skip);
      const cur = await kv.get(`rec:${ch.patch.section}:${ch.patch.id}`, "json");
      if (!cur) throw new Error("That record no longer exists.");
      if (action === "choose" && cur.updatedAt !== ch.patch.baseUpdatedAt) throw new Error("This record changed since the import; review it before choosing.");
      const rec = await store.updateRecord(ch.patch.section, ch.patch.id, v.fields, by);
      if (!rec) throw new Error("That record no longer exists.");
      item.patchLogKey = store.lastLogKey;
    }
    item.decision = ch.id;
  } else {
    throw new Error("Unknown action.");
  }
  return save(kv, report);
}
