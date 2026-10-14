// Checks for /demo: the sample data has the same shape as real data, contains nothing personal,
// works with the real task rules, and the routes are set up (rewrites, noindex). Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import demo from "../src/demo/index.js";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

// Loads a classic browser script (config.js, task-rules.js) into a sandbox and returns its globals.
function loadScript(file, globals = {}) {
  const ctx = vm.createContext({ window: {}, ...globals });
  vm.runInContext(`${read(file)}\n;this.__out = typeof TaskRules !== "undefined" ? TaskRules : undefined;`, ctx);
  return ctx;
}

test("sample tasks have the same keys as /api/tasks", async () => {
  process.env.DASH_KEY = "k";
  process.env.TODOIST_TOKEN = "t";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname.split("/").pop();
    const results = {
      tasks: [{ id: "1", content: "x", priority: 4, due: { date: "2026-01-01" }, duration: { amount: 30, unit: "minute" }, labels: ["quick"], project_id: "p", section_id: null }],
      labels: [{ name: "quick" }], projects: [{ id: "p", name: "P" }], sections: [{ id: "s", name: "S", project_id: "p" }],
    }[path];
    return new Response(JSON.stringify({ results, next_cursor: null }));
  };
  try {
    const { GET } = await import("../api/tasks.js");
    const real = await (await GET(new Request("https://x/api/tasks", { headers: { "x-dash-key": "k" } }))).json();
    const sample = demo.tasks(today);
    assert.deepEqual(Object.keys(sample).sort(), Object.keys(real).sort());
    for (const t of sample.tasks) assert.deepEqual(Object.keys(t).sort(), Object.keys(real.tasks[0]).sort());
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("sample calendar events have the /api/calendar shape", () => {
  const from = new Date(today); from.setDate(from.getDate() - 7);
  const to = new Date(today); to.setDate(to.getDate() + 35);
  const cal = demo.calendar(from, to);
  assert.deepEqual(Object.keys(cal).sort(), ["errors", "events", "failed"]);
  assert.ok(cal.events.length > 20);
  for (const e of cal.events) {
    assert.deepEqual(Object.keys(e).sort(), ["allDay", "calendar", "end", "start", "title"]);
    assert.ok(e.allDay ? /^\d{4}-\d\d-\d\d$/.test(e.start) : !Number.isNaN(Date.parse(e.start)));
  }
});

test("sample tasks fill every Planner bucket with the real task rules", async () => {
  const topics = JSON.parse(read("config/topics.json"));
  const ctx = loadScript("task-rules.js", { fetch: async () => ({ ok: true, json: async () => topics }) });
  const rules = ctx.__out;
  await rules.ready();
  const prepared = rules.prepare(demo.tasks(today));
  const b = rules.buckets(prepared.tasks, today);
  for (const k of ["crit", "quick", "big", "other"]) assert.ok(b[k].length > 0, `${k} bucket is empty`);
  assert.ok(prepared.all.some((t) => t.system) && !prepared.tasks.some((t) => t.system), "@system task is hidden");
  assert.ok(prepared.tasks.some((t) => rules.homeTitle(t) !== t.content), "a private topic is hidden on Home");
});

test("sample weather has five days starting today", () => {
  const w = demo.weather(today);
  assert.equal(w.data.daily.time.length, 5);
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  assert.equal(w.data.daily.time[0], ymd);
});

test("the demo contains nothing personal from config.js", () => {
  const ctx = loadScript("config.js");
  const cfg = ctx.window.CORTEX_CONFIG;
  const personal = [
    cfg.userName, cfg.weather.name, cfg.brainFolderId, cfg.googleClientId, cfg.spotifyPlaylistUrl.split("/").pop(),
    ...cfg.launchers.map((l) => l.url).filter((u) => /drive\.google\.com\/(file|drive\/folders)/.test(u)).map((u) => u.match(/[-\w]{25,}/)[0]),
    "WasteOfADrumBum", "cortex-brain-task", "Joshua", "One Small",
  ];
  const now = new Date();
  const everything = JSON.stringify({
    notes: demo.notes(now), storage: demo.storage, tasks: demo.tasks(today), calendar: demo.calendar(today, new Date(today.getTime() + 40 * 864e5)),
    weather: demo.weather(today), finances: demo.finances(today), news: demo.news(now), playlist: demo.playlist,
  }) + read("src/demo/mode.js");
  for (const p of personal) assert.ok(!everything.includes(p), `demo data mentions "${p}"`);
});

test("/demo routes: every tab is rewritten and sent with noindex", () => {
  const v = JSON.parse(read("vercel.json"));
  assert.ok(v.rewrites.some((r) => r.source === "/demo" && r.destination === "/"));
  const tabs = v.rewrites.find((r) => r.source.startsWith("/demo/:tab")).source;
  for (const t of ["planner", "finances", "news", "vault", "ops"]) assert.ok(tabs.includes(t), `/demo/${t} missing`);
  for (const src of ["/demo", "/demo/:path*"]) {
    const h = v.headers.find((x) => x.source === src);
    assert.ok(h?.headers.some((x) => x.key === "X-Robots-Tag" && x.value === "noindex"), `${src} lacks noindex`);
  }
  const files = readdirSync(root);
  for (const f of files.filter((n) => /sitemap/i.test(n))) assert.ok(!read(f).includes("/demo"), `${f} lists /demo`);
});

test("the old Preview mode is gone", () => {
  for (const f of ["header.js", "brain.js", "home.js", "home-desk.js", "planner.js", "vault.js", "ops.js", "index.html"]) {
    const s = read(f);
    assert.ok(!s.includes("btn-demo") && !s.includes("cortex.preview") && !/press Preview/.test(s), `${f} still has Preview`);
  }
});
