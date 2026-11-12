// Cortex Finances: this month (in, out, net, bills by due date, overdue called out in words), the year (one row per
// month, expandable), when the numbers were last saved, and the paste import ("Update finances").
// Data: GET /api/finance?year= (saved in Drive by the server, same dashboard key as the Planner); /demo uses sample data.
import { validateFinance, shrinkWarnings, summarize } from "/src/finance-lib.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => n.toLocaleString([], { style: "currency", currency: "USD" });
const dateText = (ymd) => new Date(`${ymd}T12:00`).toLocaleDateString([], { month: "short", day: "numeric" });
const monthName = (ym) => new Date(`${ym}-15T12:00`).toLocaleDateString([], { month: "long", year: "numeric" });
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

let year = null; // FinanceYear once loaded
const key = () => { try { return localStorage.getItem("dashKey") || ""; } catch { return ""; } };

async function load() {
  const y = new Date().getFullYear();
  if (Demo.on) { year = (await Demo.data()).finances(new Date()); render(); return; }
  let res = null, body = null;
  try { res = await fetch(`/api/finance?year=${y}`, { headers: key() ? { "x-dash-key": key() } : {} }); } catch { /* offline */ }
  try { body = await res?.json(); } catch { /* not JSON */ }
  const msg = !res ? "Couldn't reach Cortex (offline or blocked)."
    : res.status === 401 ? (key() ? "Your dashboard key wasn't accepted. Open the Planner to enter it again." : "Open the Planner once and enter your dashboard key so Cortex can read your finances.")
    : res.status === 404 ? "The finance route isn't deployed yet."
    : !res.ok || !body ? `Finances unavailable: ${body?.error || `error ${res.status}`}.`
    : "";
  if (msg) { message(msg); return; }
  year = body;
  render();
}

function message(text) {
  $("fin-updated").textContent = text;
  $("fin-month").innerHTML = `<p class="panel-note">${esc(text)}</p>`;
  $("fin-year").innerHTML = "";
}

function billRows(bills, today) {
  return [...bills].sort((a, b) => a.due.localeCompare(b.due)).map((b) => {
    const state = b.paid ? ["✓", "Paid", "yes"] : b.due < today ? ["!", "Overdue", "no"] : ["…", "Not paid yet", "unknown"];
    return `<tr class="bill-${state[2]}"><th scope="row">${esc(b.name)}</th><td>${money(b.amount)}</td><td>${esc(dateText(b.due))}</td>
      <td><span class="check-${state[2]}"><span class="state-mark" aria-hidden="true">${state[0]}</span> ${state[1]}</span></td></tr>`;
  }).join("");
}
const billTable = (bills, today, caption) => bills.length ? `<div class="table-scroll" tabindex="0" role="region" aria-label="${esc(caption)}"><table class="fin-table">
  <caption class="visually-hidden">${esc(caption)}</caption>
  <thead><tr><th scope="col">Bill</th><th scope="col">Amount</th><th scope="col">Due</th><th scope="col">Status</th></tr></thead>
  <tbody>${billRows(bills, today)}</tbody></table></div>` : '<p class="panel-note">No bills in this month.</p>';

function render() {
  const today = todayYmd();
  const months = year.months;
  const latest = months[months.length - 1];
  const current = months.find((m) => m.month === today.slice(0, 7));
  $("fin-updated").textContent = latest
    ? `Last saved ${Brain.ago(latest.savedAt)} from ${latest.source} (${monthName(latest.month)}, covering ${dateText(latest.periodStart)} to ${dateText(latest.periodEnd)}).`
    : "Nothing saved yet. Use Update finances to paste this month's report.";

  if (!current) {
    $("fin-month").innerHTML = `<p class="panel-note">No numbers for ${esc(monthName(today.slice(0, 7)))} yet.</p>`;
  } else {
    const s = summarize(current, new Date(`${today}T12:00`));
    const partial = current.coverage.filter((c) => c.status !== "complete");
    $("fin-month").innerHTML = `
      <ul class="totals">
        <li><span class="total-num">${money(s.in)}</span><span class="total-label">money in</span></li>
        <li><span class="total-num">${money(s.out)}</span><span class="total-label">money out</span></li>
        <li><span class="total-num">${money(s.net)}</span><span class="total-label">${s.net >= 0 ? "left over" : "more out than in"}</span></li>
        <li><span class="total-num">${s.billsPaid} of ${s.billsTotal}</span><span class="total-label">bills paid</span></li>
      </ul>
      ${s.overdue.length ? `<p class="sub-line warn-text"><span class="state-icon" aria-hidden="true">!</span> ${s.overdue.length} overdue: ${esc(s.overdue.map((b) => b.name).join(", "))}.</p>` : ""}
      ${s.dueSoon.length ? `<p class="sub-line">Due in the next 7 days: ${esc(s.dueSoon.map((b) => `${b.name} (${dateText(b.due)})`).join(", "))}.</p>` : ""}
      ${partial.length ? `<p class="sub-line warn-text">Not complete: ${esc(partial.map((c) => `${c.account} (${c.status})`).join(", "))}, so some numbers may be missing.</p>` : ""}
      <h3 class="project-sub">Bills, by due date</h3>
      ${billTable(current.bills, today, `Bills for ${monthName(current.month)}`)}
      ${current.income.length ? `<h3 class="project-sub">Money in</h3><ul class="fin-income">${current.income.map((i) => `<li>${esc(i.name)}: ${money(i.amount)} on ${esc(dateText(i.date))}</li>`).join("")}</ul>` : ""}
      ${current.notes ? `<p class="sub-line">${esc(current.notes)}</p>` : ""}`;
  }

  $("fin-year").innerHTML = months.length ? `<ul class="fin-months">${[...months].reverse().map((m) => {
    const s = summarize(m, new Date(`${today}T12:00`));
    const isNow = m === current;
    return `<li><details${isNow ? " open" : ""}>
      <summary><span class="fin-m-name">${esc(monthName(m.month))}${isNow ? " (this month)" : ""}</span>
        <span>In ${money(s.in)} · Out ${money(s.out)} · Net ${money(s.net)} · ${s.billsPaid} of ${s.billsTotal} bills paid</span></summary>
      ${billTable(m.bills, today, `Bills for ${monthName(m.month)}`)}
    </details></li>`;
  }).join("")}</ul>` : '<p class="panel-note">No months saved this year yet.</p>';
}

// ---------- Update finances: paste, check, then save ----------
const dlg = $("fin-dialog");
let checked = null; // { value, warnings } after "Check it"
function resetDialog() { checked = null; $("btn-save").disabled = true; $("fin-errors").textContent = ""; $("fin-preview").innerHTML = ""; $("btn-save").textContent = "Save to Drive"; }
$("btn-update").addEventListener("click", () => { resetDialog(); dlg.showModal(); $("fin-json").focus(); });
$("btn-cancel").addEventListener("click", () => dlg.close());
$("fin-json").addEventListener("input", resetDialog);
$("btn-preview").addEventListener("click", () => {
  resetDialog();
  const raw = $("fin-json").value.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  let data;
  try { data = JSON.parse(raw); } catch { $("fin-errors").textContent = "That isn't valid JSON. Copy the whole block, from the first { to the last }."; return; }
  const r = validateFinance(data);
  if (!r.ok) { $("fin-errors").textContent = `Can't save yet: ${r.message}.`; return; }
  const prev = year?.months.find((m) => m.month === r.value.month) || null;
  const warnings = shrinkWarnings(prev, r.value);
  checked = { value: r.value, warnings };
  const s = summarize(r.value, new Date());
  $("fin-preview").innerHTML = `<p class="sub-line"><strong>${esc(monthName(r.value.month))}:</strong> in ${money(s.in)}, out ${money(s.out)}, ${r.value.bills.length} bills (${s.billsPaid} paid), ${r.value.income.length} income items.${prev ? " This replaces the saved copy." : ""}</p>
    ${warnings.length ? `<p class="sub-line warn-text">Check before saving:</p><ul class="fin-warnings">${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}`;
  $("btn-save").disabled = false;
  $("btn-save").textContent = warnings.length ? "Save anyway" : "Save to Drive";
});
$("btn-save").addEventListener("click", async () => {
  if (!checked) return;
  $("btn-save").disabled = true;
  $("fin-errors").textContent = "";
  let res = null, body = null;
  try {
    res = await fetch("/api/finance", { method: "POST", headers: { "content-type": "application/json", ...(key() ? { "x-dash-key": key() } : {}) }, body: JSON.stringify({ data: checked.value, confirm: true }) });
  } catch { /* offline */ }
  try { body = await res?.json(); } catch { /* not JSON */ }
  if (!res || !res.ok || !body?.ok) {
    $("fin-errors").textContent = `Not saved: ${body?.error || (res ? `error ${res.status}` : "couldn't reach Cortex")}.`;
    $("btn-save").disabled = false;
    return;
  }
  dlg.close();
  $("fin-updated").textContent = `Saved ${monthName(body.month)} with ${body.bills} bills. Loading the new numbers…`;
  $("fin-json").value = "";
  load();
});

let started = false;
Brain.boot({ onUpdate(state) { if (state.auth === "in" && !started) { started = true; load(); } } });
