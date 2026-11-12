// Cortex Briefing page: today's briefing in full (summary, needs attention, email) and every proposal from it as an
// approval card, plus the ones Cortex doesn't run, shown read-only. Home shows the short version of both.
import { loadBriefing, loadDecisions, mountApprovals, briefingHtml } from "/assistant-ui.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let loaded = "";
async function load(mode) {
  if (loaded === mode) return;
  loaded = mode;
  const r = await loadBriefing(new Date());
  const folder = $("br-folder");
  folder.hidden = !r.folder?.webViewLink;
  if (r.folder?.webViewLink) folder.innerHTML = `<a href="${esc(r.folder.webViewLink)}" target="_blank" rel="noopener">Open the briefings folder in Drive<span class="visually-hidden"> (opens in a new tab)</span></a>`;
  if (r.state !== "ok") {
    $("br-status").textContent = r.message;
    $("br-body").innerHTML = "";
    $("ap-body").innerHTML = `<p class="panel-note">${r.state === "idle" ? "Proposals come with the briefing, so link Drive first." : "No proposals without today's briefing."}</p>`;
    if (r.state === "idle") loaded = ""; // try again once Drive is linked
    return;
  }
  const b = r.briefing;
  const made = b.generated && !isNaN(Date.parse(b.generated)) ? ` Written ${new Date(b.generated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` : "";
  $("br-status").textContent = `Briefing for ${new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}.${made}`;
  $("br-body").innerHTML = briefingHtml(b, { full: true });
  mountApprovals($("ap-body"), { briefing: b, decisions: await loadDecisions(), showUnsupported: true, heading: $("h-ap"), idPrefix: "ap" });
}

Brain.boot({ onUpdate(state) { if (state.auth === "in" && (state.mode === "live" || state.mode === "demo")) load(state.mode); else if (state.auth === "in" && state.mode === "idle") load("idle"); } });
