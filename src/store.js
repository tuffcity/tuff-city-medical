// Workers KV storage. Keys:
//   rec:<section>:<id>   one record (JSON)
//   file:<id>            file bytes, metadata = file info
//   log:<inverted-ms>:<n> audit entry — inverted time so a plain list is newest first

import { recordLabel } from "./schema.js";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TS = 9_999_999_999_999;

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

  async function audit(action, by, section, id, label) {
    const at = tick();
    const key = `log:${String(MAX_TS - at).padStart(13, "0")}:${id}`;
    await kv.put(key, JSON.stringify({ at, by, action, section, id, label }));
  }

  return {
    async listRecords() {
      const keys = await listAll(kv, "rec:");
      return Promise.all(keys.map((k) => kv.get(k.name, "json"))).then((r) => r.filter(Boolean));
    },

    async createRecord(section, fields, by, action = "create") {
      const now = Date.now();
      const rec = {
        ...fields, id: crypto.randomUUID(), section,
        reviewed: fields.reviewed !== false,
        createdAt: now, createdBy: by, updatedAt: now, updatedBy: by,
      };
      await kv.put(`rec:${section}:${rec.id}`, JSON.stringify(rec));
      await audit(action, by, section, rec.id, recordLabel(section, rec));
      return rec;
    },

    async updateRecord(section, id, fields, by) {
      const key = `rec:${section}:${id}`;
      const cur = await kv.get(key, "json");
      if (!cur) return null;
      const rec = { ...cur, ...fields, id, section, updatedAt: Date.now(), updatedBy: by };
      await kv.put(key, JSON.stringify(rec));
      await audit(fields.reviewed === true && !cur.reviewed ? "confirm" : "update", by, section, id, recordLabel(section, rec));
      return rec;
    },

    async deleteRecord(section, id, by) {
      const key = `rec:${section}:${id}`;
      const cur = await kv.get(key, "json");
      if (!cur) return false;
      await kv.delete(key);
      await audit("delete", by, section, id, recordLabel(section, cur));
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
      if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("Files must be 10 MB or smaller.");
      const meta = {
        id: crypto.randomUUID(), name: String(name || "file").slice(0, 200), type: String(type || "application/octet-stream").slice(0, 100),
        size: bytes.byteLength, section: String(section).slice(0, 40), recordId: String(recordId).slice(0, 40),
        uploadedBy: by, uploadedAt: Date.now(),
      };
      await kv.put(`file:${meta.id}`, bytes, { metadata: meta });
      await audit("upload", by, meta.section || "files", meta.id, meta.name);
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
      const { metadata } = await kv.getWithMetadata(`file:${id}`);
      if (!metadata) return false;
      await kv.delete(`file:${id}`);
      await audit("delete", by, metadata.section || "files", id, metadata.name);
      return true;
    },
  };
}
