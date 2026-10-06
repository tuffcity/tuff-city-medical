// Turns the Gmail/Drive findings file into records. Everything imported starts as
// reviewed:false so a person confirms it. Lenient on shape (bad enum/date values are
// blanked, not rejected), strict on privacy (an item carrying an SSN/DOB is skipped whole).

import { SECTIONS, cleanRecord, earliestDate } from "./schema.js";
import { findSensitive } from "./guard.js";

// Fields that identify "the same thing" within a section.
const IDENTITY = {
  providers: ["name"], visits: ["date", "provider"], procedures: ["name", "date"],
  conditions: ["name"], medications: ["name"], allergies: ["name"], immunizations: ["name", "date"],
  insurance: ["type", "carrier", "memberId"], claims: ["date", "provider", "amount"], contacts: ["name"],
};

const norm = (v) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
export const identityKey = (section, rec) =>
  section + "|" + (IDENTITY[section] || ["name"]).map((k) => norm(rec[k])).join("|");

const DATE_RE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

function lenient(section, item) {
  const out = { ...item };
  for (const fd of SECTIONS[section].fields) {
    const v = out[fd.key];
    if (v == null) continue;
    let s = String(v).trim();
    if (fd.type === "date") s = out[fd.key] = earliestDate(s);
    if (fd.type === "enum" && !fd.options.includes(s) && !fd.required) out[fd.key] = "";
    if (fd.type === "date" && s && !DATE_RE.test(s)) out[fd.key] = "";
  }
  return out;
}

export function planImport(findings, existing = []) {
  const plan = { records: [], skipped: { duplicate: 0, invalid: 0, sensitive: 0 }, gaps: [] };
  if (!findings || typeof findings !== "object" || Array.isArray(findings)) return plan;
  if (Array.isArray(findings.gaps)) plan.gaps = findings.gaps.map(String).slice(0, 100);

  const seen = new Set(existing.map((r) => identityKey(r.section, r)));
  for (const section of Object.keys(SECTIONS)) {
    const items = findings[section];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== "object") { plan.skipped.invalid++; continue; }
      if (findSensitive(item)) { plan.skipped.sensitive++; continue; }
      const { value, error } = cleanRecord(section, lenient(section, item));
      if (error) { plan.skipped.invalid++; continue; }
      const key = identityKey(section, value);
      if (seen.has(key)) { plan.skipped.duplicate++; continue; }
      seen.add(key);
      plan.records.push({ section, fields: { ...value, reviewed: false, source: value.source || "Gmail/Drive search" } });
    }
  }
  return plan;
}
