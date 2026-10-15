---
app: MED
url: https://med.tuffcityrecords.com
updated: 2026-10-07
notion:
repo: ~/tuff-city-medical
doc: docs/CHEAT-SHEET.md
---

# MED — Cheat Sheet

*https://med.tuffcityrecords.com — Aaron's medical history, dental history and insurance in one private place · updated 2026-10-15*

## What it is
A private records app for Aaron Fuchs. It holds his doctors and dentists, visits, procedures, conditions, medications, allergies, immunizations, insurance plans, claims and emergency contacts, plus uploaded documents. It opens from the lavender **MED** chip on the GM Command Center. Its Home screen opens with **Coming up** and has a printable **Emergency summary**.

## Open it
- **URL:** https://med.tuffcityrecords.com, or the **MED** chip on gm.tuffcityrecords.com (☰ apps)
- **Who:** 2 people only, `nanci@tuffcity.com` and `aaronf@tuffcity.com`, via the Cloudflare Access policy **"MED — Nanci + Aaron"**. It is **not** the team-wide policy and **not** Admin, so `admin@` has no access. The Worker re-checks the same two emails (`ALLOWED_EMAILS`) and refuses everyone else, page included.
- **Login:** email one-time PIN or Google. Session lasts 24h.
- **On a phone:** open the URL → Share → **Add to Home Screen**.

## Where everything lives
- **Local folder:** `~/tuff-city-medical`
- **GitHub:** github.com/tuffcity/tuff-city-medical (private). Code and docs only; **no medical data is ever committed**.
- **Cloudflare:** Worker `tuff-city-medical` · custom domain `med.tuffcityrecords.com` · workers.dev **off**
- **Deploys:** **pushing to GitHub does NOT deploy.** Claude tests, then runs `npx wrangler deploy --var MED_VERSION:<short sha>`. From a cloud session it uses the Cloudflare API credential stored in the Claude environment (command in the repo README). The page is bundled into the Worker script (`src/entry.js`), so a deploy is a single upload.

## Data in · data out
- **The master:** Cloudflare KV namespace **RECORDS** (`ad60b36992244b3ca5371cc0650241da`). It holds every record (`rec:<section>:<id>`), uploaded files up to 10 MB (`file:<id>`) and the audit log (`log:…`).
- **On device:** nothing. There is no offline cache, and every response is `no-store`, so medical data doesn't linger on a lost phone. Only the last-opened tab, which sections are open/closed and the light/dark choice are remembered.
- **Backup:** menu → **Download backup** saves all records as JSON. File contents are not included; download those from Documents.
- **Gmail / Drive:** a one-time search on 2026-10-06 of Aaron's mailbox and his Drive "Medical" folder loaded **130 records** as **Unreviewed**. Each record names its source email or file. Later documents (e.g. the 2026-08-20 NYU After Visit Summary) and the aaronf@ email scan of 2026-10-15 come in as **import reports** (see below).
- **Privacy rules:** Social Security numbers and birth dates are refused on every save, import and question. Ask MED answers **only** from stored records, never searches the web and saves no conversations.

## Coming up & countdown glow rules
Home opens with **Coming up**: appointments, deadlines and to-dos for Aaron. Dated items come first, soonest first, each with a live countdown (days · hours · minutes, refreshed every 30 s); undated to-dos follow; future-dated visits appear too.
| Time left | Look |
|---|---|
| More than 7 days | Deep purple glow |
| 7 days or less | Silver glow |
| 24 hours or less | Strong pulse (a steady bright border if the phone is set to reduce motion) |
| Passed | Leaves Coming up; find it under **Past** |
- Times are New York time. A deadline with no time counts to 11:59 PM. A partial date like `2027-02` has no countdown, so it shows as a to-do until the real date is set.
- Tap an item for details, then **Mark done · Edit · Call**. Done and cancelled items leave Home at once. Items from scans arrive **Unreviewed**.

## Import reports
Every document import (AVS, email scan) makes one report listing what was **Added**, **Updated**, **Conflicts to settle**, **Not imported** and **Coming up**.
- Find it: menu → **Imports to review** (open ones first, "n of m settled"), or the banner on Home.
- Per item: **Keep**, **Undo**, or for a conflict pick one of the options. A report stays open until every item is settled. **Print** is on each report.
- Birth dates and medical record numbers are never copied in (privacy rule). The original PDF is attached to the visit.
- Claude applies imports with `node scripts/apply-import.mjs <payload> [--apply]`; the default is a dry run that shows the report without writing.

## Undo
- After every change a toast shows **Undo** for 8 seconds.
- Missed it: menu → **Undo last change** (names what it will undo and asks first), or **Activity & undo history** for older entries.
- If the record was changed again since, undo is refused ("undo the newer change first") so nothing is lost. An undo can itself be undone.
- A deleted file stays recoverable for 30 days.

## Menu
The **☰** button (every screen) opens a drawer on phones, a drop-down on wide screens: **Today** (Home & Coming up, Needs review, Imports to review) · **Records** (Medical, Dental, Insurance, Documents, Ask MED) · **Changes** (Undo last change, Activity) · **Share & save** (Print emergency card, Download backup, Import a file) · **App** (Refresh, Appearance auto/light/dark, Help) · **Log out**.
- **Refresh** reloads all data and, if a newer MED was deployed, reloads the page. Use it to see the other person's changes.
- **Log out** confirms, then fully signs out of Cloudflare Access.
- **Collapsible sections:** lists are grouped under headings; tap a heading to fold or open it. The device remembers which are open.

## Costs
- Every visit and procedure can hold what was **charged**, **plan allowed**, **insurance paid**, **Aaron paid** (and how), **balance**, billing status, CDT/CPT codes, teeth, claim # and an **itemised breakdown**.
- **Dental** and **Medical** tabs open with a cost summary; tap a visit for its 💵 Costs panel. Quotes are listed under **Treatment plans & quotes** and are not counted as charges.
- Filled 2026-10-07 from Gmail + Drive (receipts, bank alerts, statements, the one saved UHC EOB). Most UHC EOB emails carry no amounts, and quote/statement PDFs attached in Gmail could not be opened, so many visits still show no cost.

## Date rules
- Every list is **newest first** by the record's own date; records with no date go last, A–Z.
- Sort date by section: visits, procedures, immunizations and claims use their **date**; providers use **Last seen**; conditions use **Since**; medications use **Started / prescribed**; insurance uses **Effective**. Allergies and contacts sort A–Z.
- A **date range keeps the earliest date**, except **Last seen**, which keeps the **latest**. A US-style date like `4/12/2019` is converted to `2019-04-12`. This happens automatically on every save and import.

## Routines
None of its own. No scheduled task reads or writes MED. aaronf@ scans happen only on request.

## Common actions
- **See what an import changed:** menu → **Imports to review** → open the report → Keep / Undo each item.
- **Undo a mistake:** tap **Undo** on the toast, or menu → **Undo last change**.
- **Mark an appointment done:** Home → tap the Coming up item → **Mark done**.
- **Review imported records:** Home → **Start review**. One record at a time, newest first: **✓ Confirm**, **Edit**, **Skip** or **Delete**. Progress shows on Home, and the orange dot on a list row means "needs review".
- **Find something:** Medical / Dental / Insurance tab → search box, or tap **To review** to see only unconfirmed records.
- **Open a record:** tap any row → all details, attachments and source → **Confirm · Edit · Attach · Delete**. Phone numbers are tappable to call.
- **Add a record:** **+ Add** next to any section (Conditions, Medications, Dentists, Insurance plans…).
- **Add a document:** menu → **Documents** → pick the section → **Upload a file** (insurance cards front and back, EOBs, X-rays, lab results). Or open a record → **Attach**.
- **Print the emergency card:** Home → **Emergency summary** → **Print**, or menu → **Print emergency card**.
- **See who changed what:** menu → **Activity & undo history**.
- **Ask a question:** menu → **Ask MED**. It needs an Anthropic API key on the Worker, which hasn't been added yet.

## If something breaks
| Symptom | What it means | What to do |
|---|---|---|
| "MED is private to Nanci and Aaron." | Signed in with an email that isn't on the list | Sign out of Cloudflare Access (or use a private window) and sign in as nanci@ or aaronf@ |
| Login page keeps looping / old version showing | Stale Access or Google session | Open the Access logout URL, or use an incognito window and the email code |
| "That looks like it contains a Social Security number / a birth date" | The privacy guard refused the save | Remove the number or date and save again |
| "…must be YYYY, YYYY-MM or YYYY-MM-DD" | Date typed in an unrecognised format | Type e.g. `2024-04-11`, `2024-04` or `2024`; a range or `4/11/2024` is also accepted |
| Ask MED says it isn't switched on | No `ANTHROPIC_API_KEY` on the Worker | Ask Claude to add it (Nanci pastes the key into wrangler, never into chat) |
| A change doesn't show right away after Claude edits data directly | Cloudflare KV can take up to ~60 s to show a new write everywhere | Wait a minute, then menu → **Refresh** |
| Other person's change or a new version isn't showing | The page is showing old data | Menu → **Refresh** (it reloads the page too if MED was updated) |
| "This was changed again since; undo the newer change first" | The record changed after the entry you tried to undo | Undo the newer change first (Activity) |
| "This record changed since the import; review it before choosing" | A conflict option can't be applied over a newer edit | Open the record, decide by hand, then Keep the item |
| Coming up item has no countdown | No valid date (e.g. `2027-02` only) | Edit it and set a full date |
| Import script says `fetch failed` / `CLOUDFLARE_API_TOKEN is not set` | Missing credential or proxy settings in the cloud session | See `docs/DEPLOY-STATE.md`, apply-import |

## Fuller documentation
- Design spec: `docs/superpowers/specs/2026-10-05-med-records-design.md` (decisions, data model, API, UI)
- Build plan and post-launch changes: `docs/superpowers/plans/2026-10-05-med-records.md`
- Coming up / imports / undo / menu spec: `docs/superpowers/specs/2026-10-15-coming-up-imports-undo-menu-design.md`
- Deploy state and log: `docs/DEPLOY-STATE.md`
- Vault copy: **to add** as `4.7 — MED — Cheat Sheet.md` in the App Reference vault (People & running the day)
