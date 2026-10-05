# MED — Aaron's medical, dental & insurance records

Private records app for Aaron Fuchs, linked from the **MED** chip on the GM Command Center.

- **Live:** https://med.tuffcityrecords.com — Cloudflare Access, **Nanci + Aaron only** (own policy, not team-wide), re-checked in the Worker (`ALLOWED_EMAILS`)
- **Sections:** Emergency summary (printable) · Medical · Dental · Insurance · Documents · Activity · Ask MED
- **Data:** Workers KV `RECORDS` — records, uploaded files (≤10 MB) and the audit log. **No medical data is ever committed to this repo.**
- **Privacy:** SSNs and birth dates are refused on every write and question; every response is `no-store`; the assistant answers from stored records only (no web search) and conversations aren't saved
- **Intake:** manual entry + uploads · Import of a Gmail/Drive findings JSON (records arrive **Unreviewed** until confirmed) · Ask MED
- **Design & plan:** `docs/superpowers/specs/`, `docs/superpowers/plans/` · **Deploy state:** `docs/DEPLOY-STATE.md`

## Develop

```bash
npm test                          # 34 node:test tests, no dependencies
node scripts/dev-server.mjs 8787  # local app on http://localhost:8787 (in-memory KV, signed in as nanci@)
```

Deploys are wrangler-direct (`npx wrangler deploy`); a git push alone does not deploy.
