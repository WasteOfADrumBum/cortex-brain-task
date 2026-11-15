// Connections: which Vercel variables are set, reported by name only (src/setup-lib.js, /api/setup).
import { test } from "node:test";
import assert from "node:assert/strict";
import { connections, CONNECTIONS } from "../src/setup-lib.js";
import { GET } from "../api/setup.js";
import { driveNotSetUp } from "../api/_drive.js";
import demo from "../src/demo/index.js";

const VARS = CONNECTIONS.flatMap((c) => c.vars);

test("connections name the missing variables and treat blank values as missing", () => {
  const rows = connections({ TODOIST_TOKEN: "t", GCAL_ICS_URLS: "   ", GOOGLE_CLIENT_ID: "c" });
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual(by.planner.missing, ["GCAL_ICS_URLS"]);
  assert.equal(by.planner.ready, false);
  assert.deepEqual(by.google.missing, ["GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]);
  assert.equal(by.ingest.optional, true);
  assert.equal(connections(Object.fromEntries(VARS.map((v) => [v, "x"]))).every((r) => r.ready && !r.missing.length), true);
});

test("/api/setup needs the dashboard key and never returns a value", async () => {
  const saved = { ...process.env };
  try {
    for (const v of VARS) delete process.env[v];
    Object.assign(process.env, { DASH_KEY: "k", TODOIST_TOKEN: "todoist-secret-value", GITHUB_TOKEN: "gh-secret-value" });
    const ask = (key) => GET(new Request("https://x/api/setup", { headers: key ? { "x-dash-key": key } : {} }));
    assert.equal((await ask()).status, 401);
    assert.equal((await ask("wrong")).status, 401);
    const res = await ask("k");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const text = await res.text();
    assert.ok(!text.includes("secret-value"), "values stay on the server");
    const by = Object.fromEntries(JSON.parse(text).connections.map((r) => [r.id, r]));
    assert.equal(by.github.ready, true);
    assert.deepEqual(by.planner.missing, ["GCAL_ICS_URLS"]);
    assert.equal(by.google.ready, false);
    delete process.env.DASH_KEY;
    assert.equal((await ask("k")).status, 500);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test("the Drive message names only the Google variables that are missing", () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" });
    delete process.env.GOOGLE_REFRESH_TOKEN;
    assert.equal(driveNotSetUp(), "Drive saving is not set up yet: add GOOGLE_REFRESH_TOKEN in Vercel");
    assert.equal(driveNotSetUp("Approving"), "Approving is not set up yet: add GOOGLE_REFRESH_TOKEN in Vercel");
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test("the demo shows connected and optional states", () => {
  const rows = demo.setup();
  assert.equal(rows.length, CONNECTIONS.length);
  assert.ok(rows.some((r) => r.ready));
  assert.ok(rows.some((r) => !r.ready && r.optional));
});
