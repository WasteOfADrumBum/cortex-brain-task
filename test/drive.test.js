// Checks for the browser sign-in in drive.js: how Google's answer is read back from the address. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../drive.js", import.meta.url), "utf8");
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

// Loads drive.js the way a page does, with a hash in the address and a pending sign-in for this tab.
function load({ hash = "", pending = null, path = "/" } = {}) {
  const local = new Map(), session = new Map();
  if (pending) session.set("cortex.drive.pending", JSON.stringify(pending));
  const calls = { replaced: null, history: null };
  const storage = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) });
  const ctx = {
    window: { CORTEX_CONFIG: { googleClientId: "id.apps.googleusercontent.com" } },
    location: { hash, pathname: path, search: "", origin: "https://cortex.example", replace: (u) => { calls.replaced = u; }, assign: () => {} },
    history: { replaceState: (_s, _t, u) => { calls.history = u; } },
    localStorage: storage(local), sessionStorage: storage(session), URLSearchParams, Date, JSON, crypto: globalThis.crypto,
  };
  vm.runInNewContext(`${code}\nthis.Drive = Drive;`, ctx);
  return { Drive: ctx.Drive, local, session, calls };
}

test("a good answer signs in, clears the address and returns to the starting page", async () => {
  const hash = `#state=abc&access_token=tok&expires_in=3599&scope=${encodeURIComponent(SCOPE)}`;
  const { Drive, local, session, calls } = load({ hash, pending: { state: "abc", path: "/vault" } });
  assert.equal(calls.history, "/");
  assert.equal(calls.replaced, "/vault");
  assert.equal(session.has("cortex.drive.pending"), false);
  assert.equal(JSON.parse(local.get("cortex.drive.session")).token, "tok");
  assert.equal(await Drive.init(() => {}), "linked");
});

test("an answer this tab didn't ask for is ignored", async () => {
  const hash = `#state=other&access_token=tok&scope=${encodeURIComponent(SCOPE)}`;
  const { Drive, local } = load({ hash, pending: { state: "abc", path: "/" } });
  assert.equal(local.has("cortex.drive.session"), false);
  assert.equal(await Drive.init(() => {}), "error");
  assert.match(Drive.error(), /didn't start from this tab/);
});

test("Google's errors are shown in plain words", async () => {
  const { Drive } = load({ hash: "#state=abc&error=access_denied", pending: { state: "abc", path: "/" } });
  assert.equal(await Drive.init(() => {}), "error");
  assert.match(Drive.error(), /cancelled/);
});

test("a token without Drive read access is refused", () => {
  const { Drive } = load();
  const r = Drive.readReturn("#state=a&access_token=t&scope=email", { state: "a", path: "/" }, 0);
  assert.match(r.error, /read access to Drive/);
});

test("the return path stays on this site", () => {
  const { Drive } = load();
  const r = Drive.readReturn(`#state=a&access_token=t&scope=${encodeURIComponent(SCOPE)}`, { state: "a", path: "//evil.example" }, 0);
  assert.equal(r.path, "/");
});

test("no answer in the address leaves the page alone", async () => {
  const { Drive, calls } = load({ hash: "#main" });
  assert.equal(calls.history, null);
  assert.equal(await Drive.init(() => {}), "ready");
});

test("pages no longer load Google's popup sign-in script", () => {
  for (const page of ["index", "vault", "planner", "briefing", "news", "finances", "ops"]) {
    assert.doesNotMatch(readFileSync(new URL(`../${page}.html`, import.meta.url), "utf8"), /gsi\/client/, page);
  }
});
