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
Stage reached: 6 / 6 for data (live, gated, 130 records imported, MED chip live) — Ask MED key still optional/pending
```

## Stages
1. ✅ Code + tests (101 passing as of 2026-10-15). v1 is on `main`; Coming up, import reports, undo and menu are built on branch `feat/coming-up-undo-menu` — deploy and first imports pending final review.
2. ✅ Create KV: `npx wrangler kv namespace create RECORDS` → paste the printed `id` into `wrangler.toml`, commit.
3. ✅ Deploy: `npx wrangler deploy` → attaches med.tuffcityrecords.com. (Domain answers **403** to everyone until Access adds the email header — the Worker allow-list fails closed.)
4. ✅ Access: Zero Trust → Access → Applications → Add → Self-hosted → hostname `med.tuffcityrecords.com` → new policy **"MED — Nanci + Aaron"**: Include → Emails → `nanci@tuffcity.com`, `aaronf@tuffcity.com`. Login methods: One-time PIN + Google.
   Verify: signed out → `/` 302s to tuffcity.cloudflareaccess.com; signed in as nanci@ → app loads.
5. ☐ Assistant (optional): `npx wrangler secret put ANTHROPIC_API_KEY` (use the funded-org key, same as Office Desk).
6. ✅ Import + chip: 130 records written 2026-10-06 (reviewed:false); GM dashboard `claude/med-chip` fast-forwarded to `main` 2026-10-06 (MED chip live, confirmed by Nanci). Future imports: More → **Import findings**.

## Log
- 2026-10-05 — Stage 1: spec + plan (Superpowers), TDD core, Worker, UI. Smoke-tested in Chromium (desktop + phone): import → review → add → guard refusal → tabs → audit.
- 2026-10-06 — Stages 2–4 from a cloud session (Cloudflare API credential in the Claude environment,
  injected by the proxy — wrangler run with CLOUDFLARE_API_TOKEN=injected-by-proxy). KV created; Access app
  created FIRST (policy MED — Nanci + Aaron, all configured IdPs) so the domain was never ungated; then deployed.
  Workers Assets upload 401'd (its upload JWT gets replaced by the injected token), so the page is now bundled
  into the script via src/entry.js + Text rules — a deploy is one script upload. Verified by API: workers.dev
  off, custom domain bound, Access policy allow-only for nanci@/aaronf@.
  Deploy command (from 2026-10-15): CLOUDFLARE_API_TOKEN=injected-by-proxy CLOUDFLARE_ACCOUNT_ID=56306730a3a3aebf779a2525878c4e59 npx wrangler deploy --var MED_VERSION:<short sha>
  (MED_VERSION is served at /api/version; menu Refresh reloads the page when it differs.)
  Keep public/manifest.json.txt in sync with public/manifest.json (bundled copy).
- 2026-10-06 — Data: Gmail/Drive search (Aaron's mailbox + Drive "Medical" folder) → 130 records bulk-written to KV
  as Unreviewed with audit entries (1 duplicate plan dropped; nothing sensitive). A credential seen in a scanned
  document was NOT imported — Nanci advised to change it. MED chip merged on the GM dashboard (user-approved).
- 2026-10-06 — Dates: lists sort newest first by each record's own date. Rule: ranges keep the EARLIEST date, except
  Last seen keeps the LATEST. 10 undated records researched and dated (confidence + source in notes); 3 Last seen
  dates switched to latest. Medications got a Started /
  prescribed date; 9 filled from source records. Nanci confirmed all dates.
- 2026-10-07 — Redesign: phone-first UI (bottom tabs, record sheets, search + To review filter, review mode).
  Smoke-tested phone + desktop; deployed.
- 2026-10-07 — Costs: visits/procedures got cost fields + itemised breakdown; new Treatment plans & quotes section;
  Dental/Medical cost summaries. Gmail/Drive cost research merged: dental 24 visits (15 new) + 5 plans; medical 17 items (6 new);
  possible balances noted in the app. A Drive file containing a plain-text login was flagged to Nanci, not imported.
- 2026-10-15 — Coming up, visit cards, import reports, undo, menu (Refresh / Log out) built on feat/coming-up-undo-menu.
  Imports: `node scripts/apply-import.mjs <payload.json> [--apply]` runs a payload ({title, source, attach?, ops}) through
  src/store.js + src/imports.js so a report is created exactly as in the app. Default is a DRY RUN (real records are read
  from KV into memory; nothing written). --apply writes to the real KV via the REST adapter scripts/lib/kv-rest.mjs
  (CLOUDFLARE_API_TOKEN; CF_ACCOUNT_ID / CF_KV_NAMESPACE override the defaults). In a cloud session also set
  NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt so Node's fetch uses the proxy. Payloads hold medical
  data: keep them outside the repo. Planned first imports: the 2026-08-20 after-visit summary and the aaronf@ scan of 2026-10-15.
