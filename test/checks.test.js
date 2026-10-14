// /api/checks: newest completion of each named task from Todoist's activity log, and the demo uses the same shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import demo from "../src/demo/index.js";

test("/api/checks returns the newest completion per title and null when none", async () => {
  process.env.DASH_KEY = "k";
  process.env.TODOIST_TOKEN = "t";
  const seen = [];
  const realFetch = globalThis.fetch;
  const now = Date.now();
  globalThis.fetch = async (url) => {
    seen.push(new URL(url));
    const ev = (content, hoursAgo, description) => ({ event_date: new Date(now - hoursAgo * 3600e3).toISOString(), extra_data: { content, description } });
    return new Response(JSON.stringify({
      results: [ev("Brain sweep ran", 30, "Old run"), ev("brain sweep ran", 5, "Newest run\nsecond line"), ev("Something else", 1, "x")],
      next_cursor: null,
    }));
  };
  try {
    const { GET } = await import("../api/checks.js");
    const res = await GET(new Request("https://x/api/checks?title=Brain%20sweep%20ran&title=Muse%20check%20ran", { headers: { "x-dash-key": "k" } }));
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.checks[0].title, "Brain sweep ran");
    assert.equal(body.checks[0].description, "Newest run\nsecond line");
    assert.deepEqual(body.checks[1], { title: "Muse check ran", completedAt: null, description: "" });
    const q = seen[0].searchParams;
    assert.equal(seen[0].pathname, "/api/v1/activities");
    assert.equal(q.get("event_type"), "completed");
    assert.ok(now - Date.parse(q.get("date_from")) <= 7 * 864e5, "never asks for more than 7 days");
    // The demo's checks have the same keys.
    const d = demo.checks(new Date(), ["Brain sweep ran", "Muse check ran"]);
    assert.deepEqual(Object.keys(d).sort(), Object.keys(body).sort());
    assert.deepEqual(Object.keys(d.checks[0]).sort(), Object.keys(body.checks[0]).sort());
    const unauth = await GET(new Request("https://x/api/checks?title=a"));
    assert.equal(unauth.status, 401);
  } finally {
    globalThis.fetch = realFetch;
  }
});
