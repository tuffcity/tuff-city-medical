# Nanci's standing rules: Tuff City apps (gathered from her Mac, 2026-11-01)

Cloud sessions can't see the notes Claude keeps on her Mac. These are her rules from there for every
*.tuffcityrecords.com app, in every session, cloud or Mac. Change them here; a session that learns a new
rule adds it here too (and to the same file in the other Tuff City repos).

## How to write to her
- **U.S. spelling** in everything: color, license, catalog, organize, analyze, favor, honor, behavior, program,
  center, judgment, canceled, labeled. Leave quotations, proper names and code keys as they are.
- **Plain, direct, active voice.** Name who did it. Never "foot" or "tie out"; say "match". A finished section is headed "Done".
- **Answer first**, in the opening line. Label each conclusion **verified** (name the source), **inferred** (from what)
  or **eliminated** (by which check).
- **Never point back** ("as above"). Every list of steps stands on its own: the app, the exact screen, a
  **clickable link on every step**, and what she should see when she gets there. One step at a time when she is
  doing it; name the device, browser, account and button. Repeat an unconfirmed step in full before the next one.
- **Name the app, its live URL and where on the page** whenever an app, screen, card or setting is mentioned or
  approval is sought; say which file changes and how it reaches her (push-to-deploy or wrangler).
- **Deploy hand-offs** say which step she is on: 6-Step Deploy (1 CODE · 2 COMMIT+PUSH · 3 DEPLOY · 4 DOMAIN · 5 GATE · 6 TEST)
  or the 4-Step Login Gate, plus the cheat-sheet section that covers it.
- **Decisions are ranked options** (chips), each with pros and cons, the recommended one first, marked (Recommended).
- **"Strategize" or "workflow"** means an options paper first (precedent, best practice, cost of each option
  including doing nothing), not building.
- **End substantive turns with "Still open"**, verified before listing: what, the cost if left undone, who or what blocks it.
  A reminder repeated twice means strategize instead of reminding again.
- **Work for another app** goes to her as a paste-ready block headed with that app's name, addressed to that app's session.
- Use full names; look up a missing last name.

## How to work
- **Default order for any setup task:** 1) automate it (connector, API, Shortcuts file, script);
  2) then the terminal on her Mac (Desktop Commander); 3) only then direct her step by step with
  ranked choices, the recommended one first. Before each step she does, name the device,
  app/browser and button, and say whether she is approving or choosing. Mark every step that needs
  her hands MANUAL. Show a screenshot or preview of the result before any decision when one can be made.
- **Claude owns app updates.** She never runs git, Terminal or wrangler. Claude edits, commits, pushes, verifies the
  deploy shipped, and tells her it's live. Her only jobs: dashboard sign-ins, OAuth grants, Cloudflare Access changes.
- **Merging or pushing to main may publish.** Ask her before each merge; one "yes" covers one merge. Check whether
  this app deploys on push (Cloudflare Workers Builds triggers) before saying so; never assume.
- **Check git before editing** (`git status`, `git log -6`): uncommitted or unfamiliar recent work means another
  session is on this app; flag it, don't collide. Stage specific files, never someone else's work.
- **Look before touching.** Before overwriting, deleting, archiving or forcing: preview it, show her, then act.
- **Verify before relaying.** Open the source before repeating what a routine, scan or tool says.
- **Smallest reversible step**, and say how to undo it.
- **Mobile first.** She uses these apps on her iPhone. Before calling a change done, check at 375–390px: no sideways
  page scroll, every button and menu responds to a tap, nothing covered. Prove it; never ask her to check.
- **Log every bug at diagnosis** (symptom → cause → fix → proof), including any wrong first diagnosis.
- **Store every solution** worth finding again (API traps, config changes, verified dead ends).
- **No AGPL** code or data inside her apps (MIT, Apache, BSD, CC-BY, CC0 are fine). Check the license first.

## What every Tuff City app has
New work is built to these. Existing apps are brought up to them only when they're being edited anyway.
- **Navigation:** header Refresh then Log out (top right; Log out = `/cdn-cgi/access/logout`), and a floating ☰ lower right
  (assistant if any · Top · Main view · Back), closing on outside tap or Esc. Never let the last navigation route be hidden.
  Deep views get a sticky context bar (Back / Home / Top / Close); saves show an inline after-save panel with next moves.
- **Undo** for edits and deletes; deleted records restorable for 31 days (restore limited to nanci@tuffcity.com).
- **Export:** CSV at minimum, PDF where a formatted document matters. **Letterhead memo print** for any app with notes or
  action items (reference: GM's `buildMemoSheet()`), "Page N of M" on every page.
- **No pop-up dead ends:** any new-tab document falls back to an in-app viewer.
- **Import / paste** entry point; uploads accept Word, PDF and a Drive link, and always show a proposal screen
  (blanks pre-ticked, changes unticked) before saving. Reference: HR Posting Studio.
- **How to use** section and an **Appendix of terms** whose terms are chips that open the feature.
- **Search** runs on Enter or 🔍, never on a typing pause; type-ahead may redraw only the suggestion list.
- **Error text names the cause** (endpoint + HTTP status).
- **Logo:** the white Tuff City mark in the app (56px header, no chip); black on paper.
- **Category colors:** legal blue · accounting/expenses/tax red · royalties magenta · production purple · media light purple ·
  HR yellow · sync green · admin gray · facilities/archives brown · IT light blue (reference: GM's `catColor()`).
  Two different apps never look identical.
- **Alerts:** warn after 14 days without progress on internal work, 7 days on external deadlines, and within 4 days of any
  explicit deadline.
- **Audit trails** stamp who did what from the Access email. Claude may appear in audit logs and commits, never in
  exported or printed content (use "Research note").

## Docs
- **Cheat sheet on four surfaces:** the App Reference vault (the live copy), the repo's `docs/`, the Notion App Reference
  page, and the Ops Home link. Refresh all four on a significant change, verifying routines, deploy mechanics and who can
  log in that same session.
- Every app's docs carry an **Appendix: Tools & Tech Integrations** with links to each service's documentation.

## Credentials
- **Never widen Claude's own access** (token permissions, Access policies, OAuth scopes), even with her approval.
  Set everything up, stop at that control, and tell her the last click is hers.
- **Nothing Claude creates expires.** Record every credential's expiry as "none".
- **Secrets never go in GitHub or Notion.** Record them in the Drive doc "App Secrets — Claude reference (PRIVATE)"
  (My Drive → Claude → Continuity, nanci@tuffcity.com). Live values are Worker or GitHub Actions secrets.
  Write "key: see Drive secrets doc", never the key.
- **Cloudflare Access** directions start at dash.cloudflare.com → Zero Trust → Access controls.

## Where she works
- She prefers **cloud sessions**. Send work to the Mac only when it needs her signed-in Chrome, Mac-only files,
  or the Obsidian vault on disk.
