// Cortex Finances: read from the J&M P&L Google Sheet in this browser (finance-source.js), with no paste and no
// server copy. Panels: each month (take-home, what goes out, what's left), bills and debt payments due in the next
// 14 days, the 50/30/20 split against its targets, bills by section, debt, and savings against the safety net.
// Every bar repeats a number that is written next to it, so nothing depends on seeing the bar. /demo uses sample data.
import { loadSheetFinance } from "/finance-source.js";
import { monthly, upcoming } from "/src/finance-sheet.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n, cents = true) => (n == null ? "–" : n.toLocaleString([], { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }));
const pct = (f) => (f == null ? "–" : `${Math.round(f * 1000) / 10}%`);
const dayText = (d) => d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const PANELS = ["fin-month", "fin-soon", "fin-split", "fin-bills", "fin-debt", "fin-save"];
/** A bar for a number already shown in text: hidden from screen readers. */
const bar = (fraction, cls = "") => `<span class="fin-track" aria-hidden="true"><span class="fin-fill ${cls}" style="width:${Math.max(0, Math.min(100, Math.round(fraction * 100)))}%"></span></span>`;
const table = (caption, head, rows) => `<div class="table-scroll fin-scroll" tabindex="0" role="region" aria-label="${esc(caption)}"><table class="fin-table">
  <caption class="visually-hidden">${esc(caption)}</caption>
  <thead><tr>${head.map((h, i) => `<th scope="col"${i ? ' class="num"' : ""}>${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>${rows.join("")}</tbody></table></div>`;

async function load(fresh = false) {
  $("btn-refresh").disabled = true;
  $("fin-updated").textContent = "Reading the J&M P&L sheet…";
  const r = await loadSheetFinance({ fresh });
  $("btn-refresh").disabled = false;
  if ("message" in r) {
    $("fin-updated").textContent = r.message;
    for (const id of PANELS) $(id).innerHTML = `<p class="panel-note">${esc(r.message)}</p>`;
    return;
  }
  render(r.result);
}

function render({ finance: f, modifiedTime, url, name }) {
  const link = $("fin-sheet-link");
  link.href = url;
  link.hidden = false;
  const missing = f.missing.length ? ` Couldn't find the ${f.missing.join(", ")} ${f.missing.length === 1 ? "tab" : "tabs"}, so ${f.missing.length === 1 ? "that part is" : "those parts are"} empty.` : "";
  $("fin-updated").textContent = `From ${name}${modifiedTime ? `, last edited ${Brain.ago(modifiedTime)}` : ""}.${missing}`;
  renderMonth(f);
  renderSoon(f);
  renderSplit(f);
  renderBills(f);
  renderDebt(f);
  renderSave(f);
}

function renderMonth(f) {
  if (!f.snapshot.length) { $("fin-month").innerHTML = '<p class="panel-note">No snapshot found on the Summary tab.</p>'; return; }
  const m = monthly(f);
  const parts = [...m.rows.filter((r) => (r.monthly ?? 0) > 0), ...(m.left > 0 ? [{ label: "Left over", monthly: m.left, kind: "left" }] : [])];
  const base = Math.max(m.income, parts.reduce((n, r) => n + r.monthly, 0)) || 1;
  const seg = (r, i) => (r.kind === "left" ? "left" : i % 4);
  $("fin-month").innerHTML = `
    <ul class="totals">
      <li><span class="total-num">${money(m.income, false)}</span><span class="total-label">take-home a month</span></li>
      <li><span class="total-num">${money(m.out, false)}</span><span class="total-label">going out a month</span></li>
      <li><span class="total-num">${money(Math.abs(m.left), false)}</span><span class="total-label">${m.left >= 0 ? "left over a month" : "short each month"}</span></li>
    </ul>
    <p class="fin-stack" aria-hidden="true">${parts.map((r, i) => `<span class="fin-seg seg-${seg(r, i)}" style="width:${(r.monthly / base) * 100}%"></span>`).join("")}</p>
    <ul class="fin-legend">${parts.map((r, i) => `<li><span class="fin-key seg-${seg(r, i)}" aria-hidden="true"></span>${esc(r.label)}: ${money(r.monthly, false)} (${pct(r.monthly / (m.income || 1))} of take-home)</li>`).join("")}</ul>
    ${table("Each line per paycheck, per month and per year", ["Line", "Per paycheck", "Monthly", "Yearly"], f.snapshot.map((r) =>
      `<tr${r.kind === "left" ? ' class="fin-total"' : ""}><th scope="row">${esc(r.label)}</th><td class="num">${money(r.payPeriod)}</td><td class="num">${money(r.monthly)}</td><td class="num">${money(r.yearly)}</td></tr>`))}`;
}

function renderSoon(f) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const list = upcoming(f, today, 14);
  const undated = f.bills.filter((b) => !b.due && /month/i.test(b.frequency)).length;
  const note = undated ? `<p class="sub-line panel-note">${undated} monthly ${undated === 1 ? "bill has" : "bills have"} no due date in the sheet, so ${undated === 1 ? "it isn't" : "they aren't"} listed here.</p>` : "";
  if (!list.length) { $("fin-soon").innerHTML = `<p class="panel-note">Nothing with a due date in the next 14 days.</p>${note}`; return; }
  const total = list.reduce((n, x) => n + (x.amount ?? 0), 0);
  $("fin-soon").innerHTML = `<p class="big-line">${money(total, false)} across ${list.length} ${list.length === 1 ? "payment" : "payments"}</p>
    <ul class="fin-due">${list.map((x) => {
      const days = Math.round((x.date - start) / 864e5);
      const when = days === 0 ? "Today" : days === 1 ? "Tomorrow" : dayText(x.date);
      return `<li${days <= 2 ? ' class="fin-due-near"' : ""}><span class="fin-due-when">${esc(when)}</span><span class="fin-due-name">${esc(x.name)}${x.kind === "Card" ? " (card payment)" : ""}</span><span class="fin-due-amt">${x.amount != null ? money(x.amount) : "See statement"}</span></li>`;
    }).join("")}</ul>${note}`;
}

function renderSplit(f) {
  if (!f.allocation.length) { $("fin-split").innerHTML = '<p class="panel-note">No 50/30/20 table found on the Summary tab.</p>'; return; }
  const max = Math.max(...f.allocation.flatMap((a) => [a.actualShare ?? 0, a.targetShare ?? 0]), 0.01);
  $("fin-split").innerHTML = `<ul class="fin-split-list">${f.allocation.map((a) => {
    const diff = a.actualShare != null && a.targetShare != null ? a.actualShare - a.targetShare : null;
    const words = diff == null ? "" : Math.abs(diff) < 0.005 ? "On target." : diff > 0 ? `${pct(diff)} over the target.` : `${pct(-diff)} under the target.`;
    const savingsLike = /sav/i.test(a.category);
    const good = diff == null ? "" : (savingsLike ? diff >= 0 : diff <= 0) ? "good" : "warn";
    return `<li>
      <p class="fin-split-head"><strong>${esc(a.category)}</strong> <span>${pct(a.actualShare)} of take-home (${money(a.actual, false)} a year)</span></p>
      <div class="fin-pair">
        <span class="fin-pair-label" aria-hidden="true">Now</span>${bar((a.actualShare ?? 0) / max, good)}
        <span class="fin-pair-label" aria-hidden="true">Target</span>${bar((a.targetShare ?? 0) / max, "target")}
      </div>
      <p class="sub-line${good === "warn" ? " warn-text" : ""}">Target ${pct(a.targetShare)}. ${esc(words)}</p>
    </li>`;
  }).join("")}</ul>
  ${f.allocationBase != null ? `<p class="sub-line panel-note">Shares of ${money(f.allocationBase, false)} take-home a year, from the Summary tab.</p>` : ""}`;
}

function renderBills(f) {
  if (!f.bills.length) { $("fin-bills").innerHTML = '<p class="panel-note">No active bills found on the Recurring Expenses tab.</p>'; return; }
  const sum = (list) => list.reduce((n, b) => n + (b.monthly ?? 0), 0);
  const needs = sum(f.bills.filter((b) => b.kind === "Need"));
  const wants = sum(f.bills.filter((b) => b.kind === "Want"));
  const sections = [...new Set(f.bills.map((b) => b.section))].map((s) => ({ name: s, bills: f.bills.filter((b) => b.section === s) }))
    .sort((a, b) => sum(b.bills) - sum(a.bills));
  const top = Math.max(...sections.map((s) => sum(s.bills)), 1);
  const due = (d) => (d ? (/^\d+$/.test(d) ? `Day ${d}` : d) : "–");
  $("fin-bills").innerHTML = `
    <ul class="totals">
      <li><span class="total-num">${money(sum(f.bills), false)}</span><span class="total-label">a month, ${f.bills.length} bills</span></li>
      <li><span class="total-num">${money(needs, false)}</span><span class="total-label">needs a month</span></li>
      <li><span class="total-num">${money(wants, false)}</span><span class="total-label">wants a month</span></li>
    </ul>
    <ul class="fin-sections">${sections.map((s) => `<li><details>
      <summary><span class="fin-sec-name">${esc(s.name)}</span><span class="fin-sec-sum">${money(sum(s.bills), false)} a month · ${s.bills.length} ${s.bills.length === 1 ? "bill" : "bills"}</span>${bar(sum(s.bills) / top)}</summary>
      ${table(`${s.name} bills`, ["Bill", "Amount", "How often", "Due", "Monthly"], s.bills.map((b) =>
        `<tr><th scope="row">${esc(b.name)}${b.kind ? ` <span class="fin-tag">${esc(b.kind)}</span>` : ""}</th><td class="num">${money(b.amount)}</td><td class="num">${esc(b.frequency || "–")}</td><td class="num">${esc(due(b.due))}</td><td class="num">${money(b.monthly)}</td></tr>`))}
    </details></li>`).join("")}</ul>`;
}

function renderDebt(f) {
  if (!f.debt.length && !f.loans.length && !f.cards.length) { $("fin-debt").innerHTML = '<p class="panel-note">No debt found in the sheet.</p>'; return; }
  const cards = f.cards.filter((c) => c.balance > 0 || !/paid/i.test(c.status));
  const hidden = f.cards.length - cards.length;
  $("fin-debt").innerHTML = `
    ${f.debt.length ? `<ul class="totals">${f.debt.map((d) => `<li><span class="total-num">${money(d.amount, false)}</span><span class="total-label">${esc(d.label)}</span></li>`).join("")}</ul>` : ""}
    ${f.loans.length ? `<h3 class="project-sub">Loans</h3>${table("Loans", ["Loan", "Balance", "Monthly", "Due"], f.loans.map((l) =>
      `<tr><th scope="row">${esc(l.name)}${l.type && l.type !== l.name ? ` <span class="fin-tag">${esc(l.type)}</span>` : ""}</th><td class="num">${money(l.balance)}</td><td class="num">${money(l.monthly)}</td><td class="num">${esc(l.due || "–")}</td></tr>`))}` : ""}
    ${cards.length ? `<h3 class="project-sub">Credit cards</h3>${table("Credit cards", ["Card", "Balance", "APR", "Due"], cards.map((c) =>
      `<tr><th scope="row">${esc(c.name)}</th><td class="num">${c.balance > 0 ? money(c.balance) : "Paid off"}</td><td class="num">${pct(c.apr)}</td><td class="num">${esc(c.due || "–")}</td></tr>`))}` : ""}
    ${hidden ? `<p class="sub-line panel-note">${hidden} paid-off ${hidden === 1 ? "card is" : "cards are"} not listed.</p>` : ""}`;
}

function renderSave(f) {
  if (!f.savings.length && !f.accounts.length) { $("fin-save").innerHTML = '<p class="panel-note">No savings found in the sheet.</p>'; return; }
  const household = f.savings.find((s) => /household/i.test(s.label))?.amount ?? f.savings.find((s) => !s.total)?.amount ?? null;
  const goals = f.safetyNet.filter((s) => !s.total && s.amount);
  $("fin-save").innerHTML = `
    <ul class="totals">${f.savings.map((s) => `<li><span class="total-num">${money(s.amount, false)}</span><span class="total-label">${esc(s.label)}</span></li>`).join("")}</ul>
    ${goals.length && household != null ? `<h3 class="project-sub">Safety net</h3><ul class="fin-goals">${goals.map((g) => {
      const ok = household >= g.amount;
      return `<li class="check-${ok ? "yes" : "unknown"}"><span class="state-mark" aria-hidden="true">${ok ? "✓" : "!"}</span>
        <span>${esc(g.label)}: ${money(g.amount, false)}. Household savings ${ok ? "covers it" : `is ${money(g.amount - household, false)} short`}.</span></li>`;
    }).join("")}</ul><p class="sub-line panel-note">Household savings counts every household account, including money set aside for bills.</p>` : ""}
    ${f.accounts.length ? `<h3 class="project-sub">Accounts</h3>${table("Savings accounts", ["Account", "For", "Balance"], f.accounts.map((a) =>
      `<tr><th scope="row">${esc(a.name)}</th><td class="num">${esc(a.purpose || a.group || "–")}</td><td class="num">${money(a.balance)}</td></tr>`))}` : ""}`;
}

$("btn-refresh").addEventListener("click", () => load(true));

let started = false;
Brain.boot({ onUpdate(state) { if (state.auth === "in" && !started) { started = true; load(); } } });
