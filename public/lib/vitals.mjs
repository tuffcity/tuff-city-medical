// Pure vitals helpers. No imports, no Node-only APIs.
const BP_SYS_HIGH = 140;
const BP_DIA_HIGH = 90;
const BMI_HIGH = 30;
const SPO2_LOW = 95;
const PULSE_HIGH = 100;
const DELTA_DECIMALS = 100;

export function num(v) {
  const m = String(v == null ? "" : v).match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

export function bpParts(v) {
  const m = String(v == null ? "" : v).match(/(\d+)\s*\/\s*(\d+)/);
  return m ? { sys: +m[1], dia: +m[2] } : null;
}

export function delta(visits, visit, key) {
  const cur = num(visit[key]);
  if (cur === null) return null;
  let prev = null;
  for (const v of visits || []) {
    if (v === visit || !v.date || !(v.date < visit.date) || num(v[key]) === null) continue;
    if (prev === null || v.date > prev.date) prev = v;
  }
  if (!prev) return null;
  return Math.round((cur - num(prev[key])) * DELTA_DECIMALS) / DELTA_DECIMALS;
}

export function flags(visit) {
  const out = new Set();
  const bp = bpParts(visit.bp);
  if (bp && (bp.sys >= BP_SYS_HIGH || bp.dia >= BP_DIA_HIGH)) out.add("bp");
  const bmi = num(visit.bmi);
  if (bmi !== null && bmi >= BMI_HIGH) out.add("bmi");
  const spo2 = num(visit.spo2);
  if (spo2 !== null && spo2 < SPO2_LOW) out.add("spo2");
  const pulse = num(visit.pulse);
  if (pulse !== null && pulse > PULSE_HIGH) out.add("pulse");
  return out;
}

export function trend(visits) {
  return (visits || [])
    .filter((v) => v.bp || v.weight || v.bmi)
    .map((v) => ({ date: v.date, bp: v.bp, weight: v.weight, bmi: v.bmi }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
