// Phone check (Nanci, 2026-11-01): runs a private copy of this app at iPhone size and taps what she taps.
// Works in a cloud session, where the real app sits behind the Tuff City login, so no keys are needed.
// The copy uses the app's own files; the server's /api answers "not found", the way it does offline.
// Run: npm run phone-check (first time: npm ci, then npx playwright install chromium).
// Run it before asking Nanci to merge any change to the page. Same script in every Tuff City app; only APP differs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const APP = {"name": "MED", "ready": "header.appbar .burger", "refresh": "#menu button.mi[data-act=\"refresh\"]", "refreshInPlace": true, "reveal": "header.appbar .burger", "logout": "#menu a.mi.logout", "toggle": "header.appbar .burger", "menuItems": "#menu button.mi, #menu a.mi", "outside": [370, 420], "acceptDialogs": true};

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', APP.root || 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/cdn-cgi/access/logout') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<p id="out">Logged out</p>'); }
  if (url.pathname.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"offline copy"}'); }
  let file = path.join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

let browser;
try { browser = await chromium.launch(); }
catch (e) { browser = await chromium.launch({ channel: 'chrome' }); }   // a Mac with Chrome but no downloaded browser
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  deviceScaleFactor: 3, serviceWorkers: 'block' });
// APP.storage: browser settings set before the page loads (e.g. a first-visit pop-up already seen)
if (APP.storage) await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, APP.storage);
const page = await ctx.newPage();
page.setDefaultTimeout(10000);
// APP.acceptDialogs: answer OK to confirm pop-ups (e.g. "Log out of MED?"); otherwise they are dismissed
if (APP.acceptDialogs) page.on('dialog', d => d.accept().catch(() => {}));
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// True when a tap at the element's center lands on it: on screen, visible, nothing covering it.
const tappable = loc => loc.evaluate(el => {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1) return false;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && (hit === el || el.contains(hit));
}).catch(() => false);
const tooWide = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const open = async () => { await page.goto(base, { waitUntil: 'domcontentloaded' }); await page.waitForSelector(APP.ready); await page.waitForTimeout(1000); };
// Open = the first menu item is really showing: has size, and neither it nor a parent is hidden, see-through or untappable.
// APP.reveal (optional): a button to tap first when Refresh and Log out live inside a menu (e.g. a ⚙ menu).
const reveal = async () => { if (APP.reveal) { await page.locator(APP.reveal).first().tap(); await page.waitForTimeout(400); } };
const menuOpen = () => page.locator(APP.menuItems).first().evaluate(el => {
  const r = el.getBoundingClientRect();   // a drawer that slides off screen to close counts as closed
  if (!r.width || !r.height || r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight) return false;
  for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
    const cs = getComputedStyle(e);
    // pointer-events only on the item itself: it inherits 'none' from a closed menu, while some open menus keep 'none' on their frame on purpose
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.1 || (e === el && cs.pointerEvents === 'none')) return false;
  }
  return true;
}).catch(() => false);

try {
  await open();
  check(`${APP.name} loads without script errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  const wide = await tooWide();
  check('No sideways scroll at 390px', wide <= 0, wide > 0 ? `${wide}px too wide` : '');

  const skip = what => console.log(`– ${what}: not in this app (APP setting is null)`);
  if (!APP.refresh) skip('Refresh'); else {
  const refresh = page.locator(APP.refresh).first();
  await reveal();
  await refresh.scrollIntoViewIfNeeded().catch(() => {});
  check('Refresh is on screen and not covered', await tappable(refresh));
  if (APP.refreshInPlace) {   // this app's Refresh re-pulls its data without reloading the page
    let pulls = 0; const onReq = r => { if (new URL(r.url()).pathname.startsWith('/api/')) pulls++; };
    page.on('request', onReq);
    await refresh.tap();
    await page.waitForTimeout(1500);
    page.off('request', onReq);
    check('Refresh pulls fresh data', pulls > 0, pulls ? '' : 'no /api request after the tap');
  } else {
    await page.evaluate(() => { window.__marker = 1; });
    await refresh.tap();
    await page.waitForTimeout(1500);
    check('Refresh reloads the app', await page.evaluate(() => !window.__marker).catch(() => true));
  }

  }
  if (!APP.logout) skip('Log out'); else {
  const logout = page.locator(APP.logout).first();
  await open();
  await reveal();
  await logout.scrollIntoViewIfNeeded().catch(() => {});
  check('Log out is on screen and not covered', await tappable(logout));
  await logout.tap();
  await page.waitForTimeout(1200);
  check('Log out goes to the sign-out page', page.url().endsWith('/cdn-cgi/access/logout'), page.url());
  }

  await open();
  if (!APP.toggle) skip('☰ menu'); else {
  const toggle = page.locator(APP.toggle).first();
  check('☰ is on screen and not covered', await tappable(toggle));
  await toggle.tap();
  await page.waitForTimeout(400);
  check('☰ opens the quick menu', await menuOpen());
  const items = page.locator(APP.menuItems), n = await items.count(), covered = [];
  // a long menu scrolls inside itself on a phone: scroll each item into view first, as a finger would
  for (let i = 0; i < n; i++) if (await items.nth(i).scrollIntoViewIfNeeded().catch(() => {}), !(await tappable(items.nth(i)))) covered.push((await items.nth(i).innerText()).trim().slice(0, 24));
  check(`☰ menu items can be tapped (${n})`, n > 0 && covered.length === 0, covered.length ? 'not tappable: ' + covered.join(', ') : '');
  await page.mouse.click(...(APP.outside || [20, 420]));   // APP.outside: [x, y] of a spot the open menu does not cover
  await page.waitForTimeout(400);
  check('Tapping outside closes the ☰ menu', !(await menuOpen()));
  if (!(await menuOpen())) { await toggle.tap(); await page.waitForTimeout(300); }
  const wasOpen = await menuOpen();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Esc closes the ☰ menu', wasOpen && !(await menuOpen()));
  if (await menuOpen()) { await toggle.tap(); await page.waitForTimeout(300); }
  }

  if (APP.tabs) {
    const tabs = page.locator(APP.tabs), t = await tabs.count(), bad = [];
    for (let i = 0; i < t; i++) {
      const tab = tabs.nth(i), label = (await tab.innerText()).trim().slice(0, 20);
      await tab.scrollIntoViewIfNeeded().catch(() => {});
      await tab.tap().catch(() => bad.push(label + ' (no tap)'));
      await page.waitForTimeout(500);
      if (APP.tabActive && !(await tab.evaluate((el, c) => el.classList.contains(c), APP.tabActive))) bad.push(label + ' (did not switch)');
      const w = await tooWide();
      if (w > 0) bad.push(`${label} (${w}px too wide)`);
    }
    check(`Every tab opens and fits the phone (${t})`, t > 0 && bad.length === 0, bad.join(', '));
  }
  check('No script errors while tapping', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('Phone check finished', false, String(e.message || e).split('\n')[0]);
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter(r => !r.ok).length;
console.log('\nTest copy. ' + (failed ? `${failed} of ${results.length} checks failed.` : `All ${results.length} checks passed.`));
process.exit(failed ? 1 : 0);
