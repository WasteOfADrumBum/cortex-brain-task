// /api/ops and its helpers: deploy states, weekly buckets, totals, and one project read from mocked GitHub and npm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deployState, firstLine, weekStart, weeks, totals } from "../src/ops-lib.js";
import demo from "../src/demo/index.js";

test("deploy states are words, and a replaced successful deploy still counts as healthy", () => {
  assert.equal(deployState("success"), "healthy");
  assert.equal(deployState("inactive"), "healthy");
  assert.equal(deployState("failure"), "failed");
  assert.equal(deployState("error"), "failed");
  assert.equal(deployState("in_progress"), "building");
  assert.equal(deployState(undefined), "unknown");
});

test("firstLine skips blank lines and Markdown markers and clips long text", () => {
  assert.equal(firstLine("\n\n## Before: the page\nmore"), "Before: the page");
  assert.equal(firstLine(null), "");
  assert.equal(firstLine("x".repeat(200), 10), `${"x".repeat(9)}…`);
});

test("weeks and totals count merged PRs by Monday-based UTC weeks", () => {
  const now = new Date("2026-11-12T15:00:00Z"); // a Thursday
  assert.equal(weekStart(now).toISOString(), "2026-11-09T00:00:00.000Z");
  const merged = ["2026-11-12T01:00:00Z", "2026-11-09T00:00:00Z", "2026-11-08T23:59:00Z", "2026-11-01T10:00:00Z", "2026-08-01T00:00:00Z"];
  const w = weeks([{ name: "A", merged }], now);
  assert.equal(w.length, 12);
  assert.equal(w[11].start, "2026-11-09");
  assert.equal(w[11].counts.A, 2);
  assert.equal(w[10].counts.A, 1);
  assert.equal(w[9].counts.A, 1, "Sunday Nov 1 belongs to the week of Oct 26");
  assert.equal(w.reduce((n, x) => n + x.counts.A, 0), 4, "older than 12 weeks is left out");
  const t = totals([{ merged, deploys: ["2026-11-10T00:00:00Z", "2026-11-05T00:00:00Z"], failed: 1 }, { merged: [], deploys: [], failed: 0 }], now);
  assert.deepEqual(t, { mergedWeek: 2, mergedMonth: 4, deploysWeek: 1, failedWeek: 1 });
  assert.equal(totals([{ merged: [], deploys: [], failed: null }], now).failedWeek, null);
});

test("/api/ops builds a card from GitHub deployments, pull requests and npm", async () => {
  const now = new Date();
  const iso = (h) => new Date(now.getTime() - h * 3600e3).toISOString();
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    seen.push(u.host + u.pathname + u.search);
    const send = (b) => new Response(JSON.stringify(b));
    if (u.host === "registry.npmjs.org") return send({ version: "1.2.3" });
    if (u.pathname.endsWith("/deployments")) return send([{ id: 2, sha: "bbb", created_at: iso(1) }, { id: 1, sha: "aaa", created_at: iso(30) }, { id: 0, sha: "zzz", created_at: iso(24 * 9) }]);
    if (u.pathname.endsWith("/deployments/2/statuses")) return send([{ state: "success", created_at: iso(1), environment_url: "https://x.vercel.app" }]);
    if (u.pathname.endsWith("/deployments/1/statuses")) return send([{ state: "failure", created_at: iso(30) }]);
    if (u.pathname.endsWith("/commits/bbb")) return send({ commit: { message: "Ship the thing\n\nDetails" } });
    if (u.searchParams.get("state") === "open") return send([{}, {}]);
    if (u.searchParams.get("state") === "closed") return send([
      { title: "Closed, not merged", merged_at: null, body: "", html_url: "u0" },
      { title: "Older", merged_at: iso(48), body: "## Before\nold", html_url: "u1" },
      { title: "Newest", merged_at: iso(2), body: null, html_url: "u2" },
    ]);
    return new Response("{}", { status: 404 });
  };
  try {
    const { build } = await import("../api/ops.js");
    const body = await build([{ name: "Demo", repo: "o/r", url: "https://demo.example", npm: "@s/pkg" }], now);
    const card = body.projects[0];
    assert.equal(card.deploy.state, "healthy");
    assert.equal(card.deploy.message, "Ship the thing");
    assert.equal(card.deploy.url, "https://x.vercel.app");
    assert.deepEqual(card.mergedPrs.map((p) => p.title), ["Newest", "Older"]);
    assert.equal(card.mergedPrs[1].summary, "Before");
    assert.equal(card.openPrs, 2);
    assert.equal(card.failedLast7Days, 1);
    assert.deepEqual(card.npm, { name: "@s/pkg", version: "1.2.3" });
    assert.equal(body.totals.failedWeek, 1);
    assert.equal(body.warnings.length, 0);
    assert.ok(seen.some((s) => s.includes("environment=Production")));
    assert.ok(seen.includes("registry.npmjs.org/@s%2Fpkg/latest"));
    assert.ok(!seen.some((s) => s.includes("/deployments/0/")), "deploys older than 7 days are not read");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("/api/ops shows a rate limit as a warning on the card instead of failing the page", async () => {
  const realFetch = globalThis.fetch;
  delete process.env.GITHUB_TOKEN;
  globalThis.fetch = async (url) => new URL(url).host === "api.github.com" ? new Response("{}", { status: 403 }) : new Response("{}", { status: 404 });
  try {
    const { build } = await import("../api/ops.js");
    const body = await build([{ name: "Demo", repo: "o/r", url: null }], new Date());
    assert.match(body.projects[0].error, /add GITHUB_TOKEN/);
    assert.equal(body.totals.failedWeek, null);
    assert.equal(body.warnings.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("/api/ops requires the dashboard key", async () => {
  process.env.DASH_KEY = "k";
  const { GET } = await import("../api/ops.js");
  assert.equal((await GET(new Request("https://x/api/ops"))).status, 401);
});

test("the demo's Ops data adds up and names no real project", () => {
  const d = demo.ops(new Date());
  assert.equal(d.projects.length, 4);
  assert.ok(d.projects.some((p) => p.deploy?.state === "failed"), "demo shows a failed deploy");
  const sum = d.weeks.reduce((n, w) => n + Object.values(w.counts).reduce((a, b) => a + b, 0), 0);
  assert.ok(sum > 20);
  assert.ok(!JSON.stringify(d).match(/WasteOfADrumBum|onesmall|One Small/i));
});
