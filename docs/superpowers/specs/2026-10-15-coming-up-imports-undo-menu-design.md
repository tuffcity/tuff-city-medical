# MED: Coming up, visit summaries, import reports, undo and menu

**Date:** 2026-10-15 · **App:** med.tuffcityrecords.com · **Status:** design approved in chat by Nanci (parts 1–4), spec awaiting review

## 1. Goal

When MED opens, Aaron and Nanci see what's coming up for Aaron's health, each item counting down. Imported documents (starting with the 2026-08-20 NYU After Visit Summary) appear as clear visit cards, and every import produces a report that can be reviewed item by item. Every edit can be undone. A thought-out menu gives Refresh and Log out.

**Success looks like:**
- Opening MED shows the next appointment or deadline first, with a live countdown and the right glow.
- The Aug 20 visit reads as a visit card: vitals with change vs the last visit, issues as chips, tests done, the doctor's instructions.
- The import report for that PDF lists every addition, change and conflict, and each can be kept, undone or decided.
- Any add, change, confirm or delete can be undone, from the toast or from Activity.
- Refresh and Log out are one tap away from the menu.

## 2. Decisions (Nanci, 2026-10-15)

| # | Decision | Choice |
|---|---|---|
| D1 | Where Coming up comes from | **Approach 1:** a new list in MED, filled from aaronf@ scans on request and editable by hand; future-dated visits appear automatically |
| D2 | Countdown glow | **Deep purple when more than 7 days away · silver within 7 days · strong pulse within 24 hours** |
| D3 | Visit summaries | Visit card with vitals (and change vs previous visit), issues addressed, tests done, instructions, costs, original document |
| D4 | Import report | One report per import: Source · Added · Updated · Conflicts to settle · Not imported · Coming up created; settled item by item |
| D5 | Undo | Every add, change, confirm, delete and import item can be undone |
| D6 | Menu | Today · Records · Changes · Share & save · App · Log out (part 4 table) |

## 3. Design

### 3.1 Coming up (Home, first thing on screen)

**New section `upcoming`** (label "Coming up"):

| Field | Type | Notes |
|---|---|---|
| type* | enum: appointment, deadline, to-do | |
| title* | text | e.g. "Hearing-aid visit" |
| date | date | required for appointment and deadline; optional for to-do |
| time | text | e.g. "3:15 PM"; empty = all day |
| provider, location, phone | text | phone renders as a `tel:` link |
| kind | enum: medical, dental, vision, hearing, insurance, pharmacy | |
| details, actionNeeded | long text | |
| status | enum: unconfirmed, confirmed, needs action, done, cancelled | |
| visitId | text | set when created from a visit's follow-up instruction |

Plus the usual `reviewed`, `source` and audit fields.

**Shown on Home, in this order:**
1. **Dated items**, soonest first. A card for each shows title, when, provider and place, action needed, and a live countdown (days · hours · minutes, updating every 30 s).
2. **To-dos with no date**, listed below.
3. **Future-dated visits** that have no matching upcoming item are shown as appointments too (read-only; tap opens the visit).

**Glow** (from the countdown target: date + time in America/New_York; a deadline with no time counts to 11:59 PM):

| Time left | Look |
|---|---|
| more than 7 days | deep purple glow |
| 7 days or less | silver glow |
| 24 hours or less | strong pulse (respects `prefers-reduced-motion`: steady bright border instead of pulsing) |
| passed | leaves Coming up; visible under "Past" in the Coming up list |

Items with status done or cancelled leave the Home strip immediately.

**Tap an item** to see details plus **Mark done · Edit · Call**. Mark done and edits are undoable.

**Seeded on build** (from the 2026-10-15 aaronf@ scan and the Aug 20 AVS), all Unreviewed:
- Hearing-aid visit, Audio Help, 2026-10-15 3:15 PM (unconfirmed)
- Medicare plan-change deadline, 2026-12-07
- Annual follow-up with Dr. Scheiner, around 2027-02-20
- To-dos: rebook Union Square Dental cleaning; NYU bill $15.82; review UHC 2027 Annual Notice of Change

### 3.2 Visit summaries (visit card)

**New visit fields:**

| Group | Fields |
|---|---|
| Vitals | bp, weight, height, bmi, pulse, temp, spo2 (text, e.g. "152/72", "218 lb") |
| Clinical | issues (one per line), tests (one per line), instructions (long text), followUp (date) |

**Card layout** (replaces the plain field list when a visit has any vitals or clinical field):

| Section | Content |
|---|---|
| Header | date, doctor, place, reason, 📎 attached documents |
| Vitals tiles | each value with change vs the most recent earlier visit that has that vital (↑/↓ and amount). Out-of-range highlight: BP systolic ≥140 or diastolic ≥90 · BMI ≥30 · SpO₂ <95% · pulse >100 |
| Issues addressed | chips; a chip matching a condition (case-insensitive word match) opens it; others are marked **New** |
| Tests done | checklist |
| Instructions | text; a follow-up date links to its Coming up item |
| Costs | existing costs panel |
| Rest | remaining fields as today |

**Vitals trend** strip at the top of the Medical tab: BP, weight and BMI across the visits that have them, newest first, as a compact table.

### 3.3 Import reports

**Store:** `imp:<id>` → `{ id, title, createdAt, createdBy, source: { fileId, name, note }, items: [...] }`.

**Item:** `{ n, group, label, section, recordId, logId, before, after, choices, decision }`
- `group`: added · updated · conflict · skipped · upcoming
- `decision`: null (open) · kept · undone · the chosen choice's id

**Settling:**
- *Keep* sets decision = kept.
- *Undo* runs the undo for `logId` (§3.4) and sets decision = undone.
- *Conflict choice* applies the choice's patch (a normal, undoable update) and records the choice.
- `skipped` items are informational and count as settled.
- A report is **open** until every item is settled.

**UI:**
- Menu → **Imports** lists the reports, open ones first, with "n of m settled".
- A report page shows the sections in the order above.
- Home shows a banner while any report is open.
- Each report has Print.

**API:**
- `GET /api/imports`, `GET /api/imports/:id`, `POST /api/imports/:id/items/:n` (`{ action: "keep" | "undo" | "choose", choice }`).
- `POST /api/imports` takes `{ title, source, ops: [...] }` (creates, updates and upcoming items applied server-side, each audited) and returns the report.

**Not imported:** the birth date and medical record number printed on documents are never copied into records (existing privacy rule). The original PDF is stored as a document attached to the visit.

### 3.4 Undo

**Every write keeps a snapshot.** Each audit entry stores `before` (the record or file metadata before the write, or null) and `after`.

**Undo** (`POST /api/undo/:logKey`):
- Restores `before`: re-creates a deleted record, deletes a created one, or rolls back an update or confirm.
- Writes a new audit entry with action `undo`, which can itself be undone (redo).

**Refusals:**
- If the record has changed since that entry, undo is refused with "This was changed again since; undo the newer change first", so nothing is silently lost.

**Deleted files:** go to `trash:file:<id>` for 30 days (KV TTL) so a file delete can be undone in that window.

**UI:**
- After every write, a toast shows **Undo** for 8 seconds.
- Activity shows an Undo link on each undoable entry.
- Menu → **Undo last change** names what it will undo, e.g. "Undo: confirmed 'X-rays and cleaning'", and asks before acting.

### 3.5 Menu

A **☰ button** sits in the top bar on every screen. It is a side drawer on phones and a drop-down panel on wide screens.

| Group | Items |
|---|---|
| Header | MED · signed in as … · "Updated n min ago" |
| Today | Home & Coming up · Needs review (count) · Imports to review (count) |
| Records | Medical · Dental · Insurance · Documents · Ask MED |
| Changes | Undo last change · Activity & undo history |
| Share & save | Print emergency card · Download backup · Import a file |
| App | Refresh · Appearance (auto / light / dark, remembered on the device) · Help (opens the cheat sheet) |
| Bottom | Log out (red; confirms; goes to `/cdn-cgi/access/logout`, the full Cloudflare Access sign-out) |

- **Refresh** reloads all data and, if a newer version of MED has been deployed, reloads the page.
- The bottom tab bar stays.
- The More tab becomes a shortcut to the same menu content.

## 4. Units

| Unit | File | Purpose | Tested |
|---|---|---|---|
| Schema | `src/schema.js` | + `upcoming` section, visit vitals/clinical fields | unit |
| Countdown | `src/countdown.js` | target time (NY tz), parts (d/h/m), glow tier, past/visible rules; bundled to the page as `/countdown.js` | unit |
| Vitals | `src/vitals.js` | parse values, change vs previous, out-of-range flags; bundled as `/vitals.js` | unit |
| Store | `src/store.js` | snapshots in audit entries, `undo(logKey)`, trash for files, import reports | KV fake |
| Imports | `src/imports.js` | apply ops → report, settle items | KV fake |
| HTTP | `worker.js` | `/api/undo/:key`, `/api/imports*`, `/api/version` | worker tests |
| Entry | `src/entry.js` | serve `/countdown.js`, `/vitals.js` | smoke |
| UI | `public/index.html` | Coming up strip, visit card, vitals trend, import report pages, undo toast, menu | Chromium smoke (phone + desktop) |

## 5. Error handling

- **Countdown with no date or bad time:** no countdown; the item shows as a to-do.
- **Undo conflict:** refused with a clear message; nothing changes.
- **Import op failing validation or the privacy guard:** that op becomes a `skipped` item with the reason; the rest of the import still applies.
- **Refresh failure:** a toast says "Couldn't refresh — check your connection", and the current data stays on screen.
- **Logout:** always navigates, even if offline.

## 6. Testing

- Test-first for every unit in §4.
- Worker tests cover undo of each action type, the undo-conflict refusal, import create/settle, and the 403 allow-list on new routes.
- Chromium smoke (390 px and 1280 px):
  - Coming up order and glow classes, at fixed clock times for each tier
  - visit card renders the Aug 20 sample
  - import report keep/undo/choose
  - undo toast
  - menu Refresh and Log out targets
  - no page errors and no horizontal scroll

## 7. Applying the Aug 20 AVS (first import, after build)

| Group | Items |
|---|---|
| **Updated** | Visit 2026-08-19 "Visit; labs" → date **2026-08-20** (AVS is authoritative), reason "Annual exam", vitals, 7 issues, 10 tests, instructions "Return in about 6 months (around 2027-02-20)", PDF attached. Condition "BMI above normal" → note BMI 30.35 on 2026-08-20 (class 1 obesity per AVS) |
| **Added** | Condition "Unequal leg length" (since 2026-08-20) |
| **Conflict** | AVS medication list: "You have not been prescribed any medications" vs Trazodone listed as current → choices: *Mark trazodone past* · *Keep as current* |
| **Upcoming** | Annual follow-up ~2027-02-20 |
| **Skipped** | Birth date and MRN (privacy rule) · pages 2 and 4 not in the scan |

## 8. Out of scope

Automatic Gmail sync (scans stay on request), push notifications, calendar export.
