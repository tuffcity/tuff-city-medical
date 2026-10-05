// Local harness: runs worker.js under Node with an in-memory KV and the public/ folder,
// signed in as DEV_EMAIL. Usage: node scripts/dev-server.mjs [port]
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import worker from "../worker.js";
import { kvFake } from "../test/kv-fake.js";

const port = Number(process.argv[2] || 8787);
const TYPES = { ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml", ".js": "text/javascript" };
const env = {
  RECORDS: kvFake(),
  ALLOWED_EMAILS: "nanci@tuffcity.com, aaronf@tuffcity.com",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ASSETS: {
    async fetch(req) {
      let p = normalize(new URL(req.url).pathname).replace(/^(\.\.[/\\])+/, "");
      if (p === "/") p = "/index.html";
      try { return new Response(await readFile(join("public", p)), { headers: { "content-type": TYPES[extname(p)] || "application/octet-stream" } }); }
      catch { return new Response(await readFile("public/index.html"), { headers: { "content-type": "text/html" } }); }
    },
  },
};

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = new Headers(req.headers);
  headers.set("Cf-Access-Authenticated-User-Email", process.env.DEV_EMAIL || "nanci@tuffcity.com");
  const r = await worker.fetch(new Request(`http://localhost:${port}${req.url}`, {
    method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks), duplex: "half",
  }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(`MED dev server on http://localhost:${port}`));
