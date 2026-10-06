# MED — Aaron's medical, dental & insurance records

**Date:** 2026-10-05 · **App:** med.tuffcityrecords.com (`tuff-city-medical` Worker) · **Status:** decisions approved in chat by Nanci, 2026-10-05

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
| E9 | **Date ranges keep the earliest date** (Nanci, 2026-10-06). Any date field given a range or several dates (`2019-2021`, `2019-01-01 to 2024-12-31`, `3/14/2024 - 5/1/2024`) stores the earliest; a single `M/D/YYYY` is converted to `YYYY-MM-DD`. Applied server-side on every save and import (`earliestDate` in `src/schema.js`) | One consistent rule for sorting and history |
| E8 | Imported records carry `reviewed:false` and a visible **Unreviewed** badge until confirmed | Gmail-derived data can be wrong or belong to someone else |

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
                        └─ static UI (public/)
```

### 4.1 Units

| Unit | File | Purpose | Pure? |
|---|---|---|---|
| Schema | `src/schema.js` | Sections, fields, validation/normalisation of a record | yes |
| Guard | `src/guard.js` | SSN / birth-date detection over any value tree | yes |
| Auth | `src/auth.js` | Access email extraction + allow-list check | yes |
| Store | `src/store.js` | KV CRUD for records, files and audit log | KV interface |
| Importer | `src/importer.js` | Maps the Gmail/Drive findings JSON to records, de-duplicates | yes |
| Assistant | `src/assistant.js` | Builds the records context + system prompt; calls Claude | fetch |
| HTTP | `worker.js` | Routing, headers, wiring | — |
| UI | `public/index.html` | Tabs per area, list + form per section, uploads, import, emergency card, Ask panel | — |

### 4.2 Sections (data model)

Each record: `{ id, section, ...fields, reviewed, source, createdAt, createdBy, updatedAt, updatedBy }` stored at `rec:<section>:<id>` with list metadata.

| Area tab | Section | Key fields |
|---|---|---|
| Medical / Dental (filtered by `kind`) | `providers` | name*, kind (medical/dental/vision/pharmacy/lab/hospital), specialty, phone, address, portal, lastSeen, notes |
| Medical / Dental | `visits` | date*, kind, provider, reason, notes |
| Medical / Dental | `procedures` | date, name*, kind, provider, notes |
| Medical | `conditions` | name*, since, status (active/resolved), notes |
| Medical | `medications` | name*, dose, prescriber, pharmacy, status (active/past), notes |
| Medical | `allergies` | name*, reaction, severity |
| Medical | `immunizations` | name*, date, notes |
| Insurance | `insurance` | type* (medical/dental/vision/medicare/supplement/partD/other), carrier*, plan, memberId, groupNumber, phone, effective, renewal, premium, notes |
| Insurance | `claims` | date, carrier, provider, amount, status, notes |
| Emergency | `contacts` | name*, relation, phone, email |
| Documents | `files` (metadata) | name, type, size, section/record link, uploadedBy |

`*` = required. Dates are `YYYY-MM-DD` (partial `YYYY` / `YYYY-MM` allowed for history).

### 4.3 API

| Method & path | Does |
|---|---|
| `GET /api/me` | `{ email, allowed, assistant }` |
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

All non-allow-listed emails get `403` on every `/api/*` path; static assets are still Access-gated by Cloudflare.

## 5. Privacy & security

- Access policy "MED — Nanci + Aaron" (`nanci@tuffcity.com`, `aaronf@tuffcity.com`) on `med.tuffcityrecords.com`. `workers_dev=false`, `preview_urls=false`.
- Worker re-checks the email against `ALLOWED_EMAILS` (defence in depth if the Access app is ever mis-set).
- Guard runs server-side on every write and every assistant question; the page shows the same message the server returns.
- Headers on every response: `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- `.gitignore` blocks `*.findings.json`, `data/`, `.dev.vars`.

## 6. Testing

`node --test` (no dependencies). Pure units are tested directly; `store.js` and `worker.js` are tested against an in-memory KV fake and a stubbed Claude `fetch`. Verification before completion: full test run + a local smoke test of the UI against the Worker logic.

## 7. Out of scope (v1)

Automatic Gmail sync, OCR of uploaded cards, appointment reminders, sharing with providers. Candidates for v2.
