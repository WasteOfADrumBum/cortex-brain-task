// Finances: the shared payload rules, shrink warnings and summaries, and both save routes against a fake Drive.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFinance, shrinkWarnings, summarize } from "../src/finance-lib.js";
import demo from "../src/demo/index.js";

const sample = () => ({
  month: "2026-10", periodStart: "2026-10-01", periodEnd: "2026-10-13", source: "chatgpt", generatedAt: "2026-10-13T07:00:00-04:00",
  totals: { in: 4200.004, out: 1800.5 },
  coverage: [{ account: "Checking ...4417", status: "complete" }],
  income: [{ name: "Paycheck", amount: 2100, date: "2026-10-01" }],
  bills: [{ name: "Electric", amount: 92.1, due: "2026-10-20", paid: false, category: "utilities" }, { name: "Rent", amount: 1450, due: "2026-10-01", paid: true }],
  notes: "Quiet month.",
  extra: "dropped",
});

test("a valid month passes, cleaned up", () => {
  const r = validateFinance(sample());
  assert.equal(r.ok, true);
  assert.equal(r.value.totals.in, 4200);
  assert.equal(r.value.extra, undefined);
  assert.equal(r.value.bills[0].category, "utilities");
});

test("account-like numbers are refused and the field is named, with or without spaces", () => {
  const a = sample(); a.bills[1].name = "Rent 123456789";
  assert.deepEqual([validateFinance(a).ok, validateFinance(a).field], [false, "bills[1].name"]);
  const b = sample(); b.coverage[0].account = "Card 4111 1111 1111 1111";
  assert.equal(validateFinance(b).field, "coverage[0].account");
  const c = sample(); c.notes = "Paid on 2026-10-13 at 07:00";
  assert.equal(validateFinance(c).ok, true, "dates and times are not account numbers");
});

test("each rule names its field", () => {
  const cases = [
    [(o) => { o.month = "2026-13"; }, "month"],
    [(o) => { o.periodEnd = "2026-11-01"; }, "periodStart"],
    [(o) => { o.bills[0].amount = "92"; }, "bills[0].amount"],
    [(o) => { o.bills[0].paid = "no"; }, "bills[0].paid"],
    [(o) => { o.bills[0].name = "x".repeat(61); }, "bills[0].name"],
    [(o) => { o.coverage[0].status = "ok"; }, "coverage[0].status"],
    [(o) => { o.bills = Array.from({ length: 101 }, () => o.bills[0]); }, "bills"],
    [(o) => { delete o.totals; }, "totals"],
  ];
  for (const [change, field] of cases) { const o = sample(); change(o); assert.equal(validateFinance(o).field, field); }
  assert.equal(validateFinance([]).ok, false);
});

test("shrink warnings and the summary", () => {
  const prev = validateFinance(sample()).value;
  const next = structuredClone(prev);
  next.bills.pop();
  next.coverage[0].status = "delayed";
  assert.equal(shrinkWarnings(prev, next).length, 2);
  assert.deepEqual(shrinkWarnings(null, prev), []);
  const s = summarize(prev, new Date("2026-10-15T12:00:00Z"));
  assert.equal(s.net, 2399.5);
  assert.equal(s.billsPaid, 1);
  assert.deepEqual(s.dueSoon.map((b) => b.name), ["Electric"]);
  const late = summarize(prev, new Date("2026-10-25T12:00:00Z"));
  assert.deepEqual(late.overdue.map((b) => b.name), ["Electric"]);
});

test("the demo year is valid month by month", () => {
  const y = demo.finances(new Date());
  assert.ok(y.months.length >= 1);
  for (const m of y.months) { const { savedAt, ...month } = m; assert.equal(validateFinance(month).ok, true, `${m.month}: ${validateFinance(month).message}`); }
});

// A fake Drive: files by id with name, parents and content; enough of the REST API for api/_drive.js.
function fakeDrive() {
  const files = new Map();
  let n = 0;
  const send = (b, status = 200) => new Response(typeof b === "string" ? b : JSON.stringify(b), { status });
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.host === "oauth2.googleapis.com") return send({ access_token: "a", expires_in: 3600 });
    if (u.pathname === "/drive/v3/files" && (init.method || "GET") === "GET") {
      const q = u.searchParams.get("q");
      const parent = q.match(/'([^']+)' in parents/)[1];
      const contains = q.match(/name contains '([^']+)'/)?.[1] || "";
      return send({ files: [...files.values()].filter((f) => f.parents[0] === parent && f.name.includes(contains)).map(({ id, name }) => ({ id, name })) });
    }
    if (u.pathname === "/drive/v3/files" && init.method === "POST") {
      const meta = JSON.parse(init.body);
      const id = `f${++n}`; files.set(id, { id, name: meta.name, parents: meta.parents, content: "" });
      return send({ id });
    }
    if (u.pathname === "/upload/drive/v3/files") {
      const meta = JSON.parse(init.body.split("\r\n\r\n")[1].split("\r\n")[0]);
      const content = init.body.split("\r\n\r\n")[2].replace(/\r\n--cortex\w+--$/, "");
      const id = `f${++n}`; files.set(id, { id, name: meta.name, parents: meta.parents, content });
      return send({ id });
    }
    const m = u.pathname.match(/\/files\/(f\d+)$/);
    if (m && init.method === "PATCH") { files.get(m[1]).content = init.body; return send({}); }
    if (m && u.searchParams.get("alt") === "media") return send(files.get(m[1]).content);
    return send({}, 404);
  };
  return { files, fetch, byName: (name) => [...files.values()].find((f) => f.name === name) };
}

test("paste save: checks, asks before shrinking, keeps the previous copy and logs counts only", async () => {
  Object.assign(process.env, { DASH_KEY: "k", GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s", GOOGLE_REFRESH_TOKEN: "r" });
  const drive = fakeDrive();
  const real = globalThis.fetch;
  globalThis.fetch = drive.fetch;
  try {
    const { POST, GET } = await import("../api/finance.js");
    const post = (data, confirm = false) => POST(new Request("https://x/api/finance", { method: "POST", headers: { "x-dash-key": "k" }, body: JSON.stringify({ data, confirm }) }));
    const first = await post(sample());
    assert.equal(first.status, 200, JSON.stringify(await first.clone().json()));
    assert.equal((await first.json()).bills, 2);

    const smaller = sample(); smaller.bills.pop();
    const asked = await post(smaller);
    assert.equal(asked.status, 409);
    assert.equal((await asked.json()).warnings.length, 1);
    assert.equal((await post(smaller, true)).status, 200);
    assert.equal(JSON.parse(drive.byName("2026-10.prev.json").content).bills.length, 2, "previous copy kept");
    assert.equal(JSON.parse(drive.byName("2026-10.json").content).bills.length, 1);
    const log = drive.byName(`ingest-${new Date().toISOString().slice(0, 7)}.jsonl`).content.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(log.length, 2);
    assert.ok(!JSON.stringify(log).includes("1450"), "the log never holds amounts");

    const bad = sample(); bad.bills[0].name = "Card 12345678";
    const r = await post(bad);
    assert.equal(r.status, 422);
    const body = await r.json();
    assert.equal(body.field, "bills[0].name");
    assert.ok(!JSON.stringify(body).includes("12345678"), "the error never echoes the value");

    const year = await (await GET(new Request("https://x/api/finance?year=2026", { headers: { "x-dash-key": "k" } }))).json();
    assert.deepEqual(year.months.map((m) => m.month), ["2026-10"]);
    assert.ok(year.months[0].savedAt);
  } finally {
    globalThis.fetch = real;
  }
});

test("ingest: bearer token, 422 for an account-like number, 20 calls an hour", async () => {
  Object.assign(process.env, { CORTEX_INGEST_TOKEN: "tok" });
  const drive = fakeDrive();
  const real = globalThis.fetch;
  globalThis.fetch = drive.fetch;
  try {
    const { POST } = await import("../api/ingest/finance.js");
    const call = (body, token = "tok") => POST(new Request("https://x/api/ingest/finance", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
    assert.equal((await call(sample(), "wrong")).status, 401);
    const bad = sample(); bad.income[0].name = "Pay 000011112222";
    assert.equal((await call(bad)).status, 422);
    let last;
    for (let i = 0; i < 19; i++) last = await call(sample());
    assert.equal(last.status, 200);
    assert.equal((await call(sample())).status, 429);
  } finally {
    globalThis.fetch = real;
  }
});

test("saving without Drive set up says so plainly", async () => {
  const keep = process.env.GOOGLE_REFRESH_TOKEN;
  delete process.env.GOOGLE_REFRESH_TOKEN;
  try {
    const { checkAndSave } = await import("../api/_finance-save.js");
    const res = await checkAndSave(sample(), { confirm: true, via: "paste" });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /GOOGLE_REFRESH_TOKEN/);
  } finally {
    process.env.GOOGLE_REFRESH_TOKEN = keep;
  }
});
