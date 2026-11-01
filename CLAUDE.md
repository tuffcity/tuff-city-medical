# Working with Nanci on Medical

Every Claude session on this repository, cloud or Mac, reads this file first.
App: Medical, live at https://med.tuffcityrecords.com/ (Cloudflare Access login).

Her standing rules for all Tuff City apps are in @docs/claude/tuffcity-standing-rules.md (read them: cloud sessions have no other copy).
The same file is in every Tuff City repo; a session that learns a new rule adds it there and in the other repos.

**Phone check:** `npm run phone-check` runs a private copy of MED at iPhone size and taps ☰ (every item, tap outside, Esc),
then Refresh and Log out inside the ☰ drawer (`scripts/phone-check.mjs`, the same script in every Tuff City app; first time in a
session: `npm ci`, then `npx playwright install chromium`). Run it before asking her to merge any change to the page. Bugs: docs/BUGS.md.
Log out asks "Log out of MED?" first (on purpose, see docs/CHEAT-SHEET.md); the check answers OK (`acceptDialogs`). The bottom tabs appear only after the
records load, so the test copy (no data) cannot tap them.
**Publishing:** wrangler-only. Merging does not publish (no Workers Builds run on main); deploy with the command in README.md.
