// /api/tasks and /api/calendar against mocked Todoist and iCal feeds: auth, paging, partial failures, and that a
// secret calendar URL never appears in an error.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GET as tasksGET } from "../api/tasks.js";
import { GET as calendarGET } from "../api/calendar.js";

/** Runs fn with these env values and fetch replaced, then puts both back. */
async function withEnv(env, fetchImpl, fn) {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  try {
    for (const k of ["DASH_KEY", "TODOIST_TOKEN", "GCAL_ICS_URLS"]) delete process.env[k];
    Object.assign(process.env, env);
    globalThis.fetch = fetchImpl;
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}
const req = (path, key = "k") => new Request(`https://x${path}`, { headers: key ? { "x-dash-key": key } : {} });
const ok = (body) => new Response(JSON.stringify(body));

test("/api/tasks checks the key and the token before calling Todoist", async () => {
  let called = false;
  const spy = async () => { called = true; return ok({ results: [] }); };
  await withEnv({ DASH_KEY: "k", TODOIST_TOKEN: "t" }, spy, async () => {
    assert.equal((await tasksGET(req("/api/tasks", null))).status, 401);
    assert.equal((await tasksGET(req("/api/tasks", "nope"))).status, 401);
  });
  await withEnv({ DASH_KEY: "k" }, spy, async () => {
    const res = await tasksGET(req("/api/tasks"));
    assert.equal(res.status, 500);
    assert.match((await res.json()).error, /TODOIST_TOKEN/);
  });
  assert.equal(called, false);
});

test("/api/tasks reads every page, maps fields, and turns a failed extra into a warning", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const path = u.pathname.split("/").pop();
    seen.push(`${path}:${u.searchParams.get("cursor") || ""}`);
    if (path === "tasks" && !u.searchParams.get("cursor")) {
      return ok({ results: [{ id: "1", content: "A", priority: 4, due: { date: "2026-11-20", datetime: "2026-11-20T15:00:00Z" }, duration: { amount: 1, unit: "day" }, labels: ["deep"], project_id: "p", section_id: null, updated_at: "2026-11-01T00:00:00Z" }], next_cursor: "c2" });
    }
    if (path === "tasks") return ok({ results: [{ id: "2", content: "B", priority: 1, due: null, duration: null }], next_cursor: null });
    if (path === "labels") return new Response("nope", { status: 503 });
    return ok({ results: [], next_cursor: null });
  };
  await withEnv({ DASH_KEY: "k", TODOIST_TOKEN: "t" }, fetchImpl, async () => {
    const res = await tasksGET(req("/api/tasks"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    assert.deepEqual(body.tasks.map((t) => t.id), ["1", "2"]);
    assert.equal(body.tasks[0].due, "2026-11-20T15:00:00Z", "a timed due wins over the date");
    assert.equal(body.tasks[0].duration, 480, "a 1-day duration counts as 8 hours");
    assert.deepEqual(body.tasks[1].labels, []);
    assert.equal(body.tasks[1].projectId, null);
    assert.equal(body.labels, null);
    assert.deepEqual(body.warnings, ["Todoist labels: Todoist returned 503"]);
    assert.deepEqual(body.projects, []);
  });
  assert.ok(seen.includes("tasks:c2"), "follows next_cursor");
});

test("/api/tasks answers 502 with a hint when Todoist rejects the token", async () => {
  await withEnv({ DASH_KEY: "k", TODOIST_TOKEN: "bad" }, async () => new Response("", { status: 401 }), async () => {
    const res = await tasksGET(req("/api/tasks"));
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error, "Todoist returned 401, check TODOIST_TOKEN");
  });
  await withEnv({ DASH_KEY: "k", TODOIST_TOKEN: "t" }, async () => { throw new Error("offline"); }, async () => {
    assert.equal((await (await tasksGET(req("/api/tasks"))).json()).error, "Could not reach Todoist");
  });
});

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:allday@test
DTSTAMP:20261101T000000Z
DTSTART;VALUE=DATE:20261118
DTEND;VALUE=DATE:20261119
SUMMARY:Holiday
END:VEVENT
BEGIN:VEVENT
UID:weekly@test
DTSTAMP:20261101T000000Z
DTSTART:20261116T140000Z
DTEND:20261116T143000Z
RRULE:FREQ=WEEKLY;COUNT=3
SUMMARY:Standup
END:VEVENT
BEGIN:VEVENT
UID:nosummary@test
DTSTAMP:20261101T000000Z
DTSTART:20261117T100000Z
DTEND:20261117T110000Z
END:VEVENT
END:VCALENDAR`;

test("/api/calendar keeps all-day dates, expands repeats, and skips a bad feed without naming its URL", async () => {
  const secret = "https://calendar.google.com/calendar/ical/secret-abc/basic.ics";
  const fetchImpl = async (url) => (String(url) === secret ? new Response("", { status: 404 }) : new Response(ICS));
  await withEnv({ DASH_KEY: "k", GCAL_ICS_URLS: `https://good.example/a.ics, ${secret}` }, fetchImpl, async () => {
    const res = await calendarGET(req("/api/calendar?from=2026-11-15T00:00:00Z&to=2026-12-15T00:00:00Z"));
    assert.equal(res.status, 200);
    const body = await res.json();
    const holiday = body.events.find((e) => e.title === "Holiday");
    assert.deepEqual(holiday, { title: "Holiday", allDay: true, start: "2026-11-18", end: "2026-11-19", calendar: 0 });
    assert.equal(body.events.filter((e) => e.title === "Standup").length, 3);
    assert.ok(body.events.some((e) => e.title === "Busy"), "an event without a summary shows as Busy");
    assert.deepEqual(body.failed, [2]);
    assert.equal(body.errors.length, 1);
    assert.ok(!JSON.stringify(body).includes("secret-abc"), "the secret URL never appears");
  });
});

test("/api/calendar rejects bad ranges and answers 502 when every feed fails", async () => {
  await withEnv({ DASH_KEY: "k", GCAL_ICS_URLS: "https://a.example/x.ics" }, async () => new Response("not ical"), async () => {
    assert.equal((await calendarGET(req("/api/calendar?from=nope"))).status, 400);
    assert.equal((await calendarGET(req("/api/calendar?from=2026-01-01T00:00:00Z&to=2026-06-01T00:00:00Z"))).status, 400, "over 100 days");
    const res = await calendarGET(req("/api/calendar?from=2026-11-15T00:00:00Z&to=2026-11-20T00:00:00Z"));
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.deepEqual(body.failed, [1]);
    assert.match(body.error, /not a valid iCal file/);
  });
  await withEnv({ DASH_KEY: "k" }, async () => new Response(ICS), async () => {
    assert.equal((await calendarGET(req("/api/calendar"))).status, 500);
  });
});
