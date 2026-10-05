// In-memory stand-in for a Workers KV namespace (the subset the app uses).
export function kvFake({ pageSize = 1000 } = {}) {
  const data = new Map();
  return {
    data,
    async get(key, type) {
      const e = data.get(key);
      if (!e) return null;
      if (type === "arrayBuffer") return e.value instanceof ArrayBuffer ? e.value : new TextEncoder().encode(e.value).buffer;
      if (type === "json") return JSON.parse(e.value);
      return typeof e.value === "string" ? e.value : new TextDecoder().decode(e.value);
    },
    async getWithMetadata(key, type) {
      const e = data.get(key);
      if (!e) return { value: null, metadata: null };
      return { value: await this.get(key, type), metadata: e.metadata ?? null };
    },
    async put(key, value, opts = {}) { data.set(key, { value, metadata: opts.metadata ?? null }); },
    async delete(key) { data.delete(key); },
    async list({ prefix = "", cursor } = {}) {
      const keys = [...data.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const slice = keys.slice(start, start + pageSize);
      const done = start + pageSize >= keys.length;
      return {
        keys: slice.map((name) => ({ name, metadata: data.get(name).metadata })),
        list_complete: done,
        cursor: done ? undefined : String(start + pageSize),
      };
    },
  };
}
