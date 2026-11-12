// The approvals decision: re-check the proposal against the allowlist, re-read the target (stale check), run the
// change, remember the decision and write the audit line. Everything outside comes in as `deps`, so the tests can
// run it against fakes. Files starting with "_" are not Vercel functions.
import { checkProposal, reverse, sameWhen, instant, validZone, UNDOABLE, UNDO_SECONDS } from '../src/approvals-lib.js';
import { UpstreamError } from './_upstream.js';

/** @typedef {import('../src/types').Proposal} Proposal */
/** @typedef {import('../src/types').ApprovalRecord} ApprovalRecord */
/**
 * @typedef {{
 *   readState(): Promise<Record<string, ApprovalRecord>>,
 *   writeState(s: Record<string, ApprovalRecord>): Promise<void>,
 *   audit(line: { at: string, id: string, action: string, targetId: string | null, decision: string, result: string }): Promise<void>,
 *   todoist: {
 *     getTask(id: string): Promise<{ id: string, done: boolean, due: string | null, recurring: boolean } | null>,
 *     setDue(id: string, when: string, tz: string): Promise<void>,
 *     close(id: string): Promise<void>,
 *     create(p: { content: string, due: string | null, priority: string }, tz: string): Promise<string>,
 *   },
 *   calendar: {
 *     getEvent(cal: string, id: string): Promise<{ id: string, cancelled: boolean, allDay: boolean, start: string | null, end: string | null, timeZone: string | null } | null>,
 *     moveEvent(cal: string, id: string, start: string, end: string, tz: string | null): Promise<void>,
 *     createEvent(cal: string, e: { title: string, start: string, end: string }): Promise<string>,
 *   },
 *   now?: () => number,
 * }} Deps
 */

/** Undo is offered for 10 seconds on the page; the server allows a little longer for a slow network. */
const UNDO_GRACE_MS = (UNDO_SECONDS + 50) * 1000;
const FINAL = ['approved', 'rejected', 'undone'];

class Stale extends Error {}
class Refused extends Error {}

/** Throws Stale when the target no longer matches the proposal; Refused when v1 won't touch it. */
async function staleCheck(/** @type {Proposal} */ p, /** @type {Deps} */ deps, /** @type {string} */ tz) {
  if (p.action === 'todoist.reschedule' || p.action === 'todoist.complete') {
    const t = await deps.todoist.getTask(p.taskId);
    if (!t) throw new Stale('The task is gone from Todoist.');
    if (t.done) throw new Stale('The task is already done.');
    if (p.action === 'todoist.reschedule') {
      if (t.recurring) throw new Refused('Recurring tasks are not rescheduled here; change it in Todoist.');
      if (!sameWhen(t.due, p.from, tz)) throw new Stale('The task was moved since the briefing was written.');
    }
    return;
  }
  if (p.action === 'calendar.move') {
    const e = await deps.calendar.getEvent(p.calendarId, p.eventId);
    if (!e || e.cancelled) throw new Stale('The event is gone from the calendar.');
    if (e.allDay) throw new Refused('All-day events are not moved here.');
    if (!sameWhen(e.start, p.from, tz)) throw new Stale('The event was moved since the briefing was written.');
  }
}

/** Runs a checked proposal. @returns {Promise<string | null>} the target id (a new id for creates) */
async function execute(/** @type {Proposal} */ p, /** @type {Deps} */ deps, /** @type {string} */ tz) {
  switch (p.action) {
    case 'todoist.reschedule': await deps.todoist.setDue(p.taskId, p.to, tz); return p.taskId;
    case 'todoist.complete': await deps.todoist.close(p.taskId); return p.taskId;
    case 'todoist.create': return deps.todoist.create(p, tz);
    case 'calendar.create': {
      const start = new Date(instant(p.start, tz)).toISOString();
      const end = new Date(instant(p.end, tz)).toISOString();
      if (end <= start) throw new Refused('The event ends before it starts.');
      return deps.calendar.createEvent(p.calendarId, { title: p.title, start, end });
    }
    case 'calendar.move': {
      const e = await deps.calendar.getEvent(p.calendarId, p.eventId);
      if (!e?.start || !e.end) throw new Stale('The event is gone from the calendar.');
      const length = Date.parse(e.end) - Date.parse(e.start);
      const start = instant(p.to, tz);
      await deps.calendar.moveEvent(p.calendarId, p.eventId, new Date(start).toISOString(), new Date(start + length).toISOString(), e.timeZone);
      return p.eventId;
    }
  }
  return null;
}

const targetOf = (/** @type {Proposal} */ p) => ('taskId' in p ? p.taskId : 'eventId' in p ? p.eventId : null);

/**
 * @param {unknown} body { id, decision: "approve" | "reject" | "undo", proposal, tz }
 * @param {Deps} deps
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function decide(body, deps) {
  const now = (deps.now || Date.now)();
  const at = new Date(now).toISOString();
  const { id, decision, proposal, tz: zone } = /** @type {Record<string, any>} */ (body || {});
  if (!['approve', 'reject', 'undo'].includes(decision)) return { status: 400, body: { error: 'decision must be approve, reject or undo' } };
  const tz = validZone(zone) ? zone : 'UTC';
  const checked = checkProposal(proposal);
  if (checked.ok === false) return { status: 422, body: { error: checked.supported ? checked.message : 'Not supported, so nothing was changed' } };
  const p = checked.value;
  if (p.id !== id) return { status: 400, body: { error: 'The id does not match the proposal' } };

  const state = await deps.readState();
  const prior = state[id];
  /** @param {ApprovalRecord} rec @param {string} result */
  const remember = async (rec, result, decisionName = decision) => {
    state[id] = rec;
    await deps.writeState(state);
    await deps.audit({ at, id, action: rec.action, targetId: rec.targetId, decision: decisionName, result });
  };

  if (decision === 'undo') {
    if (!prior || prior.status !== 'approved' || !prior.proposal || !UNDOABLE.includes(prior.proposal.action)) return { status: 409, body: { error: 'There is nothing to undo for this proposal' } };
    if (!prior.undoUntil || now > Date.parse(prior.undoUntil)) return { status: 409, body: { error: 'Undo has run out; change it in Todoist or Calendar' } };
    const back = /** @type {Proposal} */ (reverse(prior.proposal)); // the server's copy of what ran, not the page's
    try {
      await staleCheck(back, deps, tz);
      await execute(back, deps, tz);
    } catch (e) {
      const msg = e instanceof Stale || e instanceof Refused || e instanceof UpstreamError ? e.message : 'Undo failed';
      await deps.audit({ at, id, action: back.action, targetId: targetOf(back), decision: 'undo', result: e instanceof Stale ? 'stale' : 'failed' });
      if (!(e instanceof Stale || e instanceof Refused || e instanceof UpstreamError)) throw e;
      return { status: e instanceof UpstreamError ? 502 : 409, body: { error: `Not undone: ${msg}` } };
    }
    await remember({ ...prior, status: 'undone', at, undoUntil: undefined }, 'undone');
    return { status: 200, body: { status: 'undone' } };
  }

  if (prior && FINAL.includes(prior.status)) return { status: 409, body: { error: `Already ${prior.status}`, status: prior.status } };

  if (decision === 'reject') {
    await remember({ status: 'rejected', at, action: p.action, targetId: targetOf(p) }, 'rejected');
    return { status: 200, body: { status: 'rejected' } };
  }

  let targetId = null;
  try {
    await staleCheck(p, deps, tz);
    targetId = await execute(p, deps, tz);
  } catch (e) {
    if (e instanceof Stale) {
      await remember({ status: 'stale', at, action: p.action, targetId: targetOf(p), note: e.message }, 'stale');
      return { status: 409, body: { status: 'stale', error: `Stale, review again: ${e.message}` } };
    }
    if (e instanceof Refused) {
      await deps.audit({ at, id, action: p.action, targetId: targetOf(p), decision, result: 'refused' });
      return { status: 422, body: { error: e.message } };
    }
    if (e instanceof UpstreamError) {
      await remember({ status: 'failed', at, action: p.action, targetId: targetOf(p), note: e.message }, 'failed');
      return { status: 502, body: { status: 'failed', error: e.message } };
    }
    throw e;
  }
  const undoable = UNDOABLE.includes(p.action);
  await remember({ status: 'approved', at, action: p.action, targetId, proposal: p, ...(undoable ? { undoUntil: new Date(now + UNDO_GRACE_MS).toISOString() } : {}) }, 'executed');
  return { status: 200, body: { status: 'approved', targetId, undoSeconds: undoable ? UNDO_SECONDS : 0 } };
}
