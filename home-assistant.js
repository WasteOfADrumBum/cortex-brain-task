// Home's half of the Assistant: the short briefing (date, summary, how many things need attention) and the first
// two approval cards, in the "Briefing and headlines" panel. The Briefing page has the full version.
// home.js calls HomeAssistant.update(state) whenever the Drive state changes; this module also starts on its own,
// because module scripts run after home.js has booted.
import { loadBriefing, loadDecisions, mountApprovals, briefingHtml } from "/assistant-ui.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let loaded = "", busy = false;
async function update(state) {
  if (!state || state.auth !== "in" || busy) return;
  const mode = Demo.on ? "demo" : Drive.linked() ? "live" : "idle";
  if (loaded === mode) return;
  busy = true;
  try {
    const r = await loadBriefing(new Date());
    loaded = r.state === "idle" ? "" : mode;
    if (r.state !== "ok") {
      $("d-brief").innerHTML = `<p class="hd-note">${esc(r.message)}</p>`;
      $("d-approvals").innerHTML = "";
      return;
    }
    $("d-brief").innerHTML = briefingHtml(r.briefing, { full: false });
    mountApprovals($("d-approvals"), { briefing: r.briefing, decisions: await loadDecisions(), limit: 2, heading: $("d-h-brief"), idPrefix: "d-ap" });
  } finally {
    busy = false;
  }
}

window.HomeAssistant = { update };
update(Brain.state);
// The routine writes the briefing in the morning; a page left open overnight picks it up within half an hour.
setInterval(() => { loaded = ""; update(Brain.state); }, 30 * 60000);
