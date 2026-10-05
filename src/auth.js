// Identity comes from Cloudflare Access (header, or the Access JWT as a fallback).
// The allow-list is defence in depth behind the Access policy.

export function emailOf(req) {
  const direct = req.headers.get("Cf-Access-Authenticated-User-Email");
  if (direct) return direct.trim().toLowerCase();
  const jwt = req.headers.get("Cf-Access-Jwt-Assertion");
  if (jwt) {
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.email) return String(payload.email).trim().toLowerCase();
    } catch {}
  }
  return "";
}

export const parseAllowList = (raw) =>
  String(raw || "").split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);

export const isAllowed = (email, list) => !!email && list.includes(email);
