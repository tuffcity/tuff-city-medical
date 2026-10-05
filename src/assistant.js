// Ask MED: Claude answers questions from the stored records only. No web tools (a search
// query could carry medical details to a third party) and nothing is stored.

import { SECTIONS } from "./schema.js";

const MODEL = "claude-opus-5-5";
const HIDDEN = new Set(["id", "section", "reviewed", "createdAt", "createdBy", "updatedAt", "updatedBy"]);

export function buildContext(records, files) {
  const out = [];
  for (const [section, def] of Object.entries(SECTIONS)) {
    const rows = records.filter((r) => r.section === section);
    if (!rows.length) continue;
    out.push(`## ${section} (${def.label})`);
    for (const r of rows) {
      const parts = Object.entries(r).filter(([k, v]) => !HIDDEN.has(k) && v !== "" && v != null).map(([k, v]) => `${k}: ${v}`);
      out.push(`- ${r.reviewed === false ? "[UNREVIEWED] " : ""}${parts.join(" · ")}`);
    }
  }
  if (files.length) {
    out.push("## documents on file");
    for (const f of files) out.push(`- ${f.name}${f.section ? ` (${f.section})` : ""}`);
  }
  return out.join("\n") || "(No records have been entered yet.)";
}

export function systemPrompt(me, context) {
  const today = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return [
    "You are MED, the private records assistant for Aaron Fuchs (President, Tuff City Records). It holds his medical history, dental history and insurance. Only Aaron and Nanci Cooke (his General Manager) can use it.",
    `Today is ${today}. The person asking is ${me}.`,
    "",
    "Answer ONLY from the records below. If the answer is not in them, say so plainly and say which section it would belong in — never guess, never use outside knowledge to fill in his personal details.",
    "Items marked [UNREVIEWED] were found automatically in email/Drive and not yet confirmed by a person: say so whenever you rely on one.",
    "You may explain general terms (what a deductible or a crown is) briefly, clearly labelled as general information, not medical advice.",
    "Never ask for or repeat Social Security numbers or birth dates.",
    "Style: short, direct, exact. Bullets for lists. Give phone numbers and IDs exactly as stored.",
    "",
    "=== RECORDS ===",
    context,
  ].join("\n");
}

export async function ask({ apiKey, fetch: doFetch = fetch, me = "", records, files, question, history = [] }) {
  const messages = [
    ...history.slice(-10).filter((m) => (m.role === "user" || m.role === "assistant") && m.text)
      .map((m) => ({ role: m.role, content: String(m.text).slice(0, 8000) })),
    { role: "user", content: question },
  ];
  const res = await doFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "server-side-fallback-2026-07-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      fallbacks: "default",
      system: systemPrompt(me, buildContext(records, files)),
      messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.log("anthropic error", res.status, t.slice(0, 300));
    if (res.status === 401) throw new Error("The assistant's API key was rejected. Nanci needs to re-enter it on the Worker (ANTHROPIC_API_KEY).");
    if (res.status === 429) throw new Error("The assistant is busy right now. Try again in a minute.");
    if (res.status === 402 || /credit balance/i.test(t)) throw new Error("The Anthropic account is out of credit. Nanci needs to top it up in the Anthropic Console.");
    throw new Error("The assistant had a problem. Try again in a moment.");
  }
  const data = await res.json();
  if (data.stop_reason === "refusal") return "I can't help with that request.";
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim() || "(no reply)";
}
