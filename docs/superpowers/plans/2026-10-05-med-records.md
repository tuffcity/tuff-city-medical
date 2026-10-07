# MED records — implementation plan

Spec: `docs/superpowers/specs/2026-10-05-med-records-design.md`. Method: test-first per unit (red → green → commit), then wire, then verify.

## Task 1 — Scaffold
- `package.json` (`"type":"module"`, `npm test` = `node --test`), `wrangler.toml`, `.gitignore`, `README.md`.
- Verify: `npm test` runs (0 tests).

## Task 2 — `src/guard.js` (pure)
Tests first: SSN dashed refused; bare 9 digits refused only with SSN wording; phone numbers, member IDs (alnum), Medicare MBI, dates of visits all allowed; DOB keyword + date refused; walks nested objects/arrays.

## Task 3 — `src/auth.js` (pure)
Tests: header email wins; JWT payload fallback; lower-cases; allow-list parse (comma/space), unknown → not allowed; empty list → nobody allowed.

## Task 4 — `src/schema.js` (pure)
Tests: unknown section rejected; required fields enforced; unknown fields dropped; strings trimmed and capped; enums validated; dates accept `YYYY`, `YYYY-MM`, `YYYY-MM-DD`, reject others; system fields (`id`, `createdBy`…) cannot be set by the client.

## Task 5 — `src/store.js` (KV fake)
Tests: create → list → update → delete round trip; audit entries written for each; files put/get/delete with 10 MB cap; list pagination across cursors.

## Task 6 — `src/importer.js` (pure)
Tests: findings shape → records per section with `reviewed:false` + `source`; `kind` defaulting; de-dupe against existing records and within the batch (normalised name/date key); guard-failing items skipped and counted; empty/garbage input → zero, no throw.

## Task 7 — `src/assistant.js`
Tests (stubbed fetch): context contains records grouped by section, excludes file bytes; system prompt forbids inventing; question guarded; API errors mapped to plain words.

## Task 8 — `worker.js`
Tests (KV fake + stubbed env): 403 for non-allow-listed; CRUD routes; import route; security headers on API and asset responses; 405/404 paths.

## Task 9 — `public/index.html`
Tabs: Summary · Medical · Dental · Insurance · Documents · Activity. Generic list + form driven by a schema mirror served from `/api/schema`. Unreviewed badge + Confirm button. Upload, Import findings, Export. Ask panel. Printable Emergency summary (`@media print`).

## Task 10 — GM dashboard
`MED` chip `<span class="soon">` → `<a class="app a-med" href="https://med.tuffcityrecords.com">` in launcher + FAB grid; assistant app list updated. Branch, not `main` (main auto-deploys; chip goes live after MED is deployed).

## Task 11 — Verify & finish
Full `npm test`; local smoke (Worker logic via node harness + static UI in Chromium); `docs/DEPLOY-STATE.md` with the exact wrangler + Access steps; push.

## Post-launch changes (all shipped, test-first)
- **2026-10-06 Deploy:** KV + Access app (created before deploy) + Worker; page bundled via `src/entry.js`.
- **2026-10-06 Import:** 130 Gmail/Drive records written as Unreviewed.
- **2026-10-06 Sorting:** every list newest first by the record's own date; date shown on each row.
- **2026-10-06 Date rule:** `earliestDate()` — ranges keep the earliest; Last seen keeps the latest; `M/D/YYYY` converted. Tests in `test/schema.test.js`, `test/importer.test.js`.
- **2026-10-06 Medications:** `since` (Started / prescribed) field, used for sorting.
- **2026-10-07 Redesign:** phone-first UI (spec §4.4); Chromium smoke test phone + desktop.
