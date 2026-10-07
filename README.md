# MED — Aaron's medical, dental & insurance records

Private records app for Aaron Fuchs, linked from the **MED** chip on the GM Command Center.

- **Live:** https://med.tuffcityrecords.com — Cloudflare Access, **Nanci + Aaron only** (own policy, not team-wide), re-checked in the Worker (`ALLOWED_EMAILS`)
- **App (phone-first):** bottom tabs **Home · Medical · Dental · Insurance · More** · tap a record to open it · search + **To review** filter on every list · **Start review** goes through unreviewed records one at a time · printable Emergency summary · More = Ask MED, Documents, Activity, Print, Backup, Import
- **Dates:** every list is newest first by the record's own date (undated last); a date range keeps the **earliest** date, except **Last seen** (latest); `M/D/YYYY` is converted to `YYYY-MM-DD`
- **Data:** Workers KV `RECORDS` — records, uploaded files (≤10 MB) and the audit log. **No medical data is ever committed to this repo.**
- **Privacy:** SSNs and birth dates are refused on every write and question; every response is `no-store`; the assistant answers from stored records only (no web search) and conversations aren't saved
- **Intake:** manual entry + uploads · Import of a Gmail/Drive findings JSON (records arrive **Unreviewed** until confirmed) · Ask MED
- **Records:** 130 imported from Aaron's Gmail + Drive "Medical" folder on 2026-10-06; dates filled for every dated section (sources and confidence in each record's notes)
- **Cheat sheet (how to use it):** `docs/CHEAT-SHEET.md` · **Design & plan:** `docs/superpowers/specs/`, `docs/superpowers/plans/` · **Deploy state:** `docs/DEPLOY-STATE.md`

## Develop

```bash
npm test                          # 39 node:test tests, no dependencies
node scripts/dev-server.mjs 8787  # local app on http://localhost:8787 (in-memory KV, signed in as nanci@)
```

Deploys are wrangler-direct; a git push alone does not deploy. From a cloud session with the Cloudflare API credential:

```bash
CLOUDFLARE_API_TOKEN=injected-by-proxy CLOUDFLARE_ACCOUNT_ID=56306730a3a3aebf779a2525878c4e59 npx wrangler deploy
```

The page is bundled into the script (`src/entry.js`); keep `public/manifest.json.txt` in sync with `public/manifest.json`.
