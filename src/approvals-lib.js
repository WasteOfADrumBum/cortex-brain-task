// Approvals: the rules the browser and the /api/approvals route share. A proposal comes from the morning
// briefing's "## Proposals" block; nothing runs until Joshua approves it, and the server checks it again here.
// v1 allows five actions on Todoist and Calendar and never deletes anything.

/** @typedef {import('./types').Proposal} Proposal */

export const ALLOWED = ['todoist.create', 'todoist.reschedule', 'todoist.complete', 'calendar.create', 'calendar.move'];
/** Actions that get a short Undo after they run (the reverse call is also checked and logged). */
export const UNDOABLE = ['todoist.reschedule', 'calendar.move'];
export const UNDO_SECONDS = 10;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const ID = /^[A-Za-z0-9._-]{1,80}$/;
const TARGET = /^[A-Za-z0-9_-]{1,200}$/;
const CALENDAR = /^[A-Za-z0-9._@#-]{1,200}$/;

/** A date ("2026-10-15"), a local time ("2026-10-15T20:30") or a time with an offset. */
export const isWhen = (/** @type {unknown} */ s) => typeof s === 'string' && (DATE.test(s) || LOCAL.test(s) || ZONED.test(s));
export const isDate = (/** @type {string} */ s) => DATE.test(s);

/** True when the browser or Node knows this IANA time zone. */
export function validZone(/** @type {unknown} */ tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** Minutes the zone is ahead of UTC at this instant. */
function offset(/** @type {string} */ tz, /** @type {number} */ ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  /** @type {Record<string, number>} */
  const p = {};
  for (const x of parts) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms) / 6e4;
}

/**
 * The instant (ms) a time stands for: one with an offset as written, a local time in `tz`. Null for a plain date.
 * @param {string} s @param {string} tz
 */
export function instant(s, tz) {
  if (DATE.test(s)) return null;
  if (ZONED.test(s)) return Date.parse(s);
  const [d, t] = s.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [h, mi, sec = 0] = t.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, day, h, mi, sec);
  const first = wall - offset(tz, wall) * 6e4;
  return wall - offset(tz, first) * 6e4; // a second pass settles times near a daylight-saving change
}

/** Whether two whens are the same day (plain dates) or the same minute (times). */
export function sameWhen(/** @type {string | null} */ a, /** @type {string | null} */ b, /** @type {string} */ tz) {
  if (!a || !b) return !a && !b;
  if (DATE.test(a) || DATE.test(b)) return a.slice(0, 10) === b.slice(0, 10) && DATE.test(a) === DATE.test(b);
  return Math.floor(instant(a, tz) / 6e4) === Math.floor(instant(b, tz) / 6e4);
}

const text = (/** @type {unknown} */ v, /** @type {number} */ max) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);
const bad = (/** @type {string} */ message) => /** @type {{ ok: false, supported: boolean, message: string }} */ ({ ok: false, supported: true, message });

/**
 * Checks one proposal and returns a clean copy. Unknown actions come back with supported: false, so the page can
 * show them read-only as "Not supported".
 * @param {unknown} input
 * @returns {{ ok: true, value: Proposal } | { ok: false, supported: boolean, message: string }}
 */
export function checkProposal(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bad('Not a proposal');
  const p = /** @type {Record<string, unknown>} */ (input);
  if (typeof p.id !== 'string' || !ID.test(p.id)) return bad('The proposal has no usable id');
  if (typeof p.action !== 'string' || !ALLOWED.includes(p.action)) return { ok: false, supported: false, message: 'Not supported' };
  const base = {
    id: p.id,
    reason: typeof p.reason === 'string' ? p.reason.trim().slice(0, 300) : '',
    title: typeof p.title === 'string' ? p.title.trim().slice(0, 200) : '',
  };
  const target = (/** @type {unknown} */ v) => (typeof v === 'string' && TARGET.test(v) ? v : null);
  const calendarId = p.calendarId === undefined ? 'primary' : typeof p.calendarId === 'string' && CALENDAR.test(p.calendarId) ? p.calendarId : null;
  if (!calendarId) return bad('calendarId is not usable');
  switch (p.action) {
    case 'todoist.reschedule': {
      const taskId = target(p.taskId);
      if (!taskId) return bad('taskId is missing');
      if (!isWhen(p.from) || !isWhen(p.to)) return bad('from and to must be dates or times');
      return { ok: true, value: { ...base, action: p.action, taskId, from: /** @type {string} */ (p.from), to: /** @type {string} */ (p.to) } };
    }
    case 'todoist.complete': {
      const taskId = target(p.taskId);
      if (!taskId) return bad('taskId is missing');
      return { ok: true, value: { ...base, action: p.action, taskId } };
    }
    case 'todoist.create': {
      const content = text(p.content, 300);
      if (!content) return bad('content is missing or longer than 300 characters');
      if (p.due !== undefined && p.due !== null && !isWhen(p.due)) return bad('due must be a date or a time');
      const pri = p.priority === undefined ? 'p4' : p.priority;
      if (typeof pri !== 'string' || !/^p[1-4]$/.test(pri)) return bad('priority must be p1, p2, p3 or p4');
      return { ok: true, value: { ...base, action: p.action, content, due: /** @type {string | null} */ (p.due ?? null), priority: /** @type {'p1' | 'p2' | 'p3' | 'p4'} */ (pri) } };
    }
    case 'calendar.create': {
      const title = text(p.title, 200);
      if (!title) return bad('title is missing');
      const ok = (/** @type {unknown} */ v) => isWhen(v) && !DATE.test(/** @type {string} */ (v));
      if (!ok(p.start) || !ok(p.end)) return bad('start and end must be times');
      return { ok: true, value: { ...base, title, action: p.action, calendarId, start: /** @type {string} */ (p.start), end: /** @type {string} */ (p.end) } };
    }
    case 'calendar.move': {
      const eventId = target(p.eventId);
      if (!eventId) return bad('eventId is missing');
      const ok = (/** @type {unknown} */ v) => isWhen(v) && !DATE.test(/** @type {string} */ (v));
      if (!ok(p.from) || !ok(p.to)) return bad('from and to must be times (all-day events are not moved here)');
      return { ok: true, value: { ...base, action: p.action, calendarId, eventId, from: /** @type {string} */ (p.from), to: /** @type {string} */ (p.to) } };
    }
  }
  return { ok: false, supported: false, message: 'Not supported' };
}

/** The undo of a reschedule or move: the same change in the other direction. */
export function reverse(/** @type {Proposal} */ p) {
  if (p.action !== 'todoist.reschedule' && p.action !== 'calendar.move') return null;
  return { ...p, from: p.to, to: p.from };
}

/** A when in plain words, as written (a local time is shown as its wall-clock time). */
export function fmtWhen(/** @type {string | null | undefined} */ s) {
  if (!s) return 'no date';
  const [d, t] = s.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const dateText = (/** @type {Date} */ x) => x.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (!t) return dateText(new Date(y, m - 1, day));
  const at = ZONED.test(s) ? new Date(s) : new Date(y, m - 1, day, ...t.split(':').map(Number).slice(0, 2));
  return `${dateText(at)}, ${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/** What a card says: the action in plain words, its target, and before and after where they apply. */
export function describe(/** @type {Proposal} */ p) {
  const name = p.title || '';
  switch (p.action) {
    case 'todoist.reschedule': return { verb: 'Reschedule task', target: name || 'Todoist task', before: fmtWhen(p.from), after: fmtWhen(p.to) };
    case 'todoist.complete': return { verb: 'Complete task', target: name || 'Todoist task', before: 'Open', after: 'Done' };
    case 'todoist.create': return { verb: 'Add task', target: p.content, before: null, after: `${p.due ? `Due ${fmtWhen(p.due)}` : 'No date'}, ${p.priority.toUpperCase()}` };
    case 'calendar.move': return { verb: 'Move event', target: name || 'Calendar event', before: fmtWhen(p.from), after: fmtWhen(p.to) };
    case 'calendar.create': return { verb: 'Add event', target: p.title, before: null, after: `${fmtWhen(p.start)} to ${fmtWhen(p.end).split(', ').pop()}` };
  }
  return { verb: 'Unknown', target: '', before: null, after: null };
}
