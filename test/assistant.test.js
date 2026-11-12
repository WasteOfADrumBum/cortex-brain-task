// Assistant: briefing parsing, the priority rules, the approvals allowlist and the decision engine against fakes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkProposal, sameWhen, instant, reverse, describe as describeProposal, ALLOWED } from "../src/approvals-lib.js";
import { parseBriefing, pickBriefing } from "../src/briefing-lib.js";
import { rank, DEFAULTS } from "../src/priorities-lib.js";
import { decide } from "../api/_approvals-run.js";
import demo from "../src/demo/index.js";

const TZ = "America/New_York";

test("the allowlist has exactly the five v1 actions and no deletes", () => {
  assert.deepEqual(ALLOWED, ["todoist.create", "todoist.reschedule", "todoist.complete", "calendar.create", "calendar.move"]);
  const r = checkProposal({ id: "p-1", action: "todoist.delete", taskId: "1" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.supported, false);
});

test("proposals are checked field by field", () => {
  assert.equal(checkProposal({ id: "p-1", action: "todoist.reschedule", taskId: "123", from: "2026-10-14T18:00", to: "2026-10-15T20:30" }).ok, true);
  assert.equal(checkProposal({ id: "p-1", action: "todoist.reschedule", taskId: "123", from: "tomorrow", to: "2026-10-15" }).ok, false);
  assert.equal(checkProposal({ id: "bad id!", action: "todoist.complete", taskId: "1" }).ok, false);
  assert.equal(checkProposal({ id: "p-2", action: "todoist.create", content: "x", priority: 1 }).ok, false, "priority must be p1-p4");
  const c = checkProposal({ id: "p-3", action: "todoist.create", content: " Call back ", priority: "p2" });
  assert.equal(c.ok === true && c.value.action === "todoist.create" && c.value.content, "Call back");
  assert.equal(checkProposal({ id: "p-4", action: "calendar.move", eventId: "e1", from: "2026-10-14", to: "2026-10-15" }).ok, false, "all-day moves are refused");
  const m = checkProposal({ id: "p-5", action: "calendar.move", eventId: "e1", from: "2026-10-14T09:30", to: "2026-10-14T10:00" });
  assert.equal(m.ok === true && m.value.action === "calendar.move" && m.value.calendarId, "primary");
  assert.equal(checkProposal([]).ok, false);
});

test("times compare across offsets and daylight saving", () => {
  assert.equal(sameWhen("2026-10-14T18:00", "2026-10-14T22:00:00Z", TZ), true);
  assert.equal(sameWhen("2026-10-14T18:00:00", "2026-10-14T18:00", TZ), true);
  assert.equal(sameWhen("2026-10-14", "2026-10-14T00:00", TZ), false);
  assert.equal(sameWhen(null, null, TZ), true);
  assert.equal(new Date(instant("2026-12-01T09:00", TZ)).toISOString(), "2026-12-01T14:00:00.000Z");
  assert.equal(new Date(instant("2026-07-01T09:00", TZ)).toISOString(), "2026-07-01T13:00:00.000Z");
  assert.equal(instant("2026-07-01", TZ), null);
});

test("undo reverses a reschedule; cards describe the change in words", () => {
  const p = /** @type {any} */ (checkProposal({ id: "p-1", action: "todoist.reschedule", taskId: "1", from: "2026-10-14", to: "2026-10-15", title: "Taxes" })).value;
  assert.deepEqual([reverse(p).from, reverse(p).to], ["2026-10-15", "2026-10-14"]);
  const d = describeProposal(p);
  assert.equal(d.verb, "Reschedule task");
  assert.equal(d.target, "Taxes");
  assert.match(d.after, /Oct 15/);
});

test("the briefing is read section by section, and bad proposals are reported, not thrown", () => {
  const files = demo.briefing(new Date(2026, 9, 13, 8));
  const b = parseBriefing(files[0].text);
  assert.equal(b.date, "2026-10-13");
  assert.match(b.summary, /steady day/);
  assert.equal(b.attention.length, 2);
  assert.equal(b.email.length, 2);
  assert.equal(b.proposals.length, 3);
  assert.deepEqual(b.unsupported.map((u) => u.action), ["todoist.delete"]);
  assert.deepEqual(b.problems, []);
  const broken = parseBriefing("## Summary\nOk.\n\n## Proposals\n```json\n[{ nope\n```\n");
  assert.equal(broken.proposals.length, 0);
  assert.match(broken.problems[0], /not valid JSON/);
  assert.match(parseBriefing("").problems[0], /no Summary/);
});

test("today's briefing is picked, with the newest earlier one as the fallback", () => {
  const files = [{ name: "2026-10-12.md" }, { name: "notes.md" }, { name: "2026-10-14.md" }, { name: "2026-10-11.md" }];
  assert.deepEqual(pickBriefing(files, new Date(2026, 9, 13)), { today: null, latest: { name: "2026-10-12.md" } });
  assert.equal(pickBriefing([...files, { name: "2026-10-13.md" }], new Date(2026, 9, 13)).today.name, "2026-10-13.md");
});

test("the priority config file matches the defaults' shape", () => {
  const cfg = JSON.parse(readFileSync(new URL("../config/priorities.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(cfg.weights).sort(), Object.keys(DEFAULTS.weights).sort());
});

test("Top 3 ranks by the rules and names the strongest rule as the why", () => {
  const today = new Date(2026, 9, 13);
  const day = (n) => new Date(2026, 9, 13 + n);
  const t = (over) => ({ priority: 1, duration: null, size: null, dueDay: null, updatedAt: null, ...over });
  const tasks = [
    t({ id: "a", dueDay: day(-1) }),
    t({ id: "b", dueDay: day(0), priority: 4 }),
    t({ id: "c", priority: 3, duration: 60 }),
    t({ id: "d", duration: 10 }),
    t({ id: "e" }),
    t({ id: "f", system: true, dueDay: day(-3) }),
  ];
  const withBlock = rank(tasks, { today, openMinutes: 120 });
  assert.deepEqual(withBlock.map((r) => r.task.id), ["b", "a", "c"]);
  assert.equal(withBlock[0].why, "Due today");
  assert.equal(withBlock[2].why, "Fits today's largest open block");
  const noBlock = rank(tasks, { today, openMinutes: null }, 10);
  assert.ok(noBlock.some((r) => r.task.id === "d" && r.why === "Quick pickup while there is no big block"));
  assert.ok(!noBlock.some((r) => r.task.id === "e" || r.task.id === "f"));
  const old = rank([t({ id: "g", updatedAt: "2026-09-01T00:00:00Z" })], { today, now: today });
  assert.equal(old[0].why, "Untouched for over 2 weeks");
});

// ---------- the decision engine, against fakes ----------
function fakes(overrides = {}) {
  const calls = [];
  let state = {};
  const audits = [];
  const tasks = { "123": { id: "123", done: false, due: "2026-10-14T18:00:00", recurring: false } };
  const events = { e1: { id: "e1", cancelled: false, allDay: false, start: "2026-10-14T09:30:00-04:00", end: "2026-10-14T10:00:00-04:00", timeZone: TZ } };
  let clock = Date.parse("2026-10-13T11:00:00Z");
  const deps = {
    now: () => clock,
    readState: async () => structuredClone(state),
    writeState: async (s) => { state = structuredClone(s); },
    audit: async (line) => { audits.push(line); },
    todoist: {
      getTask: async (id) => tasks[id] ? { ...tasks[id] } : null,
      setDue: async (id, when) => { calls.push(["setDue", id, when]); tasks[id].due = when; },
      close: async (id) => { calls.push(["close", id]); tasks[id].done = true; },
      create: async (p) => { calls.push(["create", p.content]); return "new-1"; },
    },
    calendar: {
      getEvent: async (cal, id) => events[id] ? { ...events[id] } : null,
      moveEvent: async (cal, id, start, end) => { calls.push(["move", id, start, end]); events[id].start = start; events[id].end = end; },
      createEvent: async (cal, e) => { calls.push(["createEvent", e.title, e.start]); return "ev-new"; },
    },
    ...overrides,
  };
  return { deps, calls, audits, tasks, events, get state() { return state; }, tick: (ms) => { clock += ms; } };
}
const resched = { id: "p-1", action: "todoist.reschedule", taskId: "123", from: "2026-10-14T18:00", to: "2026-10-15T20:30", reason: "r" };

test("approving a reschedule moves the task, logs it, and Undo moves it back", async () => {
  const f = fakes();
  const r = await decide({ id: "p-1", decision: "approve", proposal: resched, tz: TZ }, f.deps);
  assert.equal(r.status, 200);
  assert.equal(r.body.undoSeconds, 10);
  assert.deepEqual(f.calls[0], ["setDue", "123", "2026-10-15T20:30"]);
  assert.equal(f.state["p-1"].status, "approved");
  assert.deepEqual(Object.keys(f.audits[0]).sort(), ["action", "at", "decision", "id", "result", "targetId"]);
  assert.equal(f.audits[0].result, "executed");
  f.tick(5000);
  const u = await decide({ id: "p-1", decision: "undo", proposal: resched, tz: TZ }, f.deps);
  assert.equal(u.status, 200);
  assert.deepEqual(f.calls[1], ["setDue", "123", "2026-10-14T18:00"]);
  assert.equal(f.state["p-1"].status, "undone");
  assert.equal(f.audits[1].decision, "undo");
  const again = await decide({ id: "p-1", decision: "approve", proposal: resched, tz: TZ }, f.deps);
  assert.equal(again.status, 409, "a decided card can't run twice");
});

test("Undo runs out, and undo uses the server's copy of what ran", async () => {
  const f = fakes();
  await decide({ id: "p-1", decision: "approve", proposal: resched, tz: TZ }, f.deps);
  const tampered = await decide({ id: "p-1", decision: "undo", proposal: { ...resched, from: "2026-01-01" }, tz: TZ }, f.deps);
  assert.equal(tampered.status, 200);
  assert.deepEqual(f.calls[1], ["setDue", "123", "2026-10-14T18:00"]);
  const g = fakes();
  await decide({ id: "p-1", decision: "approve", proposal: resched, tz: TZ }, g.deps);
  g.tick(5 * 60e3);
  assert.equal((await decide({ id: "p-1", decision: "undo", proposal: resched, tz: TZ }, g.deps)).status, 409);
});

test("a task that changed since the briefing is refused as stale and nothing runs", async () => {
  const f = fakes();
  f.tasks["123"].due = "2026-10-16";
  const r = await decide({ id: "p-1", decision: "approve", proposal: resched, tz: TZ }, f.deps);
  assert.equal(r.status, 409);
  assert.match(String(r.body.error), /^Stale, review again/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.state["p-1"].status, "stale");
  assert.equal(f.audits[0].result, "stale");
  f.tasks["123"].recurring = true;
  f.tasks["123"].due = "2026-10-14T18:00:00";
  assert.equal((await decide({ id: "p-1", decision: "approve", proposal: resched, tz: TZ }, f.deps)).status, 422, "recurring tasks are refused");
});

test("reject runs nothing; unsupported and mismatched proposals are refused before anything is read", async () => {
  const f = fakes();
  const r = await decide({ id: "p-1", decision: "reject", proposal: resched, tz: TZ }, f.deps);
  assert.equal(r.status, 200);
  assert.equal(f.calls.length, 0);
  assert.equal(f.audits[0].result, "rejected");
  assert.equal((await decide({ id: "x", decision: "approve", proposal: { id: "x", action: "todoist.delete", taskId: "123" } }, f.deps)).status, 422);
  assert.equal((await decide({ id: "other", decision: "approve", proposal: resched }, f.deps)).status, 400);
  assert.equal((await decide({ id: "p-1", decision: "maybe", proposal: resched }, f.deps)).status, 400);
});

test("a calendar move keeps the event's length, and creates return the new id", async () => {
  const f = fakes();
  const mv = { id: "p-5", action: "calendar.move", eventId: "e1", from: "2026-10-14T09:30", to: "2026-10-14T11:00" };
  const r = await decide({ id: "p-5", decision: "approve", proposal: mv, tz: TZ }, f.deps);
  assert.equal(r.status, 200);
  assert.deepEqual(f.calls[0], ["move", "e1", "2026-10-14T15:00:00.000Z", "2026-10-14T15:30:00.000Z"]);
  const c = await decide({ id: "p-6", decision: "approve", proposal: { id: "p-6", action: "todoist.create", content: "Call", priority: "p2" }, tz: TZ }, f.deps);
  assert.equal(c.body.targetId, "new-1");
  assert.equal(c.body.undoSeconds, 0);
});
