# Deploy state — MED

```
App: MED (Aaron's medical, dental & insurance records)   Local path: ~/tuff-city-medical
GitHub repo: github.com/tuffcity/tuff-city-medical  (private)
Cloudflare Worker: tuff-city-medical        Custom domain: med.tuffcityrecords.com
Team domain: tuffcity.cloudflareaccess.com  Access policy: "MED — Nanci + Aaron" (nanci@, aaronf@) — NOT team-wide, NOT Admin (no admin@)
Worker allow-list: ALLOWED_EMAILS in wrangler.toml [vars]
KV namespace: RECORDS  id = (fill in after step 2)
Secret: ANTHROPIC_API_KEY (optional — only Ask MED needs it)
Stage reached: 1 / 6 — code built and tested, not yet deployed
```

## Stages
1. ✅ Code + tests (34 passing), pushed to `main`.
2. ☐ Create KV: `npx wrangler kv namespace create RECORDS` → paste the printed `id` into `wrangler.toml`, commit.
3. ☐ Deploy: `npx wrangler deploy` → attaches med.tuffcityrecords.com. (Domain answers **403** to everyone until Access adds the email header — the Worker allow-list fails closed.)
4. ☐ Access: Zero Trust → Access → Applications → Add → Self-hosted → hostname `med.tuffcityrecords.com` → new policy **"MED — Nanci + Aaron"**: Include → Emails → `nanci@tuffcity.com`, `aaronf@tuffcity.com`. Login methods: One-time PIN + Google.
   Verify: signed out → `/` 302s to tuffcity.cloudflareaccess.com; signed in as nanci@ → app loads.
5. ☐ Assistant (optional): `npx wrangler secret put ANTHROPIC_API_KEY` (use the funded-org key, same as Office Desk).
6. ☐ Import: open MED → Emergency summary → **Import Gmail/Drive findings** → choose the findings JSON → review each Unreviewed record. Then merge the GM dashboard branch that turns the MED chip into a live link.

## Log
- 2026-10-05 — Stage 1: spec + plan (Superpowers), TDD core, Worker, UI. Smoke-tested in Chromium (desktop + phone): import → review → add → guard refusal → tabs → audit.
