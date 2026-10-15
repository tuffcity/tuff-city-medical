# MED — Aaron's medical, dental & insurance records

Private records app for Aaron Fuchs, linked from the **MED** chip on the GM Command Center.

- **Live:** https://med.tuffcityrecords.com — Cloudflare Access, **Nanci + Aaron only** (own policy, not team-wide), re-checked in the Worker (`ALLOWED_EMAILS`)
- **App (phone-first):** bottom tabs **Home · Medical · Dental · Insurance · More**, plus a **☰ menu** (Today · Records · Changes · Share & save · App · **Log out**) on every screen · Home opens with **Coming up** (appointments, deadlines and to-dos with live countdowns; purple glow, silver within 7 days, pulse within 24 h) · tap a record to open it · visits with vitals/issues/tests show as a visit card · search + **To review** filter on every list · long lists are **collapsible sections** (open/closed state is remembered on the device) · **Start review** goes through unreviewed records one at a time · printable Emergency summary
- **Dates:** every list is newest first by the record's own date (undated last); a date range keeps the **earliest** date, except **Last seen** (latest); `M/D/YYYY` is converted to `YYYY-MM-DD`
- **Data:** Workers KV `RECORDS` — records, uploaded files (≤10 MB) and the audit log. **No medical data is ever committed to this repo.**
- **Privacy:** SSNs and birth dates are refused on every write and question; every response is `no-store`; the assistant answers from stored records only (no web search) and conversations aren't saved
- **Imports:** every document import produces a **report** (added · updated · conflicts · not imported · coming up); keep, undo or decide each item. Menu → **Imports to review**; Home shows a banner while any report is open
- **Undo:** every add, change, confirm, delete and import item can be undone (toast for 8 s, **Undo last change**, or Activity); deleted files are recoverable for 30 days
- **Intake:** manual entry + uploads · Import of a Gmail/Drive findings JSON (records arrive **Unreviewed** until confirmed) · `scripts/apply-import.mjs` for payloads prepared by Claude · Ask MED
- **Records:** 130 imported from Aaron's Gmail + Drive "Medical" folder on 2026-10-06; dates filled for every dated section (sources and confidence in each record's notes)
- **Cheat sheet (how to use it):** `docs/CHEAT-SHEET.md` · **Design & plan:** `docs/superpowers/specs/`, `docs/superpowers/plans/` · **Deploy state:** `docs/DEPLOY-STATE.md`

## Develop

```bash
npm test                          # 96 node:test tests, no dependencies
node scripts/dev-server.mjs 8787  # local app on http://localhost:8787 (in-memory KV, signed in as nanci@)

# Import a prepared payload ({title, source, attach?, ops}). Dry run by default: loads the real records
# read-only into memory and prints the report items. --apply writes to the real KV namespace.
node scripts/apply-import.mjs <payload.json> [--apply]
```

Payloads contain medical data: keep them outside the repo. `apply-import` needs `CLOUDFLARE_API_TOKEN` (`CF_ACCOUNT_ID` / `CF_KV_NAMESPACE` override the defaults); from a cloud session also set `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.

Deploys are wrangler-direct; a git push alone does not deploy. From a cloud session with the Cloudflare API credential:

```bash
CLOUDFLARE_API_TOKEN=injected-by-proxy CLOUDFLARE_ACCOUNT_ID=56306730a3a3aebf779a2525878c4e59 npx wrangler deploy --var MED_VERSION:$(git rev-parse --short HEAD)
```

`MED_VERSION` is what **Refresh** compares to decide whether to reload the page.

The page is bundled into the script (`src/entry.js`); keep `public/manifest.json.txt` in sync with `public/manifest.json`.
