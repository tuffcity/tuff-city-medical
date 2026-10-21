// Pure countdown helpers. No imports, no Node-only APIs (also runs in the browser).
const MS_PER_MINUTE = 60000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const NEAR_THRESHOLD_MS = 7 * MS_PER_DAY;
const IMMINENT_THRESHOLD_MS = 24 * MS_PER_HOUR;
const TZ = "America/New_York";
const DEFAULT_TIME = { h: 23, m: 59 };

const FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function nyFields(ms) {
  const o = {};
  for (const p of FMT.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}

// New York offset from UTC at instant ms (negative), in ms.
function nyOffset(ms) {
  const f = nyFields(ms);
  const wall = Date.UTC(+f.year, +f.month - 1, +f.day, +f.hour % 24, +f.minute, +f.second);
  return wall - Math.floor(ms / 1000) * 1000;
}

export function parseTime(str) {
  const s = String(str == null ? "" : str).trim().toLowerCase();
  if (!s) return null;
  if (s === "noon") return { h: 12, m: 0 };
  if (s === "midnight") return { h: 0, m: 0 };
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$|^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  if (m[4] !== undefined) {
    const h = +m[4], mi = +m[5];
    return h > 23 || mi > 59 ? null : { h, m: mi };
  }
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  if (h < 1 || h > 12 || mi > 59) return null;
  if (m[3] === "p" && h !== 12) h += 12;
  if (m[3] === "a" && h === 12) h = 0;
  return { h, m: mi };
}

export function targetMs(dateStr, timeStr) {
  const dm = String(dateStr || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm) return null;
  const t = parseTime(timeStr) || DEFAULT_TIME;
  const guess = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], t.h, t.m);
  let result = guess - nyOffset(guess);
  const corrected = guess - nyOffset(result);
  if (corrected !== result) result = corrected;
  return result;
}

export function parts(ms, nowMs) {
  const diff = ms - nowMs;
  if (diff < 0) return { d: 0, h: 0, m: 0, past: true };
  return {
    d: Math.floor(diff / MS_PER_DAY),
    h: Math.floor((diff % MS_PER_DAY) / MS_PER_HOUR),
    m: Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE),
    past: false,
  };
}

export function tier(ms, nowMs) {
  const diff = ms - nowMs;
  if (diff < 0) return "past";
  if (diff <= IMMINENT_THRESHOLD_MS) return "imminent";
  if (diff <= NEAR_THRESHOLD_MS) return "near";
  return "far";
}

function nyToday(nowMs) {
  const f = nyFields(nowMs);
  return `${f.year}-${f.month}-${f.day}`;
}

const norm = (s) => String(s || "").trim().toLowerCase();
const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function comingUp(records, nowMs) {
  const all = records || [];
  const upcoming = all.filter((r) => r.section === "upcoming");
  const dated = [];
  const todos = [];

  for (const r of upcoming) {
    if (r.status === "done" || r.status === "cancelled") continue;
    const t = targetMs(r.date, r.time);
    if (t === null) { todos.push(r); continue; }
    if (t < nowMs) continue;
    dated.push({ rec: r, t });
  }

  const today = nyToday(nowMs);
  for (const v of all) {
    if (v.section !== "visits" || !FULL_DATE.test(v.date || "") || v.date < today) continue;
    const matched = upcoming.some((u) =>
      (u.visitId && u.visitId === v.id) ||
      (u.date === v.date && norm(u.provider) !== "" && norm(u.provider) === norm(v.provider)));
    if (matched) continue;
    const t = targetMs(v.date, v.time);
    if (t === null || t < nowMs) continue;
    dated.push({ rec: { ...v, type: "appointment", fromVisit: true }, t });
  }

  dated.sort((a, b) => a.t - b.t);
  return { dated: dated.map((x) => x.rec), todos };
}
