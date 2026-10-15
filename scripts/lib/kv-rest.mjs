// Minimal Workers-KV-compatible adapter over the Cloudflare REST API.
// Implements the subset the app uses: get, getWithMetadata, put, delete, list.
// The token is only ever placed in the Authorization header; never logged.

const DEFAULT_ACCOUNT = "56306730a3a3aebf779a2525878c4e59";
const DEFAULT_NAMESPACE = "ad60b36992244b3ca5371cc0650241da";

export function createKvRest({ account, namespace, token, fetch: fetchImpl = globalThis.fetch, env = process.env } = {}) {
  account ??= env.CF_ACCOUNT_ID || DEFAULT_ACCOUNT;
  namespace ??= env.CF_KV_NAMESPACE || DEFAULT_NAMESPACE;
  token ??= env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set.");
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}`;

  const call = (path, init = {}) =>
    fetchImpl(`${base}/${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });
  const fail = (what, res) => new Error(`KV ${what} failed: HTTP ${res.status}`);
  const k = encodeURIComponent;

  return {
    async get(key, type = "text") {
      const res = await call(`values/${k(key)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw fail("get", res);
      if (type === "arrayBuffer") return res.arrayBuffer();
      const text = await res.text();
      return type === "json" ? JSON.parse(text) : text;
    },

    async getWithMetadata(key, type = "text") {
      const value = await this.get(key, type);
      if (value === null) return { value: null, metadata: null };
      const res = await call(`metadata/${k(key)}`);
      if (res.status === 404) return { value, metadata: null };
      if (!res.ok) throw fail("metadata", res);
      const body = await res.json();
      return { value, metadata: body.result ?? null };
    },

    async put(key, value, { metadata, expirationTtl } = {}) {
      const qs = expirationTtl ? `?expiration_ttl=${Number(expirationTtl)}` : "";
      let body;
      if (metadata !== undefined && metadata !== null) {
        body = new FormData();
        body.set("value", typeof value === "string" ? value : new Blob([value]));
        body.set("metadata", JSON.stringify(metadata));
      } else {
        body = value;
      }
      const res = await call(`values/${k(key)}${qs}`, { method: "PUT", body });
      if (!res.ok) throw fail("put", res);
    },

    async delete(key) {
      const res = await call(`values/${k(key)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw fail("delete", res);
    },

    async list({ prefix = "", cursor } = {}) {
      const p = new URLSearchParams({ prefix, limit: "1000" });
      if (cursor) p.set("cursor", cursor);
      const res = await call(`keys?${p}`);
      if (!res.ok) throw fail("list", res);
      const body = await res.json();
      const next = body.result_info?.cursor || undefined;
      return { keys: body.result ?? [], list_complete: !next, cursor: next };
    },
  };
}
