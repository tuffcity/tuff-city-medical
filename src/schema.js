// Sections and fields. The page reads this through /api/schema, so the forms and the
// server's validation can never drift apart.

const KIND = ["medical", "dental", "vision", "pharmacy", "lab", "hospital"];
const CARE = ["medical", "dental"];

const f = (key, label, extra = {}) => ({ key, label, type: "text", ...extra });

export const SECTIONS = {
  providers: { label: "Providers", title: "name", date: "lastSeen", fields: [
    f("name", "Name", { required: true }), f("kind", "Kind", { type: "enum", options: KIND }),
    f("specialty", "Specialty"), f("phone", "Phone"), f("address", "Address"), f("portal", "Patient portal"),
    f("lastSeen", "Last seen", { type: "date" }), f("notes", "Notes", { type: "long" }) ] },
  visits: { label: "Visits", title: "reason", date: "date", fields: [
    f("date", "Date", { type: "date", required: true }), f("kind", "Kind", { type: "enum", options: CARE }),
    f("provider", "Provider"), f("reason", "Reason"), f("notes", "Notes", { type: "long" }) ] },
  procedures: { label: "Procedures", title: "name", date: "date", fields: [
    f("name", "Procedure", { required: true }), f("date", "Date", { type: "date" }),
    f("kind", "Kind", { type: "enum", options: CARE }), f("provider", "Provider"), f("notes", "Notes", { type: "long" }) ] },
  conditions: { label: "Conditions", title: "name", date: "since", fields: [
    f("name", "Condition", { required: true }), f("since", "Since", { type: "date" }),
    f("status", "Status", { type: "enum", options: ["active", "resolved"] }), f("notes", "Notes", { type: "long" }) ] },
  medications: { label: "Medications", title: "name", fields: [
    f("name", "Medication", { required: true }), f("dose", "Dose / how often"), f("prescriber", "Prescriber"),
    f("pharmacy", "Pharmacy"), f("status", "Status", { type: "enum", options: ["active", "past"] }), f("notes", "Notes", { type: "long" }) ] },
  allergies: { label: "Allergies", title: "name", fields: [
    f("name", "Allergy", { required: true }), f("reaction", "Reaction"),
    f("severity", "Severity", { type: "enum", options: ["mild", "moderate", "severe"] }) ] },
  immunizations: { label: "Immunizations", title: "name", date: "date", fields: [
    f("name", "Vaccine", { required: true }), f("date", "Date", { type: "date" }), f("notes", "Notes", { type: "long" }) ] },
  insurance: { label: "Insurance plans", title: "carrier", date: "effective", fields: [
    f("type", "Type", { type: "enum", required: true, options: ["medical", "dental", "vision", "medicare", "supplement", "partD", "other"] }),
    f("carrier", "Carrier", { required: true }), f("plan", "Plan"), f("memberId", "Member ID"), f("groupNumber", "Group #"),
    f("phone", "Member services phone"), f("effective", "Effective", { type: "date" }), f("renewal", "Renewal", { type: "date" }),
    f("premium", "Premium"), f("notes", "Notes", { type: "long" }) ] },
  claims: { label: "Claims & EOBs", title: "provider", date: "date", fields: [
    f("date", "Date", { type: "date" }), f("carrier", "Carrier"), f("provider", "Provider"),
    f("amount", "Amount"), f("status", "Status"), f("notes", "Notes", { type: "long" }) ] },
  contacts: { label: "Emergency contacts", title: "name", fields: [
    f("name", "Name", { required: true }), f("relation", "Relation"), f("phone", "Phone"), f("email", "Email") ] },
};

const DATE_RE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

// Rule (Nanci, 2026-10-06): where a date field holds a range or several dates, keep the
// EARLIEST. Accepts YYYY, YYYY-MM, YYYY-MM-DD and M/D/YYYY tokens; returns "" if none.
const TOKEN_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b|\b\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?\b/g;
export function earliestDate(text) {
  const v = String(text ?? "").trim();
  if (!v || DATE_RE.test(v)) return v;
  const found = [];
  for (const m of v.matchAll(TOKEN_RE)) {
    found.push(m[3] ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : m[0]);
  }
  const valid = found.filter((d) => DATE_RE.test(d)).sort();
  // A range/list needs 2+ dates; a lone token only counts if it is the whole value (M/D/YYYY).
  if (valid.length >= 2) return valid[0];
  if (valid.length === 1 && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) return valid[0];
  return v;
}
const CAP = { text: 500, long: 4000, date: 10, enum: 40 };

// → { value } or { error }. `partial` = update: only fields present are checked.
export function cleanRecord(section, input, { partial = false } = {}) {
  const def = SECTIONS[section];
  if (!def) return { error: "Unknown section." };
  const src = input && typeof input === "object" ? input : {};
  const value = {};
  for (const fd of def.fields) {
    const present = Object.prototype.hasOwnProperty.call(src, fd.key) && src[fd.key] != null;
    if (!present) {
      if (fd.required && !partial) return { error: `${fd.label} is required.` };
      continue;
    }
    let v = String(src[fd.key]).trim().slice(0, fd.type === "long" ? CAP.long : CAP.text);
    if (fd.type === "date") v = earliestDate(v);
    if (fd.required && !v) return { error: `${fd.label} is required.` };
    if (v && fd.type === "date" && !DATE_RE.test(v)) return { error: `${fd.label} must be YYYY, YYYY-MM or YYYY-MM-DD.` };
    if (v && fd.type === "enum" && !fd.options.includes(v)) return { error: `${fd.label} must be one of: ${fd.options.join(", ")}.` };
    value[fd.key] = v;
  }
  if (typeof src.reviewed === "boolean") value.reviewed = src.reviewed;
  if (typeof src.source === "string") value.source = src.source.trim().slice(0, 500);
  return { value };
}

export const recordLabel = (section, rec) => {
  const def = SECTIONS[section];
  return String((def && rec[def.title]) || rec.name || rec.carrier || rec.date || "").slice(0, 120);
};
