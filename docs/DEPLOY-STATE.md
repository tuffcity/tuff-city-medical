# Deploy state — MED

```
App: MED (Aaron's medical, dental & insurance records)   Local path: ~/tuff-city-medical
GitHub repo: github.com/tuffcity/tuff-city-medical  (private)
Cloudflare Worker: tuff-city-medical        Custom domain: med.tuffcityrecords.com
Team domain: tuffcity.cloudflareaccess.com  Access policy: "MED — Nanci + Aaron" (nanci@, aaronf@) — NOT team-wide, NOT Admin (no admin@)
Worker allow-list: ALLOWED_EMAILS in wrangler.toml [vars]
KV namespace: RECORDS  id = ad60b36992244b3ca5371cc0650241da (tuff-city-medical-RECORDS)
Secret: ANTHROPIC_API_KEY (optional — only Ask MED needs it)
Access app id: 06d6bd4c-8d01-4adc-878a-657f02656ed5
Stage reached: 4 / 6 — live and gated; assistant key + import pending
```

## Stages
1. ✅ Code + tests (34 passing), pushed to `main`.
2. ✅ Create KV: `npx wrangler kv namespace create RECORDS` → paste the printed `id` into `wrangler.toml`, commit.
3. ✅ Deploy: `npx wrangler deploy` → attaches med.tuffcityrecords.com. (Domain answers **403** to everyone until Access adds the email header — the Worker allow-list fails closed.)
4. ✅ Access: Zero Trust → Access → Applications → Add → Self-hosted → hostname `med.tuffcityrecords.com` → new policy **"MED — Nanci + Aaron"**: Include → Emails → `nanci@tuffcity.com`, `aaronf@tuffcity.com`. Login methods: One-time PIN + Google.
   Verify: signed out → `/` 302s to tuffcity.cloudflareaccess.com; signed in as nanci@ → app loads.
5. ☐ Assistant (optional): `npx wrangler secret put ANTHROPIC_API_KEY` (use the funded-org key, same as Office Desk).
6. ☐ Import: open MED → Emergency summary → **Import Gmail/Drive findings** → choose the findings JSON → review each Unreviewed record. Then merge the GM dashboard branch that turns the MED chip into a live link.

## Log
- 2026-10-05 — Stage 1: spec + plan (Superpowers), TDD core, Worker, UI. Smoke-tested in Chromium (desktop + phone): import → review → add → guard refusal → tabs → audit.
- 2026-10-06 — Stages 2–4 from a cloud session (Cloudflare API credential in the Claude environment,
  injected by the proxy — wrangler run with CLOUDFLARE_API_TOKEN=injected-by-proxy). KV created; Access app
  created FIRST (policy MED — Nanci + Aaron, all configured IdPs) so the domain was never ungated; then deployed.
  Workers Assets upload 401'd (its upload JWT gets replaced by the injected token), so the page is now bundled
  into the script via src/entry.js + Text rules — a deploy is one script upload. Verified by API: workers.dev
  off, custom domain bound, Access policy allow-only for nanci@/aaronf@.
  Deploy command: CLOUDFLARE_API_TOKEN=injected-by-proxy CLOUDFLARE_ACCOUNT_ID=56306730a3a3aebf779a2525878c4e59 npx wrangler deploy
  Keep public/manifest.json.txt in sync with public/manifest.json (bundled copy).
