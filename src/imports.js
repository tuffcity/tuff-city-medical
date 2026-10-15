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

const save = async (kv, report) => {
  report.open = isOpen(report);
  await kv.put(`imp:${report.id}`, JSON.stringify(report));
  return report;
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

async function applyOp(store, op, n, by) {
  const label = String(op?.label ?? "");
  const item = { n, group: "skipped", label, section: op?.section ?? null, recordId: null, logKey: null, before: null, after: null, choices: null, decision: null };
  const skip = (reason) => ({ ...item, group: "skipped", reason });

  if (!op || typeof op !== "object") return skip("Unreadable item.");
  if (op.op === "skip") return skip(String(op.reason ?? "Skipped."));

  if (op.op === "create") {
    const v = vet(op.section, op.fields, false);
    if (v.skip) return skip(v.skip);
    const rec = await store.createRecord(op.section, { ...v.fields, reviewed: false }, by);
    return { ...item, group: op.group === "upcoming" ? "upcoming" : "added", recordId: rec.id, logKey: store.lastLogKey, after: rec };
  }

  if (op.op === "update") {
    const v = vet(op.section, op.fields, true);
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
      const out = { id: String(ch.id), label: String(ch.label ?? "") };
      if (ch.patch) {
        const v = vet(ch.patch.section, ch.patch.fields, true);
        if (v.skip) return skip(v.skip);
        out.patch = { section: ch.patch.section, id: ch.patch.id, fields: v.fields };
      }
      choices.push(out);
    }
    return { ...item, group: "conflict", detail: String(op.detail ?? ""), choices };
  }

  return skip("Unknown item type.");
}

export async function applyImport(store, kv, { title, source, ops }, by) {
  const items = [];
  for (const op of Array.isArray(ops) ? ops : []) items.push(await applyOp(store, op, items.length + 1, by));
  for (const it of items) it.logId = it.logKey; // spec §3.3 name
  const report = {
    id: crypto.randomUUID(), title: String(title ?? "Import").slice(0, 200), createdAt: Date.now(), createdBy: by,
    source: source ?? null, items,
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
    item.decision = "kept";
  } else if (action === "undo") {
    if (!item.logKey) throw new Error("Nothing to undo.");
    const res = await store.undo(item.logKey, by);
    if (!res.ok) throw new Error(res.error);
    item.decision = "undone";
  } else if (action === "choose") {
    const ch = (item.choices ?? []).find((c) => c.id === choice);
    if (!ch) throw new Error("Unknown choice.");
    if (ch.patch) {
      const v = vet(ch.patch.section, ch.patch.fields, true);
      if (v.skip) throw new Error(v.skip);
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
