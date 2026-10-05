import { test } from "node:test";
import assert from "node:assert/strict";
import { emailOf, parseAllowList, isAllowed } from "../src/auth.js";

const req = (h) => new Request("https://med.example/api/me", { headers: h });
const jwt = (payload) => "x." + btoa(JSON.stringify(payload)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_") + ".y";

test("Access header email wins and is lower-cased", () => {
  assert.equal(emailOf(req({ "Cf-Access-Authenticated-User-Email": "Nanci@TuffCity.com" })), "nanci@tuffcity.com");
});

test("falls back to the Access JWT payload", () => {
  assert.equal(emailOf(req({ "Cf-Access-Jwt-Assertion": jwt({ email: "AaronF@tuffcity.com" }) })), "aaronf@tuffcity.com");
});

test("no identity → empty string", () => {
  assert.equal(emailOf(req({})), "");
  assert.equal(emailOf(req({ "Cf-Access-Jwt-Assertion": "garbage" })), "");
});

test("allow-list parsing and checks", () => {
  const list = parseAllowList(" nanci@tuffcity.com,AARONF@tuffcity.com  x@y.z ");
  assert.deepEqual(list, ["nanci@tuffcity.com", "aaronf@tuffcity.com", "x@y.z"]);
  assert.equal(isAllowed("aaronf@tuffcity.com", list), true);
  assert.equal(isAllowed("admin@tuffcity.com", list), false);
  assert.equal(isAllowed("", list), false);
  assert.equal(isAllowed("nanci@tuffcity.com", parseAllowList("")), false);
});
