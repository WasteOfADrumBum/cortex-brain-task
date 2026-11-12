// The Assistant, shared by Home and the Briefing page: reads the morning briefing from Drive (in the browser, with
// the read-only Drive link), reads which proposals were already decided (/api/approvals), and draws approval cards
// with Approve and Reject. Nothing changes in Todoist or Calendar until a card is approved; the server checks every
// proposal again. Results are announced in a polite live region, focus moves to a sensible place after each action,
// and reschedules and moves get a 10-second Undo. In /demo the buttons are data-write, so they show "Demo only".
import { parseBriefing, pickBriefing, briefingDate } from "/src/briefing-lib.js";
import { describe, UNDO_SECONDS } from "/src/approvals-lib.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const key = () => { try { return localStorage.getItem("dashKey") || ""; } catch { return ""; } };
const DONE = ["approved", "rejected", "undone"];
const dayText = (ymd) => new Date(`${ymd}T12:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

/**
 * Today's briefing. Returns { state, briefing, file, latest, folder, message }:
 *   state "ok" (today's file read), "none" (no file today; latest is the newest earlier one), "idle" (Drive not
 *   linked) or "error"; message is a sentence safe to show for every state but "ok".
 */
export async function loadBriefing(now = new Date()) {
  let files, folder = null;
  if (Demo.on) files = (await Demo.data()).briefing(now);
  else {
    if (!Drive.linked()) return { state: "idle", message: "Link Drive to see the morning briefing." };
    try { ({ files, folder } = await Drive.briefings()); } catch (e) { return { state: "error", message: `The briefing couldn't be read: ${e.message}` }; }
  }
  const pick = pickBriefing(files, now);
  if (!pick.today) {
    const last = pick.latest ? briefingDate(pick.latest.name) : null;
    return { state: "none", latest: pick.latest, folder, message: last ? `No briefing yet today. The last one was for ${dayText(last)}.` : "No briefing yet today, and none found in Cortex/briefings in Drive." };
  }
  let text = pick.today.text;
  if (text === undefined) {
    try { text = await Drive.readFile(pick.today); } catch (e) { return { state: "error", message: `Today's briefing couldn't be opened: ${e.message}` }; }
  }
  return { state: "ok", file: pick.today, folder, briefing: parseBriefing(text || "") };
}

// The demo keeps its decisions in memory for the page's life; nothing is saved.
const demoDecisions = {};

/** { configured, decisions } from /api/approvals, or { message } (and needKey) when it can't be read. */
export async function loadDecisions() {
  if (Demo.on) return { configured: true, decisions: demoDecisions };
  let res = null, body = null;
  try { res = await fetch("/api/approvals", { headers: key() ? { "x-dash-key": key() } : {} }); } catch { /* offline */ }
  try { body = await res?.json(); } catch { /* not JSON */ }
  if (!res) return { message: "Couldn't reach Cortex (offline or blocked), so approving is off for now." };
  if (res.status === 401) return { needKey: true, message: "Enter your dashboard key (Top 3 on Home, or the Planner) to approve proposals." };
  if (!res.ok || !body) return { message: res.status === 404 ? "The approvals route isn't deployed yet." : `Approvals unavailable: ${body?.error || `error ${res.status}`}.` };
  return body;
}

async function post(payload) {
  let res = null, body = null;
  try {
    res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "content-type": "application/json", ...(key() ? { "x-dash-key": key() } : {}) },
      body: JSON.stringify({ ...payload, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
  } catch { /* offline */ }
  try { body = await res?.json(); } catch { /* not JSON */ }
  if (!res) return { ok: false, http: 0, error: "Couldn't reach Cortex, so nothing changed." };
  return { ok: res.ok, http: res.status, undoSeconds: body?.undoSeconds || 0, error: body?.error || (res.ok ? "" : `Error ${res.status}; nothing changed.`) };
}

const pastTense = { "Reschedule task": "Rescheduled", "Complete task": "Completed", "Add task": "Added task", "Move event": "Moved", "Add event": "Added event" };

/**
 * Draws approval cards into `host` and wires them up.
 * @param {HTMLElement} host
 * @param {{ briefing, decisions: { configured?: boolean, decisions?: object, message?: string }, limit?: number,
 *           showUnsupported?: boolean, heading?: HTMLElement, idPrefix: string }} opts
 *   heading: where focus goes when no card is left (it gets tabindex="-1")
 */
export function mountApprovals(host, opts) {
  const { briefing, limit = Infinity, showUnsupported = false, idPrefix } = opts;
  const decided = opts.decisions.decisions || {};
  const canAct = Demo.on || opts.decisions.configured === true;
  const blockedNote = opts.decisions.message || (opts.decisions.configured === false
    ? "Approving isn't set up yet: the Google variables in Vercel are still missing (see the README). You can read the proposals in the meantime."
    : "");
  const live = document.createElement("p");
  live.className = "ap-live visually-hidden";
  live.setAttribute("aria-live", "polite");
  let undoTimer = 0;

  const open = () => briefing.proposals.filter((p) => !DONE.includes(decided[p.id]?.status));

  function cardHtml(p) {
    const d = describe(p);
    const id = `${idPrefix}-${p.id}`;
    const note = decided[p.id]?.status === "stale" ? `Stale, review again: ${decided[p.id].note || "the target changed."}`
      : decided[p.id]?.status === "failed" ? `Last try failed: ${decided[p.id].note || "try again."}` : "";
    const change = d.before ? `<span class="visually-hidden">From </span>${esc(d.before)} <span aria-hidden="true">→</span><span class="visually-hidden"> to</span> ${esc(d.after)}` : esc(d.after);
    return `<li class="ap-card" data-id="${esc(p.id)}">
      <p class="ap-what" id="${esc(id)}"><span class="ap-verb">${esc(d.verb)}</span> <span class="ap-target">${esc(d.target)}</span></p>
      <p class="ap-change">${change}</p>
      ${p.reason ? `<p class="ap-reason">${esc(p.reason)}</p>` : ""}
      ${note ? `<p class="ap-note">${esc(note)}</p>` : ""}
      <div class="ap-actions">
        <button type="button" class="btn btn-primary" data-act="approve" data-write="Approving a proposal" aria-describedby="${esc(id)}"${canAct ? "" : " disabled"}>Approve</button>
        <button type="button" class="btn btn-ghost" data-act="reject" data-write="Rejecting a proposal" aria-describedby="${esc(id)}"${canAct ? "" : " disabled"}>Reject</button>
      </div>
    </li>`;
  }

  function render(focusAfter) {
    const list = open();
    const shown = list.slice(0, limit);
    const count = list.length ? `${list.length} ${list.length === 1 ? "proposal waits" : "proposals wait"} for you` : "No proposals waiting";
    host.innerHTML = `
      <p class="ap-count" tabindex="-1">${count}</p>
      ${blockedNote ? `<p class="ap-blocked">${esc(blockedNote)}</p>` : ""}
      ${shown.length ? `<ul class="ap-list">${shown.map(cardHtml).join("")}</ul>` : ""}
      ${list.length > shown.length ? `<p class="hd-more">${list.length - shown.length} more on the Briefing page</p>` : ""}
      ${showUnsupported && briefing.unsupported.length ? `<h3 class="ap-sub">Not supported</h3><ul class="ap-list ap-ro">${briefing.unsupported.map((u) =>
        `<li class="ap-card ap-card-ro"><p class="ap-what"><span class="ap-verb">${esc(u.action || "Unknown action")}</span></p>${u.reason ? `<p class="ap-reason">${esc(u.reason)}</p>` : ""}<p class="ap-note">Not supported: Cortex only adds, reschedules or completes tasks and adds or moves events. Nothing was changed.</p></li>`).join("")}</ul>` : ""}
      <div class="ap-undo" hidden></div>`;
    host.append(live);
    if (focusAfter) focusAfter();
  }

  function focusNext(index) {
    return () => {
      const buttons = host.querySelectorAll('.ap-list:not(.ap-ro) [data-act="approve"]');
      const next = buttons[Math.min(index, buttons.length - 1)];
      (next || host.querySelector(".ap-count") || opts.heading)?.focus();
    };
  }

  function showUndo(p, verb) {
    const bar = host.querySelector(".ap-undo");
    if (!bar) return;
    clearTimeout(undoTimer);
    bar.hidden = false;
    bar.innerHTML = `<span>${esc(verb)} “${esc(describe(p).target)}”.</span> <button type="button" class="btn btn-ghost" data-undo="${esc(p.id)}" data-write="Undoing a change">Undo</button>`;
    undoTimer = window.setTimeout(() => { bar.hidden = true; bar.innerHTML = ""; }, UNDO_SECONDS * 1000);
  }

  // Drawing again (Home refreshes every half hour) replaces the old click handler instead of adding a second one.
  host._apAbort?.abort();
  const ac = new AbortController();
  host._apAbort = ac;
  host.addEventListener("click", async (e) => {
    const undo = e.target.closest?.("[data-undo]");
    if (undo) {
      const p = briefing.proposals.find((x) => x.id === undo.dataset.undo);
      undo.disabled = true;
      const r = await post({ id: p.id, decision: "undo", proposal: p });
      clearTimeout(undoTimer);
      if (r.ok) decided[p.id] = { status: "undone", at: new Date().toISOString() };
      render(() => host.querySelector(".ap-count")?.focus());
      live.textContent = r.ok ? `Undone: “${describe(p).target}” is back where it was.` : r.error;
      return;
    }
    const btn = e.target.closest?.("[data-act]");
    if (!btn) return;
    const card = btn.closest(".ap-card");
    const p = briefing.proposals.find((x) => x.id === card.dataset.id);
    const index = [...host.querySelectorAll(".ap-list:not(.ap-ro) .ap-card")].indexOf(card);
    card.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    live.textContent = btn.dataset.act === "approve" ? "Working on it…" : "";
    const r = await post({ id: p.id, decision: btn.dataset.act, proposal: p });
    const verb = pastTense[describe(p).verb] || "Done";
    if (r.ok) {
      decided[p.id] = { status: btn.dataset.act === "reject" ? "rejected" : "approved", at: new Date().toISOString() };
      render(focusNext(index));
      live.textContent = btn.dataset.act === "reject" ? `Rejected: ${describe(p).target}. Nothing was changed.` : `${verb}: ${describe(p).target}.`;
      if (btn.dataset.act === "approve" && r.undoSeconds) showUndo(p, verb);
      return;
    }
    if (r.http === 409 && r.error.startsWith("Stale")) decided[p.id] = { status: "stale", at: new Date().toISOString(), note: r.error.replace(/^Stale, review again:\s*/, "") };
    else if (r.http === 409 && r.error.startsWith("Already")) decided[p.id] = { status: "approved", at: new Date().toISOString() };
    render(() => (host.querySelector(`.ap-card[data-id="${CSS.escape(p.id)}"] [data-act="${btn.dataset.act}"]`) || host.querySelector(".ap-count"))?.focus());
    live.textContent = r.error || "That didn't work; nothing changed.";
  }, { signal: ac.signal });

  render();
}

/** The briefing's text parts as HTML: summary, needs attention, email, and anything that couldn't be read. */
export function briefingHtml(b, { full = true } = {}) {
  const list = (items, label) => items.length ? `<h3 class="br-sub">${label}</h3><ul class="br-list">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  return `${b.summary ? `<p class="br-summary">${esc(b.summary)}</p>` : ""}
    ${full ? list(b.attention, "Needs attention") + list(b.email, "Email") : b.attention.length ? `<p class="br-attn">${b.attention.length} ${b.attention.length === 1 ? "thing needs" : "things need"} attention.</p>` : ""}
    ${b.problems.length ? `<p class="ap-blocked">${b.problems.map(esc).join(" ")}</p>` : ""}`;
}
