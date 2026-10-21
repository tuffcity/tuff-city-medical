#!/usr/bin/env node
// Apply an import payload through the app's own store + imports modules, so a report is created.
//   node scripts/apply-import.mjs <payload.json> [--apply]
// Without --apply: dry run against an in-memory copy of the real records (reads only).
// With --apply: writes to the real Cloudflare KV namespace (needs CLOUDFLARE_API_TOKEN).
// Payload: { title, source:{name,note}, attach?:{path,name,type,section,recordId}, ops:[...] }
//   An update op may carry `appendNotes`; notes becomes current + "\n" + appendNotes.

import { readFile as fsReadFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createStore } from "../src/store.js";
import { applyImport } from "../src/imports.js";
import { sensitiveReason } from "../src/guard.js";
import { kvFake } from "../test/kv-fake.js";
import { createKvRest } from "./lib/kv-rest.mjs";

const BY = "import-script";

export async function runImport({ kv, store, payload, by = BY, readFile = fsReadFile }) {
  const source = { ...(payload.source ?? {}) };
  if (payload.attach) {
    const a = payload.attach;
    const why = sensitiveReason(a.name);
    if (why) throw new Error(`attach name contains ${why}; rename the file`);
    const bytes = await readFile(a.path);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const meta = await store.putFile({ name: a.name, type: a.type, bytes: ab, section: a.section, recordId: a.recordId }, by);
    source.fileId = meta.id;
  }
  const ops = [];
  for (const op of payload.ops ?? []) {
    if (op?.op === "update" && op.appendNotes !== undefined) {
      if (op.fields?.notes !== undefined) throw new Error("an update op cannot carry both fields.notes and appendNotes");
      const { appendNotes, ...rest } = op;
      const cur = await kv.get(`rec:${op.section}:${op.id}`, "json");
      const notes = cur?.notes ? `${cur.notes}\n${appendNotes}` : appendNotes;
      ops.push({ ...rest, fields: { ...(op.fields ?? {}), notes } });
    } else {
      ops.push(op);
    }
  }
  return applyImport(store, kv, { title: payload.title, source, ops }, by);
}

export function formatReport(report) {
  const lines = [`${report.title} (${report.items.length} items)`];
  for (const it of report.items) {
    lines.push([it.group, it.label, it.reason].filter(Boolean).join(" · "));
  }
  return lines.join("\n");
}

async function copyRecords(from, to) {
  let cursor;
  let n = 0;
  do {
    const page = await from.list({ prefix: "rec:", cursor });
    for (const { name } of page.keys) {
      const v = await from.get(name);
      if (v !== null) { await to.put(name, v); n++; }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return n;
}

export async function main(argv, { rest = null, readFile = fsReadFile, log = console.log } = {}) {
  const apply = argv.includes("--apply");
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("usage: node scripts/apply-import.mjs <payload.json> [--apply]");
  let payload;
  try {
    payload = JSON.parse(await readFile(file, "utf8"));
  } catch {
    // JSON.parse messages quote the payload text, which may be medical; keep it off the console.
    throw new Error("payload is not readable JSON");
  }
  rest ??= createKvRest();
  let kv = rest;
  if (!apply) {
    kv = kvFake();
    const n = await copyRecords(rest, kv);
    log(`DRY RUN (loaded ${n} records read-only; nothing is written to KV)`);
  } else {
    log("APPLY: writing to the real KV namespace");
  }
  const report = await runImport({ kv, store: createStore(kv), payload, readFile });
  log(formatReport(report));
  if (apply) log(`Report id: ${report.id}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(`Error: ${e.message}`); process.exit(1); });
}
