# MED — Aaron's medical, dental & insurance records

**Date:** 2026-10-05 · **App:** med.tuffcityrecords.com (`tuff-city-medical` Worker) · **Status:** live since 2026-10-06 · decisions approved in chat by Nanci (2026-10-05 → 10-07)

## 1. Goal

One private place that holds Aaron Fuchs's complete medical history, dental history and insurance, reachable from the **MED** chip on the GM Command Center (gm.tuffcityrecords.com).

**Success looks like:**
- Nanci or Aaron can answer "who is his cardiologist / what's his Medicare ID / when was his last cleaning / what is he allergic to" in under 10 seconds.
- A one-page **Emergency summary** (allergies, active meds, conditions, emergency contacts, insurance) prints cleanly.
- Records found in Gmail/Drive land in the app as **unreviewed** until a person confirms them.
- No one outside Nanci and Aaron can open it, and no medical data is ever committed to git.

## 2. Decisions (Nanci, 2026-10-05)

| # | Decision | Choice |
|---|---|---|
| D1 | Access | **Nanci + Aaron only.** Own subdomain behind its own Cloudflare Access policy (not the team-wide one), plus a Worker-side email allow-list |
| D2 | Code location | **New repo `tuffcity/tuff-city-medical`**, own Worker. GM dashboard only gets the chip link |
| D3 | Intake | **All three:** manual entry + uploads, a one-time Gmail/Drive search imported for review, and an in-app assistant |
| D4 | Scope v1 | **Medical history, Dental history, Insurance, Emergency summary** |

## 3. Design decisions made while designing (flag if wrong)

| # | Decision | Why |
|---|---|---|
| E1 | Records and files live in **Workers KV** (`RECORDS`), never in the repo | Medical data must not enter git history. One KV namespace keeps deploy to a single binding (no R2 bucket to provision) |
| E2 | Uploads capped at **10 MB** per file, stored as KV values | Insurance cards, EOBs, X-ray PDFs fit; KV's limit is 25 MiB |
| E3 | **SSNs are refused** everywhere (records, notes, assistant). Birth dates are refused too, matching the Office Desk house rule | Medicare uses the MBI, not the SSN; forms that need DOB/SSN are filled by a person |
| E4 | Assistant answers **from stored records only** — no web search | A web-search query could carry medical details to a third-party search provider |
| E5 | Assistant conversations are **not stored** | Nothing to leak later; the records themselves are the source of truth |
| E6 | **No service worker / offline cache**; every response is `Cache-Control: no-store` | Medical data must not linger on a shared or lost device |
| E7 | Every create / update / delete / import writes an **audit entry** (who, when, what) | Medical records need a change trail |
| E8 | Imported records carry `reviewed:false` and a visible **Unreviewed** badge until confirmed | Gmail-derived data can be wrong or belong to someone else |
| E9 | **Date ranges keep the earliest date** (Nanci, 2026-10-06). Any date field given a range or several dates (`2019-2021`, `2019-01-01 to 2024-12-31`, `3/14/2024 - 5/1/2024`) stores the earliest — **except "Last seen", which stores the latest** (Nanci, 2026-10-06); a single `M/D/YYYY` is converted to `YYYY-MM-DD`. Applied server-side on every save and import (`earliestDate` in `src/schema.js`) | One consistent rule for sorting and history |
| E10 | **Every list sorts by the record's own date, newest first**; undated records last, A–Z (Nanci, 2026-10-06). Sort date per section: visits/procedures/immunizations/claims → date · providers → last seen · conditions → since · medications → started/prescribed · insurance → effective. Allergies and contacts have no date and sort A–Z | History reads top-down, most recent first |
| E11 | **Phone-first UI** (Nanci, 2026-10-07): bottom tab bar, tap-to-open record sheets, search + To-review filter on every list, one-at-a-time review mode | Nanci and Aaron use MED mostly on phones |

## 4. Architecture

```
GM dashboard ──MED chip──▶ med.tuffcityrecords.com
                              │  Cloudflare Access (Nanci + Aaron policy)
                              ▼
                        Worker tuff-city-medical
                        ├─ auth allow-list (ALLOWED_EMAILS)
                        ├─ /api/records  CRUD  ─┐
                        ├─ /api/files    upload/download ─┤── KV RECORDS
                        ├─ /api/import   findings JSON ───┤
                        ├─ /api/audit, /api/export ───────┘
                        ├─ /api/ask  ──▶ Claude (records as context, no tools)
                        └─ page (public/, bundled into the script by src/entry.js)
```

Deploy = one script upload: `src/entry.js` imports `worker.js` and serves `public/index.html`, `icon.svg` and `manifest.json.txt` as bundled Text modules (Workers Assets uploads can't run behind the session's injected API credential).

### 4.1 Units

| Unit | File | Purpose | Pure? |
|---|---|---|---|
| Schema | `src/schema.js` | Sections, fields, validation/normalisation of a record | yes |
| Guard | `src/guard.js` | SSN / birth-date detection over any value tree | yes |
| Auth | `src/auth.js` | Access email extraction + allow-list check | yes |
| Store | `src/store.js` | KV CRUD for records, files and audit log | KV interface |
| Importer | `src/importer.js` | Maps the Gmail/Drive findings JSON to records, de-duplicates | yes |
| Assistant | `src/assistant.js` | Builds the records context + system prompt; calls Claude | fetch |
| HTTP | `worker.js` | Routing, headers, wiring (tested app) | — |
| Entry | `src/entry.js` | Production entry: serves the bundled page, wraps `worker.js` | — |
| UI | `public/index.html` | Phone-first single page — see §4.4 | — |

### 4.2 Sections (data model)

Each record: `{ id, section, ...fields, reviewed, source, createdAt, createdBy, updatedAt, updatedBy }` stored at `rec:<section>:<id>` with list metadata.

| Area tab | Section | Key fields | Sorted by |
|---|---|---|---|
| Medical / Dental (filtered by `kind`) | `providers` | name*, kind (medical/dental/vision/pharmacy/lab/hospital), specialty, phone, address, portal, lastSeen, notes | Last seen (ranges keep the **latest**) |
| Medical / Dental | `visits` | date*, kind, provider, reason, what was done, **costs** (charged, plan allowed, insurance paid, Aaron paid, paid how, balance, billing status, CDT/CPT codes, teeth, claim #, itemised breakdown), notes | Date |
| Medical / Dental | `procedures` | date, name*, kind, provider, **costs** (as visits), notes | Date |
| Medical / Dental | `plans` (Treatment plans & quotes, added 2026-10-07) | date*, provider*, kind, proposed work & prices, total quoted, status (done/partly done/not done/unknown), notes | Date |
| Medical | `conditions` | name*, since, status (active/resolved), notes | Since |
| Medical | `medications` | name*, since (started / prescribed, added 2026-10-06), dose, prescriber, pharmacy, status (active/past), notes | Started / prescribed |
| Medical | `allergies` | name*, reaction, severity | Name A–Z |
| Medical | `immunizations` | name*, date, notes | Date |
| Insurance | `insurance` | type* (medical/dental/vision/medicare/supplement/partD/other), carrier*, plan, memberId, groupNumber, phone, effective, renewal, premium, notes | Effective |
| Insurance | `claims` | date, carrier, provider, amount, status, notes | Date |
| Emergency | `contacts` | name*, relation, phone, email | Name A–Z |
| Documents | `files` (metadata) | name, type, size, section/record link, uploadedBy | Newest upload |

`*` = required. Dates are `YYYY-MM-DD` (partial `YYYY` / `YYYY-MM` allowed for history). Date ranges keep the earliest date, except Last seen (latest) — see E9.

### 4.3 API

| Method & path | Does |
|---|---|
| `GET /api/me` | `{ email, assistant }` |
| `GET /api/schema` | Sections and fields (the page builds its forms from this) |
| `GET /api/records` | All records (all sections) |
| `POST /api/records` | Create `{ section, ...fields }` |
| `PUT /api/records/:section/:id` | Update fields (incl. `reviewed:true`) |
| `DELETE /api/records/:section/:id` | Delete |
| `POST /api/files` (multipart) | Upload ≤10 MB, optional `section`/`recordId` link |
| `GET /api/files/:id` | Download (`Content-Disposition: inline`) |
| `DELETE /api/files/:id` | Delete |
| `POST /api/import` | Findings JSON → records (`reviewed:false`), returns counts added/skipped |
| `GET /api/audit` | Latest 200 audit entries |
| `GET /api/export` | Full JSON backup (records + file list, no file bytes) |
| `POST /api/ask` | `{ question, history[] }` → `{ answer }` |

Non-allow-listed emails get `403` on every path, page included (the Worker runs first for all requests).

### 4.4 UI (phone-first, 2026-10-07)

| Area | Behaviour |
|---|---|
| Navigation | Bottom tab bar on phones (Home · Medical · Dental · Insurance · More); the same tabs sit in the top bar at ≥900 px |
| Home | To-review card (count, progress bar, **Start review**), six tiles (allergies, current meds, conditions, insurance, doctors, contacts), collapsible **Emergency summary** (prints as one page), emergency contacts list |
| Costs | Dental and Medical tabs open with a cost summary (charged · insurance paid · Aaron paid · outstanding, quotes excluded; a procedure's costs count only when no visit that day has any). Record sheets show a 💵 Costs panel with the itemised breakdown |
| Lists | Grouped by section; each row shows the stacked date, title, one detail line and an orange dot if unreviewed; 6 rows then **Show all**; search box + **All / To review** chips on every list |
| Record sheet | Tap a row → sheet with all fields, attachments and source; **Confirm · Edit · Attach · Delete**; phone numbers are `tel:` links |
| Review mode | One unreviewed record at a time, newest first, with progress: **Confirm · Edit · Skip · Delete** |
| More | Ask MED, Documents (upload/file under a section), Activity (audit log), Print emergency card, Download backup, Import findings |
| Feedback | Toasts for saves, confirms, uploads and errors |

## 5. Privacy & security

- Access policy "MED — Nanci + Aaron" (`nanci@tuffcity.com`, `aaronf@tuffcity.com`) on `med.tuffcityrecords.com`. `workers_dev=false`, `preview_urls=false`.
- Worker re-checks the email against `ALLOWED_EMAILS` (defence in depth if the Access app is ever mis-set).
- Guard runs server-side on every write and every assistant question; the page shows the same message the server returns.
- Headers on every response: `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- `.gitignore` blocks `*.findings.json`, `data/`, `.dev.vars`.

## 6. Testing

`node --test` (no dependencies; 39 tests as of 2026-10-07). Pure units are tested directly; `store.js` and `worker.js` are tested against an in-memory KV fake and a stubbed Claude `fetch`. Verification before completion: full test run + a Chromium smoke test (phone 390 px and desktop 1280 px) via `scripts/dev-server.mjs`: import → review mode → confirm → search → record sheet → edit → activity, no page errors, no horizontal scroll.

## 7. Out of scope (v1)

Automatic Gmail sync, OCR of uploaded cards, appointment reminders, sharing with providers. Candidates for v2.
