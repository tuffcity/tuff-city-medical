// Sensitive-data guard (same rules as Office Desk). SSNs and birth dates are never
// stored and never sent to Claude; the server refuses them before anything is saved.

const SSN_RE = /\b(?!000|666|9\d\d)\d{3}[-\s.]?(?!00)\d{2}[-\s.]?(?!0000)\d{4}\b/g;
const SSN_WORD_RE = /\b(ssn|social security|soc\.? sec\.?|tax ?id|itin)\b/i;
const DOB_RE = /\b(dob|d\.o\.b\.?|date of birth|birth ?date|birthday|born on|born)\b[^\n]{0,25}?(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2})/i;

export function sensitiveReason(text) {
  const t = String(text ?? "");
  if (DOB_RE.test(t)) return "a birth date";
  const digits = t.match(SSN_RE) || [];
  // A dashed ddd-dd-dddd is refused outright; a bare 9-digit run only when SSN wording is near.
  if (digits.some((d) => /^\d{3}-\d{2}-\d{4}$/.test(d))) return "a Social Security number";
  if (digits.length && SSN_WORD_RE.test(t)) return "a Social Security number";
  return null;
}

// First sensitive hit anywhere in a value tree (strings inside objects/arrays).
export function findSensitive(value) {
  if (typeof value === "string") return sensitiveReason(value);
  if (Array.isArray(value)) {
    for (const v of value) { const r = findSensitive(v); if (r) return r; }
    return null;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) { const r = findSensitive(v); if (r) return r; }
  }
  return null;
}
