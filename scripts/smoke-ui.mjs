// Chromium smoke test for the page (spec §6): Coming up, visit card, vitals trend, undo,
// menu, collapsible groups and import reports, at 390 px and 1280 px.
// Usage: node scripts/smoke-ui.mjs   (starts scripts/dev-server.mjs on a spare port)
// Optional: SHOTS=<dir> saves phone screenshots there.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT || 8799);
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS || "";

const failures = [];
let passed = 0;
function check(name, ok, extra = "") {
  if (ok) { passed++; console.log("  ok  " + name); }
  else { failures.push(name); console.log("  FAIL " + name + (extra ? ` — ${extra}` : "")); }
}

const server = spawn(process.execPath, ["scripts/dev-server.mjs", String(PORT)], { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => { if (String(d).includes("MED dev server")) resolve(); });
  server.on("exit", (c) => reject(new Error("dev server exited " + c)));
  setTimeout(() => reject(new Error("dev server did not start")), 10000);
});

const call = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  if (!r.ok) throw new Error(`${method} ${path}: ${data.error}`);
  return data;
};
const add = (section, fields) => call("POST", "/api/records", { section, ...fields });

// ── Seed ──
await add("conditions", { name: "Example condition A", status: "active" });
const traz = await add("medications", { name: "Examplazole", status: "active", reviewed: false });
const feb = await add("visits", { date: "2026-02-10", kind: "medical", provider: "Dr. Example", reason: "Visit; labs", bp: "128/80", weight: "194 lb", bmi: "30.55" });
const aug = await add("visits", {
  date: "2026-08-20", kind: "medical", provider: "Dr. Example", reason: "Annual exam", bp: "150/70", weight: "200 lb", bmi: "31.20",
  pulse: "72", spo2: "97%", issues: "Example condition A\nSample finding B\nSample finding C", tests: "Test one\nTest two\nTest three",
  instructions: "Return in about 6 months (around 2027-02-20)", followUp: "2027-02-20", charged: "$250.00",
});
// NY times. T1 = Oct 15 12:00, T2 = Oct 19 12:00, T3 = Dec 1 12:00 (all America/New_York).
const T1 = new Date("2026-10-15T16:00:00Z"), T2 = new Date("2026-10-19T16:00:00Z"), T3 = new Date("2026-12-01T17:00:00Z");
await add("upcoming", { type: "appointment", title: "Hearing-aid visit", date: "2026-10-15", time: "8:00 PM", provider: "Example Hearing Center", location: "Example Plaza", phone: "212-555-0100", status: "unconfirmed", actionNeeded: "Bring old aids" });
await add("upcoming", { type: "appointment", title: "Dentist check", date: "2026-10-20", time: "10:00 AM", provider: "Example Dental", status: "confirmed" });
await add("upcoming", { type: "deadline", title: "Medicare plan-change deadline", date: "2026-12-07", status: "needs action" });
await add("upcoming", { type: "appointment", title: "Finished cleaning", date: "2026-10-25", time: "9:00 AM", status: "done" });
await add("upcoming", { type: "appointment", title: "Cancelled eye exam", date: "2026-10-22", time: "9:00 AM", status: "cancelled" });
await add("upcoming", { type: "to-do", title: "Rebook dental cleaning" });
await add("upcoming", { type: "to-do", title: "Schedule 6-month follow-up", visitId: aug.id });

const errors = [];
const browser = await chromium.launch();
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const tab = (page, id) => page.locator(`[data-tab="${id}"]:visible`).first().click();
const cardInfo = (page) => page.$$eval(".cu-card", (els) => els.map((e) => ({
  title: e.querySelector(".cu-title")?.textContent.trim(), tier: ["far", "near", "imminent"].find((c) => e.classList.contains(c)) || "",
  count: e.querySelector(".cu-count")?.textContent.trim() })));

async function newPage(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(4000);
  page.on("pageerror", (e) => errors.push(`${width}px: ${e.message}`));
  page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
  await page.clock.setFixedTime(T1);
  await page.route("**/api/audit", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.entries.push({ key: "log:9999999999999:legacy:00000000", action: "create", label: "Old legacy entry", section: "conditions", by: "nanci@tuffcity.com", at: Date.parse("2026-01-01") });
    await route.fulfill({ response: res, json: body });
  });
  await page.goto(BASE + "/");
  await page.waitForSelector("h2.page");
  return page;
}
const dialogs = [];

try {
  // ═════ Phone ═════
  console.log("Phone 390px");
  const page = await newPage(390);

  // Coming up at three instants.
  await page.waitForSelector(".cu-card", { timeout: 5000 }).catch(() => {});
  let cards = await cardInfo(page);
  check("T1: cards ordered by target", JSON.stringify(cards.map((c) => c.title)) === JSON.stringify(["Hearing-aid visit", "Dentist check", "Medicare plan-change deadline"]), JSON.stringify(cards));
  check("T1: tiers imminent/near/far", JSON.stringify(cards.map((c) => c.tier)) === JSON.stringify(["imminent", "near", "far"]), JSON.stringify(cards.map((c) => c.tier)));
  check("T1: countdown text 'in 8h 0m'", cards[0]?.count === "in 8h 0m", cards[0]?.count);
  check("T1: far countdown shows days", /^in \d+d \d+h \d+m$/.test(cards[2]?.count || ""), cards[2]?.count);
  const strip = (await page.locator(".cu-strip").textContent().catch(() => "")) || "";
  check("done and cancelled items absent", strip.length > 0 && !strip.includes("Finished cleaning") && !strip.includes("Cancelled eye exam"));
  const todos = await page.$$eval(".cu-todo", (els) => els.map((e) => e.textContent));
  check("undated to-dos listed", todos.length === 2 && todos.some((t) => t.includes("Rebook dental cleaning")), JSON.stringify(todos));
  check("to-dos come after the cards", await page.evaluate(() => {
    const c = [...document.querySelectorAll(".cu-card")].pop(), t = document.querySelector(".cu-todo");
    return !!(c && t && (c.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING));
  }));
  check("Coming up is first on Home", await page.evaluate(() => {
    const s = document.querySelector(".cu-strip"), r = document.querySelector(".tiles");
    return !!(s && r && (s.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING));
  }));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ui-home.png` });

  await page.clock.setFixedTime(T2); await page.reload(); await page.waitForSelector("h2.page");
  cards = await cardInfo(page);
  check("T2: past item gone, tiers imminent/far", JSON.stringify(cards.map((c) => [c.title, c.tier])) === JSON.stringify([["Dentist check", "imminent"], ["Medicare plan-change deadline", "far"]]), JSON.stringify(cards));
  await page.clock.setFixedTime(T3); await page.reload(); await page.waitForSelector("h2.page");
  cards = await cardInfo(page);
  check("T3: deadline near", JSON.stringify(cards.map((c) => [c.title, c.tier])) === JSON.stringify([["Medicare plan-change deadline", "near"]]), JSON.stringify(cards));
  await page.clock.setFixedTime(T1); await page.reload(); await page.waitForSelector("h2.page");

  // Tap a card → details with Mark done / Edit / Call.
  await page.locator(".cu-card").first().click().catch(() => {});
  const foot = (await page.locator("#sheet .sheet-f").textContent().catch(() => "")) || "";
  check("card sheet has Mark done · Edit · Call", /Mark done/.test(foot) && /Edit/.test(foot) && /Call/.test(foot), foot);
  check("Call is a tel: link", (await page.locator('#sheet a[href^="tel:"]').count()) > 0);
  await page.keyboard.press("Escape");

  // Coming up list via See all.
  await page.locator('[data-act="sub-comingup"]').first().click().catch(() => {});
  const cuList = (await page.locator("main").textContent()) || "";
  check("Coming up list has Upcoming/To-dos/Past/Done", ["Upcoming", "To-dos", "Past", "Done"].every((h) => cuList.includes(h)) && cuList.includes("Finished cleaning"));
  await tab(page, "home");

  // Medical: collapsible groups.
  await tab(page, "medical");
  await page.waitForSelector("h2.page");
  const expanded = () => page.$$eval("main .group .gtoggle", (els) => els.map((e) => e.getAttribute("aria-expanded")));
  let ex = await expanded();
  check("Medical groups start collapsed", ex.length >= 6 && ex.every((v) => v === "false"), JSON.stringify(ex));
  check("Medical has .vitals-trend with 2 rows", (await page.locator(".vitals-trend tbody tr").count()) === 2);
  check("vitals trend flags 150/70", (await page.locator(".vitals-trend .flag", { hasText: "150/70" }).count()) === 1);
  await page.locator('.group[data-g="medical:conditions"] .gtoggle').click().catch(() => {});
  check("tapping Conditions opens it and shows rows", await page.locator('.group[data-g="medical:conditions"] .item', { hasText: "Example condition A" }).waitFor({ state: "visible", timeout: 1500 }).then(() => true, () => false));
  check("+ Add does not toggle", await (async () => {
    await page.locator('.group[data-g="medical:conditions"] [data-act="add"]').click().catch(() => {});
    await page.keyboard.press("Escape");
    return (await page.locator('.group[data-g="medical:conditions"] .gtoggle').getAttribute("aria-expanded").catch(() => "")) === "true";
  })());
  await page.reload(); await page.waitForSelector("h2.page");
  check("group state persists after reload", (await page.locator('.group[data-g="medical:conditions"] .gtoggle').getAttribute("aria-expanded").catch(() => "")) === "true");
  await page.locator('[data-act="gall"][data-v="1"]').click().catch(() => {});
  ex = await expanded();
  check("Expand all opens every group", ex.length >= 6 && ex.every((v) => v === "true"), JSON.stringify(ex));
  await page.locator('[data-act="gall"][data-v="0"]').click().catch(() => {});
  await page.fill("#q", "condition A").catch(() => {});
  await page.waitForTimeout(450);
  check("search auto-opens the matching group", (await page.locator('.group[data-g="medical:conditions"] .gtoggle').getAttribute("aria-expanded").catch(() => "")) === "true");
  check("search hides groups with no matches", (await page.locator('.group[data-g="medical:allergies"]').count()) === 0);
  await page.fill("#q", "").catch(() => {});
  await page.waitForTimeout(450);
  check("clearing search restores remembered state", (await page.locator('.group[data-g="medical:conditions"] .gtoggle').getAttribute("aria-expanded").catch(() => "")) === "false");

  // Visit card.
  await page.locator('.group[data-g="medical:visits"] .gtoggle').click().catch(() => {});
  await page.locator(".item", { hasText: "Annual exam" }).click().catch(() => {});
  await page.waitForSelector("#sheet[open]", { timeout: 3000 }).catch(() => {});
  check("visit card shows vitals tiles", (await page.locator("#sheet .vital").count()) >= 4);
  check("150/70 is flagged", (await page.locator("#sheet .vital.flag", { hasText: "150/70" }).count()) === 1);
  check("weight tile shows ↑6", ((await page.locator('#sheet .vital[data-k="weight"] .delta').textContent().catch(() => "")) || "").trim() === "↑6");
  check("issue chips render", (await page.locator("#sheet .ichip").count()) === 3);
  check("'Sample finding B' chip marked New", ((await page.locator("#sheet .ichip", { hasText: "Sample finding B" }).textContent().catch(() => "")) || "").includes("New"));
  check("'Example condition A' chip links to the condition", !(((await page.locator("#sheet .ichip", { hasText: "Example condition A" }).textContent().catch(() => "")) || "New").includes("New"))
    && (await page.locator('#sheet button.ichip[data-act="open"]', { hasText: "Example condition A" }).count()) === 1);
  check("tests as checklist", (await page.locator("#sheet .checklist li").count()) === 3);
  check("follow-up date links to its Coming up item", await (async () => {
    const b = page.locator("#sheet .fu-link");
    if ((await b.count()) !== 1 || !((await b.textContent()) || "").includes("Feb 20, 2027")) return false;
    await b.click();
    const h = (await page.locator("#sheet h3").textContent().catch(() => "")) || "";
    await page.keyboard.press("Escape");
    await page.locator(".item", { hasText: "Annual exam" }).click();
    await page.waitForSelector("#sheet .vital");
    return h.includes("Schedule 6-month follow-up");
  })());
  check("instructions link to Coming up item", (await page.locator("#sheet [data-act=open]", { hasText: "Schedule 6-month follow-up" }).count()) === 1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ui-visit.png` });
  await page.locator('#sheet button.ichip[data-act="open"]').click().catch(() => {});
  check("tapping a matched chip opens the condition", ((await page.locator("#sheet h3").textContent().catch(() => "")) || "").includes("Example condition A"));
  await page.keyboard.press("Escape");
  check("phone Medical: no horizontal scroll", await noHScroll(page));

  // Undo after confirm.
  await page.fill("#q", "Examplazole"); await page.waitForTimeout(450);
  await page.locator(".item", { hasText: "Examplazole" }).click();
  await page.locator('#sheet [data-act="confirm"]').click();
  const undoBtn = page.locator('.toast [data-act="undo"]');
  check("confirm shows a toast with Undo", await undoBtn.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false));
  await undoBtn.click().catch(() => {});
  await page.waitForTimeout(400);
  check("Undo restores Unreviewed", await page.locator("#sheet .status.unrev").isVisible().catch(() => false));
  check("toast says Undone", ((await page.locator(".toast").textContent().catch(() => "")) || "").includes("Undone"));
  await page.keyboard.press("Escape");
  await page.fill("#q", ""); await page.waitForTimeout(300);

  // Menu.
  await page.locator(".burger").click().catch(() => {});
  const menu = page.locator("#menu[open]");
  check("☰ opens the drawer", await menu.isVisible().catch(() => false));
  const mt = (await menu.textContent().catch(() => "")) || "";
  check("menu has Refresh, Undo last change, Imports, Appearance", ["Refresh", "Undo last change", "Imports to review", "Appearance", "Needs review", "Log out"].every((s) => mt.includes(s)), mt.slice(0, 200));
  check("Needs review shows count 1", ((await page.locator('#menu [data-act="review"] .count').textContent().catch(() => "")) || "").trim() === "1");
  const lo = page.locator('#menu [data-act="logout"]');
  check("Log out targets /cdn-cgi/access/logout", ((await lo.getAttribute("href").catch(() => "")) || (await lo.getAttribute("data-href").catch(() => ""))) === "/cdn-cgi/access/logout");
  check("focus moved into drawer", await page.evaluate(() => !!document.activeElement?.closest("#menu")));
  check("drawer is aria-modal", (await page.locator("#menu").getAttribute("aria-modal").catch(() => "")) === "true");
  if (SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/ui-menu.png` }); }
  await page.locator('#menu [data-act="theme"][data-v="dark"]').click().catch(() => {});
  check("Appearance → dark sets data-theme", (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark");
  await page.reload(); await page.waitForSelector("h2.page");
  check("Appearance remembered", (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark");
  await page.locator(".burger").click().catch(() => {});
  await page.locator('#menu [data-act="theme"][data-v="auto"]').click().catch(() => {});
  check("Appearance → auto removes data-theme", (await page.evaluate(() => document.documentElement.hasAttribute("data-theme"))) === false);
  await page.keyboard.press("Escape");
  check("Escape closes the drawer", !(await menu.isVisible().catch(() => false)));
  await page.locator('[data-act="menu"]:visible').last().click().catch(() => {});
  check("More tab opens the same menu", await menu.isVisible().catch(() => false));
  await page.locator('#menu [data-act="sub-activity"]').click().catch(() => {});
  await page.waitForSelector(".log li", { timeout: 3000 }).catch(() => {});
  check("menu item tap closes the drawer", !(await menu.isVisible().catch(() => false)));
  check("Activity entries have Undo", (await page.locator('.log li [data-act="undo"]').count()) > 0);
  check("legacy Activity entry has no Undo", (await page.locator(".log li", { hasText: "Old legacy entry" }).count()) === 1
    && (await page.locator(".log li", { hasText: "Old legacy entry" }).locator('[data-act="undo"]').count()) === 0);
  // Undo last change (the latest entry is the undo of the confirm → redo it).
  dialogs.length = 0;
  await page.locator(".burger").click();
  await page.locator('#menu [data-act="undolast"]').click().catch(() => {});
  await page.waitForTimeout(500);
  check("Undo last change of an undo offers Redo with the original verb", dialogs[0] === 'Redo: confirmed "Examplazole"?', dialogs[0]);
  check("never shows 'the undo of'", !dialogs.some((m) => m.includes("the undo of")));
  await page.locator(".burger").click();
  await page.locator('#menu [data-act="refresh"]').click().catch(() => {});
  await page.waitForTimeout(400);
  check("Refresh shows Updated just now", ((await page.locator("#updAgo").textContent().catch(() => "")) || "").includes("Updated just now"));

  // Import report.
  const trazNow = (await call("GET", "/api/records")).records.find((r) => r.id === traz.id);
  await call("POST", "/api/imports", {
    title: "Example After Visit Summary 2026-08-20", source: { name: "avs.pdf", note: "Pages 1 and 3" },
    ops: [
      { op: "create", section: "medications", label: "Vitamin D", fields: { name: "Vitamin D", status: "active" } },
      { op: "update", section: "visits", id: feb.id, label: "Feb visit notes", fields: { notes: "Labs reviewed" } },
      { op: "conflict", label: "Examplazole", detail: "AVS lists no medications", choices: [
        { id: "past", label: "Mark examplazole past", patch: { section: "medications", id: trazNow.id, fields: { status: "past" } } },
        { id: "keep", label: "Keep as current" }] },
      { op: "skip", label: "Birth date and MRN", reason: "Privacy rule" },
      { op: "create", group: "upcoming", section: "upcoming", label: "Annual follow-up", fields: { type: "appointment", title: "Annual follow-up", date: "2027-02-20", visitId: aug.id } },
    ],
  });
  await tab(page, "home"); await page.reload(); await page.waitForSelector("h2.page");
  check("Home banner shows open import", ((await page.locator(".imp-banner").textContent().catch(() => "")) || "").includes("1 import to review"));
  await page.locator(".imp-banner").click().catch(() => {});
  await page.waitForSelector(".imp-report", { timeout: 3000 }).catch(() => {});
  const secs = await page.$$eval(".imp-report h3", (els) => els.map((e) => e.textContent.trim().replace(/\s*\d+$/, "")));
  check("report sections in spec order", JSON.stringify(secs) === JSON.stringify(["Source", "Added", "Updated", "Conflicts to settle", "Not imported", "Coming up created"]), JSON.stringify(secs));
  check("updated item shows before → after", ((await page.locator('.imp-item[data-n="2"]').textContent().catch(() => "")) || "").includes("→"));
  check("counter starts at 1 of 5 settled", ((await page.locator(".imp-count").textContent().catch(() => "")) || "").includes("1 of 5 settled"));
  await page.locator('.imp-item[data-n="1"] [data-a="keep"]').click().catch(() => {}); await page.waitForTimeout(300);
  await page.locator('.imp-item[data-n="2"] [data-a="undo"]').click().catch(() => {}); await page.waitForTimeout(300);
  check("settling shows a toast without Undo", (await page.locator(".toast").textContent().catch(() => "")).includes("Undone") && (await page.locator('.toast [data-act="undo"]').count()) === 0);
  await page.locator('.imp-item[data-n="3"] [data-a="choose"][data-c="past"]').click().catch(() => {}); await page.waitForTimeout(300);
  await page.locator('.imp-item[data-n="5"] [data-a="keep"]').click().catch(() => {}); await page.waitForTimeout(300);
  check("counter reaches 5 of 5 settled", ((await page.locator(".imp-count").textContent().catch(() => "")) || "").includes("5 of 5 settled"));
  check("phone report: no horizontal scroll", await noHScroll(page));
  await tab(page, "home"); await page.waitForTimeout(200);
  check("Home banner gone once settled", (await page.locator(".imp-banner").count()) === 0);
  check("phone Home: no horizontal scroll", await noHScroll(page));

  // A conflict whose record was edited after the import: Choose asks, then applies anyway.
  const stale = await add("upcoming", { type: "to-do", title: "Stale-edit target", status: "unconfirmed" });
  await call("POST", "/api/imports", { title: "Stale conflict", ops: [
    { op: "conflict", label: "Status differs", detail: "Source says confirmed", choices: [
      { id: "conf", label: "Mark confirmed", patch: { section: "upcoming", id: stale.id, fields: { status: "confirmed" } } },
      { id: "same", label: "Leave it" }] },
  ] });
  await call("PUT", `/api/records/upcoming/${stale.id}`, { details: "edited after import" });
  await page.reload(); await page.waitForSelector("h2.page");
  await page.locator(".imp-banner").click().catch(() => {});
  await page.waitForSelector(".imp-report", { timeout: 3000 }).catch(() => {});
  dialogs.length = 0;
  await page.locator('.imp-item[data-n="1"] [data-a="choose"][data-c="conf"]').click().catch(() => {}); await page.waitForTimeout(500);
  check("stale choose asks to apply anyway", dialogs[0] === "This record was edited after the import. Apply 'Mark confirmed' anyway?", dialogs[0]);
  check("apply anyway settles the conflict", ((await page.locator('.imp-item[data-n="1"]').textContent().catch(() => "")) || "").includes("Chose: Mark confirmed"));
  check("record now confirmed", (await call("GET", "/api/records")).records.find((r) => r.id === stale.id)?.status === "confirmed");

  // ═════ Desktop ═════
  console.log("Desktop 1280px");
  const d = await newPage(1280);
  check("desktop: Coming up cards", (await d.locator(".cu-card").count()) >= 3);
  check("desktop Home: no horizontal scroll", await noHScroll(d));
  await d.locator(".burger").click().catch(() => {});
  const box = await d.locator("#menu[open]").boundingBox().catch(() => null);
  check("desktop: menu is a dropdown panel", !!box && box.height < 860 && box.width <= 400, JSON.stringify(box));
  if (SHOTS) { await d.waitForTimeout(300); await d.screenshot({ path: `${SHOTS}/ui-desktop-menu.png` }); }
  await d.keyboard.press("Escape");
  await tab(d, "medical");
  check("desktop Medical: .vitals-trend", (await d.locator(".vitals-trend").count()) === 1);
  check("desktop Medical: no horizontal scroll", await noHScroll(d));
  await d.locator('[data-act="gall"][data-v="1"]').click().catch(() => {});
  await d.locator(".item", { hasText: "Annual exam" }).click().catch(() => {});
  check("desktop visit card", (await d.locator("#sheet .vital").count()) >= 4);
  await d.keyboard.press("Escape");
  await d.locator(".burger").click().catch(() => {});
  await d.locator('#menu [data-act="sub-imports"]').click().catch(() => {});
  check("desktop Imports list shows settled count", ((await d.locator("main").textContent()) || "").includes("5 of 5 settled"));
  check("desktop Imports: no horizontal scroll", await noHScroll(d));
} catch (e) {
  failures.push("crashed: " + e.message);
  console.log(e);
} finally {
  check("no page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
  server.kill();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("Failures:\n- " + failures.join("\n- ")); process.exit(1); }
