// Production entry: the page files are bundled into the Worker (Text modules) instead of
// a separate Workers Assets upload, so a deploy is a single script upload.
import app from "../worker.js";
import indexHtml from "../public/index.html";
import manifest from "../public/manifest.json.txt";
import icon from "../public/icon.svg";

const FILES = {
  "/manifest.json": [manifest, "application/manifest+json"],
  "/icon.svg": [icon, "image/svg+xml"],
};

const ASSETS = {
  async fetch(req) {
    const f = FILES[new URL(req.url).pathname];
    if (f) return new Response(f[0], { headers: { "content-type": f[1] } });
    return new Response(indexHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
  },
};

export default {
  fetch: (req, env, ctx) => app.fetch(req, { ...env, ASSETS }, ctx),
};
