// Workers KV storage. Keys:
//   rec:<section>:<id>   one record (JSON)
//   file:<id>            file bytes, metadata = file info
//   log:<inverted-ms>:<n> audit entry — inverted time so a plain list is newest first

import { recordLabel } from "./schema.js";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TS = 9_999_999_999_999;
export const TRASH_TTL_SECONDS = 30 * 24 * 60 * 60; // deleted files stay recoverable for 30 days
const STALE_ERROR = "This was changed again since; undo the newer change first.";

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

export function createStore(kv) {
  let lastTs = 0;
  const tick = () => (lastTs = Math.max(Date.now(), lastTs + 1));

  let lastLogKey = null;

  async function audit(action, by, section, id, label, before = null, after = null, extra = {}) {
    const at = tick();
    const key = `log:${String(MAX_TS - at).padStart(13, "0")}:${id}`;
    await kv.put(key, JSON.stringify({ at, by, action, section, id, label, key, before, after, ...extra }));
    lastLogKey = key;
    return key;
  }

  // Move a file's bytes to trash, then remove the live copy.
  async function trashFile(id, meta) {
    const { value } = await kv.getWithMetadata(`file:${id}`, "arrayBuffer");
    if (!value) return false;
    await kv.put(`trash:file:${id}`, value, { expirationTtl: TRASH_TTL_SECONDS, metadata: meta });
    await kv.delete(`file:${id}`);
    return true;
  }

  async function undoFile(entry) {
    const exists = !!(await kv.getWithMetadata(`file:${entry.id}`)).metadata;
    if (entry.after === null ? exists : !exists) return { ok: false, error: STALE_ERROR };
    if (entry.before === null) {
      if (!(await trashFile(entry.id, entry.after))) return { ok: false, error: "That file is no longer recoverable." };
    } else {
      const { value, metadata } = await kv.getWithMetadata(`trash:file:${entry.id}`, "arrayBuffer");
      if (!value) return { ok: false, error: "That file is no longer recoverable." };
      await kv.put(`file:${entry.id}`, value, { metadata: metadata || entry.before });
    }
    return { ok: true };
  }

  async function undoRecord(entry) {
    const key = `rec:${entry.section}:${entry.id}`;
    const cur = await kv.get(key, "json");
    const fresh = entry.after === null ? cur === null : cur !== null && cur.updatedAt === entry.after.updatedAt;
    if (!fresh) return { ok: false, error: STALE_ERROR };
    if (entry.before === null) await kv.delete(key);
    else await kv.put(key, JSON.stringify(entry.before));
    return { ok: true };
  }

  return {
    get lastLogKey() { return lastLogKey; },

    async getAudit(logKey) {
      return kv.get(logKey, "json");
    },

    async undo(logKey, by) {
      lastLogKey = null;
      const entry = String(logKey).startsWith("log:") ? await kv.get(logKey, "json") : null;
      if (!entry || !("before" in entry && "after" in entry)) return { ok: false, error: "Nothing to undo." };
      const res = entry.kind === "file" ? await undoFile(entry) : await undoRecord(entry);
      if (!res.ok) return res;
      await audit("undo", by, entry.section, entry.id, entry.label, entry.after, entry.before,
        { undoes: entry.key, ...(entry.kind === "file" ? { kind: "file" } : {}) });
      return { ok: true, entry };
    },

    async listRecords() {
      const keys = await listAll(kv, "rec:");
      return Promise.all(keys.map((k) => kv.get(k.name, "json"))).then((r) => r.filter(Boolean));
    },

    async createRecord(section, fields, by, action = "create") {
      lastLogKey = null;
      const now = Date.now();
      const rec = {
        ...fields, id: crypto.randomUUID(), section,
        reviewed: fields.reviewed !== false,
        createdAt: now, createdBy: by, updatedAt: now, updatedBy: by,
      };
      await kv.put(`rec:${section}:${rec.id}`, JSON.stringify(rec));
      await audit(action, by, section, rec.id, recordLabel(section, rec), null, rec);
      return rec;
    },

    async updateRecord(section, id, fields, by) {
      lastLogKey = null;
      const key = `rec:${section}:${id}`;
      const cur = await kv.get(key, "json");
      if (!cur) return null;
      const rec = { ...cur, ...fields, id, section, updatedAt: Math.max(Date.now(), (cur.updatedAt ?? 0) + 1), updatedBy: by };
      await kv.put(key, JSON.stringify(rec));
      await audit(fields.reviewed === true && !cur.reviewed ? "confirm" : "update", by, section, id, recordLabel(section, rec), cur, rec);
      return rec;
    },

    async deleteRecord(section, id, by) {
      lastLogKey = null;
      const key = `rec:${section}:${id}`;
      const cur = await kv.get(key, "json");
      if (!cur) return false;
      await kv.delete(key);
      await audit("delete", by, section, id, recordLabel(section, cur), cur, null);
      return true;
    },

    async listAudit(limit = 200) {
      const keys = [];
      let cursor;
      do {
        const page = await kv.list({ prefix: "log:", cursor });
        keys.push(...page.keys);
        cursor = page.list_complete ? null : page.cursor;
      } while (cursor && keys.length < limit);
      keys.length = Math.min(keys.length, limit);
      return Promise.all(keys.map((k) => kv.get(k.name, "json"))).then((r) => r.filter(Boolean));
    },

    async putFile({ name, type, bytes, section = "", recordId = "" }, by) {
      lastLogKey = null;
      if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("Files must be 10 MB or smaller.");
      const meta = {
        id: crypto.randomUUID(), name: String(name || "file").slice(0, 200), type: String(type || "application/octet-stream").slice(0, 100),
        size: bytes.byteLength, section: String(section).slice(0, 40), recordId: String(recordId).slice(0, 40),
        uploadedBy: by, uploadedAt: Date.now(),
      };
      await kv.put(`file:${meta.id}`, bytes, { metadata: meta });
      await audit("upload", by, meta.section || "files", meta.id, meta.name, null, meta, { kind: "file" });
      return meta;
    },

    async getFile(id) {
      const { value, metadata } = await kv.getWithMetadata(`file:${id}`, "arrayBuffer");
      return value ? { meta: metadata, bytes: value } : null;
    },

    async listFiles() {
      return (await listAll(kv, "file:")).map((k) => k.metadata).filter(Boolean)
        .sort((a, b) => b.uploadedAt - a.uploadedAt);
    },

    async deleteFile(id, by) {
      lastLogKey = null;
      const { metadata } = await kv.getWithMetadata(`file:${id}`);
      if (!metadata) return false;
      if (!(await trashFile(id, metadata))) return false;
      await audit("delete", by, metadata.section || "files", id, metadata.name, metadata, null, { kind: "file" });
      return true;
    },
  };
}
