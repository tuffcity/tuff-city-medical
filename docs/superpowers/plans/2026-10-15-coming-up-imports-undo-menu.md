# Coming up, visit summaries, import reports, undo and menu: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and apply the following to MED:
- a Coming up strip with glowing countdowns
- visit-summary cards
- item-by-item import reports
- undo for every write
- a full menu

Then apply the Aug 20 after-visit summary as the first import.

**Architecture:** The Worker gains:
- audit snapshots, plus an `undo` operation in `src/store.js`
- an import-report module `src/imports.js`
- routes in `worker.js`

Two pure browser modules (`public/lib/countdown.mjs`, `public/lib/vitals.mjs`) are tested in Node and bundled to the page as text by `src/entry.js`. `public/index.html` renders the new UI.

**Tech Stack:** Cloudflare Workers + KV, plain ES modules, `node:test` (no dependencies), wrangler 4 for deploy.

**Spec:** `docs/superpowers/specs/2026-10-15-coming-up-imports-undo-menu-design.md`

## Global Constraints

- Glow: **deep purple when more than 7 days away · silver within 7 days · strong pulse within 24 hours**. Under `prefers-reduced-motion`, a steady bright border replaces the pulse.
- Countdown target: date + time in **America/New_York**. A dated item with no time counts to **11:59 PM** that day. Display refreshes every **30 s**.
- Never copy birth dates or MRNs into records. The existing guard (`src/guard.js`) runs on every write, including import ops.
- No new dependencies. Every response keeps the existing security headers. Allow-list 403 applies to all new routes.
- Undo toast stays **8 s**. Deleted file bytes stay in trash for **30 days** (`expirationTtl: 2592000`).
- Log out goes to `/cdn-cgi/access/logout`.
- Out-of-range vitals: systolic ≥ 140 or diastolic ≥ 90 · BMI ≥ 30 · SpO₂ < 95 · pulse > 100.
- Deploy: `CLOUDFLARE_API_TOKEN=injected-by-proxy CLOUDFLARE_ACCOUNT_ID=56306730a3a3aebf779a2525878c4e59 npx wrangler deploy`. A push alone does not deploy.

## Review Focus

1. **Countdown crossing midnight or a DST change** (Nov 1 2026): days and hours must come from the New York wall-clock target, not a fixed offset. → Task 2 test `dst`.
2. **Undo after someone edited the same record again**: must refuse, not overwrite the newer edit. → Task 3 test `undo refuses stale`.
3. **Undoing an undo (redo)** and **undoing a delete**: must restore exactly, including `id` and `createdAt`. → Task 3 tests.
4. **Time strings typed by hand** ("3:15pm", "15:15", "3 PM", "noon", ""): parse or fall back to all-day; never crash. → Task 2 test `time parsing`.
5. **Import op that fails validation or the guard**: becomes a `skipped` item with a reason; the rest applies. → Task 4 test `bad op skipped`.

---

### Task 1: Schema additions

**Files:**
- Modify: `src/schema.js`
- Modify: `src/importer.js`: add `upcoming: ["date", "title"]` to `IDENTITY`
- Test: `test/schema.test.js`

**Interfaces:**
- Produces: `SECTIONS.upcoming`, with `label: "Coming up"`, `title: "title"`, `date: "date"`, and fields per spec §3.1. Enums:
  - type: `["appointment","deadline","to-do"]`
  - kind: `["medical","dental","vision","hearing","insurance","pharmacy"]`
  - status: `["unconfirmed","confirmed","needs action","done","cancelled"]`
  - `visitId` is text.
- Produces: visit fields `bp, weight, height, bmi, pulse, temp, spo2` (text), `issues, tests, instructions` (long), `followUp` (date).

- [ ] **Step 1: Write failing tests**: `test("upcoming section")` asserts:
  - `cleanRecord("upcoming",{type:"deadline",title:"Medicare plan change",date:"2026-12-07"}).error === undefined`
  - a missing title errors with `/Title is required/`
  - `type:"meeting"` errors with `/Type/`
  - `SECTIONS.upcoming.date === "date"`

  `test("visit vitals and clinical fields")` asserts that a visit with `bp:"150/70", bmi:"31.20", issues:"Example condition A\nExample condition B", followUp:"2027-02-20"` round-trips unchanged.
- [ ] **Step 2:** `npm test`. Expected: the 2 new tests FAIL.
- [ ] **Step 3:** Add the fields and section to `src/schema.js`. Place vitals/clinical fields after `procedures` and before the cost fields in `visits`.
- [ ] **Step 4:** `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit `feat: upcoming section and visit vitals/clinical fields`.

### Task 2: Countdown and vitals modules (pure)

**Files:**
- Create: `public/lib/countdown.mjs`, `public/lib/vitals.mjs`
- Test: `test/countdown.test.js`, `test/vitals.test.js`

**Interfaces:**
- Produces `countdown.mjs`:
  - `parseTime(str) -> {h, m} | null` accepts `3:15 PM`, `3:15pm`, `15:15`, `3 PM`, `noon`. Returns null for empty or garbage.
  - `targetMs(dateStr, timeStr) -> number | null` gives the UTC ms of that New York wall-clock time. No time means 23:59. Null if there is no or a partial date (`YYYY` or `YYYY-MM`).
  - `parts(ms, nowMs) -> {d, h, m, past}`
  - `tier(ms, nowMs) -> "far" | "near" | "imminent" | "past"`:
    - `far` when more than 7·24 h remain
    - `near` when ≤ 7 days
    - `imminent` when ≤ 24 h
    - `past` when < 0
  - `comingUp(records, nowMs) -> {dated: [...], todos: [...]}`:
    - upcoming records with status not done or cancelled, plus visits dated ≥ today that have no upcoming item with the same `visitId` or the same date and provider (as `{...visit, type:"appointment", fromVisit:true}`)
    - `dated` sorted by target, ascending
    - `todos` holds undated items
    - past items are excluded
- Produces `vitals.mjs`:
  - `num(v) -> number | null` (first number; for BP returns systolic)
  - `bpParts(v) -> {sys, dia} | null`
  - `delta(visits, visit, key) -> number | null`: change vs the most recent earlier-dated visit having that key
  - `flags(visit) -> Set<string>` of out-of-range keys, using the Global Constraints thresholds
  - `trend(visits) -> [{date, bp, weight, bmi}]` newest first, only visits with any of those

- [ ] **Step 1: Write failing tests** (exact boundaries):
  - `tier`:
    - exactly 7·24 h → `"near"`; 7·24 h + 60 000 ms → `"far"`
    - exactly 24 h → `"imminent"`; 24 h + 60 000 ms → `"near"`
    - −1 ms → `"past"`
  - `targetMs("2026-10-15","3:15 PM") === Date.UTC(2026,9,15,19,15)` (EDT)
  - `targetMs("2026-12-07","") === Date.UTC(2026,11,8,4,59)` (EST, 23:59)
  - `dst`: `parts(targetMs("2026-11-02","9:00 AM"), Date.UTC(2026,10,1,13,0))` gives `{d:1,h:1,m:0}` (EDT→EST, 25 h)
  - `time parsing`: `parseTime("noon")` is `{h:12,m:0}`; `parseTime("3pm")` is `{h:15,m:0}`; `parseTime("")` and `parseTime("soon")` are null
  - `comingUp`: done and cancelled items are excluded; a past dated item is excluded; an undated to-do goes to `todos`; a future visit with no matching upcoming item appears with `fromVisit`
  - vitals:
    - `flags({bp:"140/72"})` has `"bp"`; `flags({bp:"139/89"})` is empty; `flags({bp:"120/90"})` has `"bp"`
    - `flags({bmi:"30"})` has `"bmi"` and `flags({bmi:"29.99"})` doesn't
    - `flags({spo2:"95%"})` is empty and `flags({spo2:"94%"})` has it
    - `flags({pulse:"100"})` is empty and `flags({pulse:"101"})` has it
  - `delta` of weight `"200 lb"` vs an earlier `"194 lb"` is `6`
- [ ] **Step 2:** `node --test test/countdown.test.js test/vitals.test.js`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement. For NY time, use `Intl.DateTimeFormat("en-US",{timeZone:"America/New_York", hourCycle:"h23", …})` to find the offset for that date; iterate once to correct at the DST boundary.
- [ ] **Step 4:** Run the tests again. Expected: PASS.
- [ ] **Step 5:** Update `package.json` test glob to stay `test/*.test.js`. Commit `feat: countdown and vitals modules`.

### Task 3: Undo in the store

**Files:**
- Modify: `src/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Changes `audit(action, by, section, id, label, before, after)`. The entry stores `before` and `after` (the record JSON or file meta, or null) plus `key`.
- Produces `store.undo(logKey, by) -> {ok:true, entry} | {ok:false, error}`:
  - `before === null`: deletes the record
  - otherwise: writes `before`
  - files: create is undone by moving to trash; delete is undone by restoring from `trash:file:<id>`
  - writes an `undo` entry whose `before`/`after` are swapped, so it is undoable
  - refuses when the current stored value's `updatedAt` (or file existence) differs from `after`, with error `"This was changed again since; undo the newer change first."`
- Produces `store.getAudit(logKey)`.
- `deleteFile` now writes bytes to `trash:file:<id>` with `expirationTtl: 2592000` before deleting.

- [ ] **Step 1: Write failing tests:**
  - `undo create`: the record is gone afterwards
  - `undo update`: fields are back
  - `undo confirm`: `reviewed` is false again
  - `undo delete`: restores the same `id` and `createdAt`
  - `redo`: undoing the undo entry reapplies the change
  - `undo refuses stale`: update A, update B, undo A gives `ok:false` and the record still has B's value
  - `undo file delete`: bytes come back from trash
  - `listAudit` entries carry `key`
- [ ] **Step 2:** `node --test test/store.test.js`. Expected: new tests FAIL.
- [ ] **Step 3:** Implement. `kvFake.put` must accept `{expirationTtl}`; it already ignores unknown options.
- [ ] **Step 4:** `npm test`. Expected: all pass, existing store tests included.
- [ ] **Step 5:** Commit `feat: undo for every write (audit snapshots)`.

### Task 4: Import reports

**Files:**
- Create: `src/imports.js`
- Test: `test/imports.test.js`

**Interfaces:**
- Consumes: `createStore` (Task 3: `createRecord`, `updateRecord`, `undo`), `cleanRecord`, `findSensitive`.
- Produces `applyImport(store, kv, {title, source, ops}, by) -> report`. Op shapes:
  - `{op:"create", section, fields, group:"added"|"upcoming", label}`
  - `{op:"update", section, id, fields, label}` (group "updated")
  - `{op:"conflict", label, detail, choices:[{id, label, patch?:{section,id,fields}}]}`
  - `{op:"skip", label, reason}`

  Each applied op records `logKey`. The report is stored at `imp:<id>`. Item shape follows spec §3.3.
- Produces:
  - `listImports(kv) -> [{id,title,createdAt,open,settled,total}]`
  - `getImport(kv,id)`
  - `settleItem(store, kv, id, n, {action, choice}, by) -> report`: `keep` sets decision kept; `undo` calls `store.undo(logKey)`; `choose` applies `patch` via `updateRecord` and stores the choice id
  - A report's `open` is true while any non-skip item has `decision === null`.

- [ ] **Step 1: Write failing tests:**
  - create + update + conflict + skip produce 4 items with correct groups
  - `bad op skipped`: an op whose fields hold `"SSN 123-45-6789"`, or that is missing a required field, becomes `group:"skipped"` with a reason, and other ops still apply
  - `keep` settles
  - `undo` reverts the record and sets `undone`
  - `choose` applies the patch
  - the report closes when all are settled
- [ ] **Step 2:** `node --test test/imports.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: import reports`.

### Task 5: Routes and bundling

**Files:**
- Modify: `worker.js`, `src/entry.js`, `wrangler.toml` (Text rule adds `public/lib/*.mjs`), `scripts/dev-server.mjs` (serve `.mjs` as `text/javascript`)
- Test: `test/worker.test.js`

**Interfaces:**
- `POST /api/undo` with body `{key}` → `store.undo`. Returns 200 `{entry}`, or 409 `{error}`.
- `GET /api/imports`, `GET /api/imports/:id`, `POST /api/imports` (`{title, source, ops}`), `POST /api/imports/:id/items/:n`.
- `GET /api/version` returns `{version}`, a constant string set at build (`globalThis.MED_VERSION ?? "dev"`; entry.js sets it from a `const VERSION = "<git short sha>"` replaced at deploy via `--define MED_VERSION:'"<sha>"'`).
- `src/entry.js` serves `/lib/countdown.mjs` and `/lib/vitals.mjs` as `text/javascript`.

- [ ] **Step 1: Write failing tests:**
  - undo round trip via HTTP; stale undo gives 409
  - imports create → list → settle
  - all new routes return 403 for `admin@tuffcity.com`
  - security headers are present on `/api/version`
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement routes; add the wrangler rule above the existing Text rule.
- [ ] **Step 4:** `npm test` plus `npx wrangler deploy --dry-run --outdir <scratch>`. Expected: tests pass; the dry run lists the bindings and succeeds.
- [ ] **Step 5:** Commit `feat: undo, imports and version routes; bundle browser modules`.

### Task 6: UI: Coming up, visit card, vitals trend, imports, undo toast, menu

**Files:**
- Modify: `public/index.html` (keep it one page; load `/lib/countdown.mjs` and `/lib/vitals.mjs` with `<script type="module">`, converting the inline script to a module)
- Test: `scripts/smoke-ui.mjs` (new, Playwright from `/opt/node22/lib/node_modules/playwright`), run against `scripts/dev-server.mjs`

**Interfaces:**
- Consumes all routes in Task 5 and the module exports in Task 2.
- CSS classes: `.cu-card.far` (deep purple glow), `.cu-card.near` (silver glow), `.cu-card.imminent` (strong pulse, `@keyframes`), plus `@media (prefers-reduced-motion: reduce)` override.

- [ ] **Step 1: Write the smoke script.** It seeds through the dev server's API, then asserts the following.
  - **Coming up:**
    - On Home, `.cu-card` order is by target.
    - Classes match tiers, using `page.clock.setFixedTime` at three instants.
    - Done and cancelled items are absent.
    - Undated to-dos are listed under the cards.
  - **Visit card:**
    - Tapping the Aug 20 sample visit shows the vitals tiles, with `150/70` flagged.
    - The weight tile shows `↑6`.
    - Issue chips render, and "Sample finding B" carries `New` when it isn't a condition.
  - **Medical tab:** has `.vitals-trend`.
  - **Undo:**
    - Confirming a record shows a toast with Undo; tapping it restores Unreviewed.
    - The Activity entry has an Undo link.
  - **Menu:**
    - ☰ opens a drawer containing Refresh, "Undo last change", Imports (count), Log out with `href` or target `/cdn-cgi/access/logout`, and Appearance.
    - Appearance → dark sets `data-theme="dark"`.
  - **Import report:** settle each item via Keep, Undo and Choose; the counter reaches "n of n settled" and the Home banner disappears.
  - **Page health:** no `pageerror`; `scrollWidth <= innerWidth` at 390 px and 1280 px.
- [ ] **Step 2:** Run `node scripts/smoke-ui.mjs`. Expected: FAIL (UI absent).
- [ ] **Step 3: Implement the UI:**
  - Coming up strip at the top of Home, with countdown refresh via `setInterval(…, 30000)` that updates text and classes only
  - visit card when any vitals or clinical field exists
  - vitals trend table atop Medical
  - Imports list and report pages (menu + Home banner)
  - undo toast (8 s), Undo links in Activity, "Undo last change" with `confirm()` naming the entry
  - menu drawer (spec §3.5)
  - More tab opens the same menu
  - Refresh reloads data, then compares `/api/version` with the loaded version and `location.reload()`s if different
- [ ] **Step 4:** `node scripts/smoke-ui.mjs` and `npm test`. Expected: PASS, with no page errors.
- [ ] **Step 5:** Commit `feat: Coming up, visit cards, import reports, undo and menu UI`.

### Task 7: Deploy, apply the AVS import and the scan items, update docs

**Files:**
- Create: `scripts/apply-import.mjs` (posts a `{title, source, ops}` JSON to KV through the store and imports modules over the Cloudflare KV API; mirrors the earlier merge script, but uses `applyImport` so a report is created)
- Modify: `README.md`, `docs/CHEAT-SHEET.md`, `docs/DEPLOY-STATE.md`, spec status line

- [ ] **Step 1:** Deploy (Global Constraints command with `--define MED_VERSION:'"<sha>"'`). Expected: `Deployed tuff-city-medical`.
- [ ] **Step 2:** Upload the AVS PDF as a file attached to visit 2026-08-19, and record `fileId`.
- [ ] **Step 3:** Apply the AVS import with the ops from spec §7 (structural summary: Updated: the visit (date corrected to the AVS date, vitals, issues, tests, instructions) · Added: one new condition · Conflict: AVS medication list vs a medication listed as current · Upcoming: the follow-up · Skipped: birth date/MRN, missing pages). Exact values live in the import payloads in the session scratchpad and are never committed.
- [ ] **Step 4:** Apply the email-scan items as a second import, titled "email scan 2026-10-15", with the upcoming appointments, deadline and to-dos found in the scan (specific items are in the scratchpad payload, not committed).
- [ ] **Step 5:** Verify by re-reading KV:
  - The visit is dated 2026-08-20 with vitals.
  - 2 reports exist, open.
  - Upcoming items exist.

  Then run the smoke script against the dev server once more. Update the docs (spec §§ shipped, cheat-sheet Coming up/Undo/Menu sections, deploy log). Commit and push.
