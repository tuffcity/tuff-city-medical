---
app: MED
url: https://med.tuffcityrecords.com
updated: 2026-10-07
notion:
repo: ~/tuff-city-medical
doc: docs/CHEAT-SHEET.md
---

# MED — Cheat Sheet

*https://med.tuffcityrecords.com — Aaron's medical history, dental history and insurance in one private place · updated 2026-10-07*

## What it is
A private records app for Aaron Fuchs. It holds his doctors and dentists, visits, procedures, conditions, medications, allergies, immunizations, insurance plans, claims and emergency contacts, plus uploaded documents. It opens from the lavender **MED** chip on the GM Command Center. Its Home screen has a printable **Emergency summary**.

## Open it
- **URL:** https://med.tuffcityrecords.com, or the **MED** chip on gm.tuffcityrecords.com (☰ apps)
- **Who:** 2 people only, `nanci@tuffcity.com` and `aaronf@tuffcity.com`, via the Cloudflare Access policy **"MED — Nanci + Aaron"**. It is **not** the team-wide policy and **not** Admin, so `admin@` has no access. The Worker re-checks the same two emails (`ALLOWED_EMAILS`) and refuses everyone else, page included.
- **Login:** email one-time PIN or Google. Session lasts 24h.
- **On a phone:** open the URL → Share → **Add to Home Screen**.

## Where everything lives
- **Local folder:** `~/tuff-city-medical`
- **GitHub:** github.com/tuffcity/tuff-city-medical (private). Code and docs only; **no medical data is ever committed**.
- **Cloudflare:** Worker `tuff-city-medical` · custom domain `med.tuffcityrecords.com` · workers.dev **off**
- **Deploys:** **pushing to GitHub does NOT deploy.** Claude tests, then runs `npx wrangler deploy`. From a cloud session it uses the Cloudflare API credential stored in the Claude environment (command in the repo README). The page is bundled into the Worker script (`src/entry.js`), so a deploy is a single upload.

## Data in · data out
- **The master:** Cloudflare KV namespace **RECORDS** (`ad60b36992244b3ca5371cc0650241da`). It holds every record (`rec:<section>:<id>`), uploaded files up to 10 MB (`file:<id>`) and the audit log (`log:…`).
- **On device:** nothing. There is no offline cache, and every response is `no-store`, so medical data doesn't linger on a lost phone. Only the last-opened tab is remembered.
- **Backup:** More → **Download backup** saves all records as JSON. File contents are not included; download those from Documents.
- **Gmail / Drive:** a one-time search on 2026-10-06 of Aaron's mailbox and his Drive "Medical" folder loaded **130 records** as **Unreviewed**. Each record names its source email or file. A future findings file can be added with More → **Import findings**.
- **Privacy rules:** Social Security numbers and birth dates are refused on every save, import and question. Ask MED answers **only** from stored records, never searches the web and saves no conversations.

## Date rules
- Every list is **newest first** by the record's own date; records with no date go last, A–Z.
- Sort date by section: visits, procedures, immunizations and claims use their **date**; providers use **Last seen**; conditions use **Since**; medications use **Started / prescribed**; insurance uses **Effective**. Allergies and contacts sort A–Z.
- A **date range keeps the earliest date**, except **Last seen**, which keeps the **latest**. A US-style date like `4/12/2019` is converted to `2019-04-12`. This happens automatically on every save and import.

## Routines
None of its own. No scheduled task reads or writes MED.

## Common actions
- **Review imported records:** Home → **Start review**. One record at a time, newest first: **✓ Confirm**, **Edit**, **Skip** or **Delete**. Progress shows on Home, and the orange dot on a list row means "needs review".
- **Find something:** Medical / Dental / Insurance tab → search box, or tap **To review** to see only unconfirmed records.
- **Open a record:** tap any row → all details, attachments and source → **Confirm · Edit · Attach · Delete**. Phone numbers are tappable to call.
- **Add a record:** **+ Add** next to any section (Conditions, Medications, Dentists, Insurance plans…).
- **Add a document:** More → **Documents** → pick the section → **Upload a file** (insurance cards front and back, EOBs, X-rays, lab results). Or open a record → **Attach**.
- **Print the emergency card:** Home → **Emergency summary** → **Print**, or More → **Print emergency card**.
- **See who changed what:** More → **Activity**.
- **Ask a question:** More → **Ask MED**. It needs an Anthropic API key on the Worker, which hasn't been added yet.

## If something breaks
| Symptom | What it means | What to do |
|---|---|---|
| "MED is private to Nanci and Aaron." | Signed in with an email that isn't on the list | Sign out of Cloudflare Access (or use a private window) and sign in as nanci@ or aaronf@ |
| Login page keeps looping / old version showing | Stale Access or Google session | Open the Access logout URL, or use an incognito window and the email code |
| "That looks like it contains a Social Security number / a birth date" | The privacy guard refused the save | Remove the number or date and save again |
| "…must be YYYY, YYYY-MM or YYYY-MM-DD" | Date typed in an unrecognised format | Type e.g. `2024-04-11`, `2024-04` or `2024`; a range or `4/11/2024` is also accepted |
| Ask MED says it isn't switched on | No `ANTHROPIC_API_KEY` on the Worker | Ask Claude to add it (Nanci pastes the key into wrangler, never into chat) |
| A change doesn't show right away after Claude edits data directly | Cloudflare KV can take up to ~60 s to show a new write everywhere | Wait a minute and refresh |

## Fuller documentation
- Design spec: `docs/superpowers/specs/2026-10-05-med-records-design.md` (decisions, data model, API, UI)
- Build plan and post-launch changes: `docs/superpowers/plans/2026-10-05-med-records.md`
- Deploy state and log: `docs/DEPLOY-STATE.md`
- Vault copy: **to add** as `4.7 — MED — Cheat Sheet.md` in the App Reference vault (People & running the day)
