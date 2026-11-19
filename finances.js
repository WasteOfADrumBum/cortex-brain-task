// Cortex Finances: the J&M P&L sheet, read in this browser (finance-source.js), worked out by src/finance-model.js
// and drawn here. This file only presents: every money rule lives in the model so the tests cover it.
// Reading rules for the page: short labels, one idea per line, details folded away,
// and every figure carries a word for its status (Recorded plan, Estimate, Confirmed, Unknown, Conflict), so
// nothing depends on colour. Charts repeat numbers that are also written out or in a table.
import { loadSheetFinance } from "/finance-source.js";
import { buildModel, STATUS, shortDate } from "/src/finance-model.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** Display rounding only: whole dollars by default, cents in tables. */
const money = (n, cents = false) => (n == null ? "Unknown" : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }));
const signed = (n) => (n == null ? "Unknown" : n < 0 ? `−${money(-n)}` : money(n));
const pct = (f) => (f == null ? "Unknown" : `${Math.round(f * 1000) / 10}%`);
const monthsText = (n) => (n == null ? "Unknown" : `${(Math.round(n * 10) / 10).toFixed(1)} months`);
const SECTIONS = ["fin-overview", "fin-attention", "fin-timeline", "fin-allocation", "fin-safety", "fin-debt", "fin-trends", "fin-bills", "fin-sources"];
const ICON = { confirmed: "✓", recorded: "•", estimate: "≈", unknown: "?", conflict: "!", computed: "=" };

/** A status word with a shape, never colour alone. */
const badge = (status, text = STATUS[status]) => `<span class="fin-badge b-${esc(status)}"><span aria-hidden="true">${ICON[status] || "•"}</span> ${esc(text)}</span>`;

let ctx = { url: "", gids: {} };
/** A link to a tab and range in the sheet: "Recurring Expenses, row 7". */
function sheetLink(ref, text) {
  if (!ref) return "";
  const rows = /^[A-Z]+(\d+)(?::[A-Z]+(\d+))?$/.exec(ref.range);
  const where = rows ? (rows[2] && rows[2] !== rows[1] ? `rows ${rows[1]}–${rows[2]}` : `row ${rows[1]}`) : ref.range;
  const gid = ctx.gids?.[ref.tab];
  const href = ctx.url && gid != null ? `${ctx.url}#gid=${gid}&range=${encodeURIComponent(ref.range)}` : ctx.url || "#";
  const label = text ? `${text}<span class="visually-hidden">: ${esc(ref.tab)}, ${esc(where)}</span>` : esc(`${ref.tab}, ${where}`);
  return `<a class="fin-src" href="${esc(href)}" target="_blank" rel="noopener">${label}<span class="visually-hidden"> (opens the sheet in a new tab)</span></a>`;
}
const when = (iso, today) => {
  const d = new Date(`${iso}T00:00:00`);
  const days = Math.round((d - today) / 864e5);
  return days === 0 ? "Today" : days === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};
const table = (caption, head, rows, cls = "") => `<div class="table-scroll fin-scroll" tabindex="0" role="region" aria-label="${esc(caption)}"><table class="fin-table ${cls}">
  <caption class="visually-hidden">${esc(caption)}</caption>
  <thead><tr>${head.map((h, i) => `<th scope="col"${i && (typeof h === "string" || h.num !== false) ? ' class="num"' : ""}>${esc(typeof h === "string" ? h : h.label)}</th>`).join("")}</tr></thead>
  <tbody>${rows.join("")}</tbody></table></div>`;
const more = (summary, body, open = false) => `<details class="fin-more"${open ? " open" : ""}><summary>${summary}</summary><div class="fin-more-body">${body}</div></details>`;

async function load(fresh = false) {
  $("btn-refresh").disabled = true;
  $("fin-updated").textContent = "Reading the J&M P&L sheet…";
  const r = await loadSheetFinance({ fresh });
  $("btn-refresh").disabled = false;
  if ("message" in r) {
    // A failed read shows the reason everywhere. Sample numbers are never swapped in.
    $("fin-updated").textContent = r.message;
    for (const id of SECTIONS) $(id).innerHTML = `<p class="panel-note">${esc(r.message)}</p>`;
    return;
  }
  try {
    render(r.result);
  } catch (e) {
    const msg = `The sheet was read, but Cortex couldn't work out the numbers (${e.message}). Nothing is shown, so a partial result isn't mistaken for the whole.`;
    $("fin-updated").textContent = msg;
    for (const id of SECTIONS) $(id).innerHTML = `<p class="panel-note">${esc(msg)}</p>`;
  }
}

function render({ finance: f, modifiedTime, url, name, gids }) {
  ctx = { url, gids: gids || {} };
  const link = $("fin-sheet-link");
  link.href = url;
  link.hidden = false;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const m = buildModel(f, today);
  const missingTabs = f.missing.length ? ` Couldn't find ${f.missing.length === 1 ? "the tab" : "these tabs"}: ${f.missing.join(", ")}, so those parts are empty.` : "";
  $("fin-updated").innerHTML = `From <strong>${esc(name)}</strong>${modifiedTime ? `, edited ${esc(Brain.ago(modifiedTime))}` : ""}. An edit time is when the file changed, not when balances were checked.${esc(missingTabs)}`;
  renderOverview(m);
  renderAttention(m);
  renderTimeline(m, start);
  renderAllocation(m);
  renderSafety(m);
  renderDebt(m);
  renderTrends(m);
  renderBills(m);
  renderSources(m);
}

// ---------- 1. Overview ----------
function card(title, value, status, lines, extra = "") {
  return `<li class="fin-card panel">
    <h3 class="fin-card-title">${esc(title)}</h3>
    <p class="fin-card-value">${value}</p>
    <p class="fin-card-status">${badge(status)}</p>
    ${lines.filter(Boolean).map((l) => `<p class="fin-card-line">${l}</p>`).join("")}
    ${extra}
  </li>`;
}
const MISSING_WORD = { groceries: "groceries", fuel: "fuel", cards: "card minimums", reserves: "irregular costs", planned: "planned bills", unknown: "bills with no amount", savings: "savings transfers" };
function renderOverview(m) {
  const inc = m.income;
  const c = m.commitments;
  const u = m.unallocated;
  const cov = m.coverage;
  const excluded = inc.excluded.length ? more(`Not counted (${inc.excluded.length})`, `<ul class="fin-list">${inc.excluded.map((x) => `<li>${esc(x.name)}: ${money(x.amount)} a ${x.per} (${esc(x.note)}). ${sheetLink(x.ref)}</li>`).join("")}</ul>`) : "";
  const addsStatus = c.adds.some((a) => a.status === "unknown") ? "unknown" : c.adds.every((a) => a.status === "confirmed") ? "confirmed" : "estimate";
  $("fin-overview").innerHTML = `<ul class="fin-cards">
    ${card("Take-home a month", money(inc.net), inc.status, [
      inc.sources.length ? `Counts: ${esc(inc.sources.join(", "))}.` : "",
      inc.perPaycheck != null ? `About ${money(inc.perPaycheck)} a paycheck.` : "",
      sheetLink(inc.ref),
    ], excluded)}
    ${card("Monthly commitments", money(c.total), "recorded", [
      c.adds.length ? `With sheet estimates: <strong>${money(c.withEstimates)}</strong> ${badge(addsStatus)}` : "",
      c.adds.length ? `Adds ${esc(c.adds.map((a) => `${a.label.toLowerCase()} ${money(a.amount)}`).join(", "))}.` : "",
      c.parent.count ? `Not counted: ${money(c.parent.total)} a month on a parent's card.` : "",
    ])}
    ${card(u.label, signed(u.recorded), u.complete ? "recorded" : "unknown", [
      u.complete ? "" : `<strong>Incomplete.</strong> Not in the plan: ${esc(u.missing.map((x) => MISSING_WORD[x.key] || x.key).join(", "))}.`,
      u.afterEstimates != null && !u.complete ? `After sheet estimates: <strong>${signed(u.afterEstimates)}</strong> ${badge("estimate")}${u.afterEstimates < 0 ? " That's more going out than estimated take-home." : ""}` : "",
      "Not money to spend: the sheet has no dated cash balance or unpaid-bills list.",
    ])}
    ${card("Emergency coverage", cov.valid ? `About ${monthsText(cov.normal)}` : "Unknown", cov.valid ? (cov.confirmed ? "confirmed" : "estimate") : "unknown", cov.valid ? [
      `Job loss: about ${monthsText(cov.jobLoss)}${cov.insurance != null ? ", with replacement health insurance" : ""}.`,
      `Cash counted: ${money(cov.cash)}${cov.cashDate ? `, ${cov.cashDateKind === "report" ? "report date" : "as of"} ${esc(shortDate(cov.cashDate))}` : ", undated"}.${cov.cashDateKind === "report" ? " Not a bank balance date." : ""}`,
      "Leaves out the bills reserve, kids' savings and retirement.",
    ] : ["Needs a cash amount and monthly essentials in the sheet."])}
  </ul>`;
}

// ---------- 7. Needs attention ----------
const KIND = { missing: "Missing", conflict: "Conflict", undated: "Undated", unresolved: "Unresolved", change: "Coming up" };
function renderAttention(m) {
  const list = m.attention;
  if (!list.length) { $("fin-attention").innerHTML = '<p class="panel-note">Nothing flagged in the sheet.</p>'; return; }
  const item = (a) => `<li class="att att-${a.level}"><p class="att-head"><span class="att-kind">${esc(KIND[a.kind])}</span> <strong>${esc(a.title)}</strong></p><p class="att-text">${esc(a.text)} ${sheetLink(a.ref)}</p></li>`;
  const top = list.slice(0, 6);
  const rest = list.slice(6);
  const counts = ["high", "medium", "low"].map((l) => [l, list.filter((a) => a.level === l).length]).filter(([, n]) => n);
  $("fin-attention").innerHTML = `<p class="fin-lead">${list.length} ${list.length === 1 ? "thing" : "things"} to check: ${counts.map(([l, n]) => `${n} ${l === "high" ? "important" : l === "medium" ? "worth a look" : "minor"}`).join(", ")}.</p>
    <ol class="att-list">${top.map(item).join("")}</ol>
    ${rest.length ? more(`Show ${rest.length} more`, `<ol class="att-list" start="${top.length + 1}">${rest.map(item).join("")}</ol>`) : ""}`;
}

// ---------- 2. Timeline ----------
const DATE_KIND = { due: "Due date in sheet", predicted: "Predicted", posted: "Posted payment" };
function renderTimeline(m, today) {
  const t = m.timeline;
  const row = (i) => `<li class="tl-item tl-${esc(i.kind)}">
    <span class="tl-when">${esc(when(i.date, today))}</span>
    <span class="tl-name">${esc(i.name)}</span>
    <span class="tl-amt">${i.amount != null ? (i.kind === "payday" ? "+" : "") + money(i.amount, true) : "No amount"}</span>
    <span class="tl-meta">${i.kind === "payday" ? `${badge("estimate", "Predicted")} ${esc(i.source)}` : `${esc(DATE_KIND[i.dateKind] || i.dateKind)} · From ${esc(i.account || "not recorded")} · Paid? ${esc(i.status)}${i.priceFromNote ? " · Price from the note" : ""}`} · ${sheetLink(i.ref, "Sheet")}</span>
  </li>`;
  const out = t.items.filter((i) => i.kind !== "payday");
  $("fin-timeline").innerHTML = `
    <p class="fin-lead">${t.paydays} ${t.paydays === 1 ? "payday" : "paydays"} (predicted) and ${out.length} ${out.length === 1 ? "payment" : "payments"} due: <strong>${money(t.outKnown)}</strong>${t.outUnknown ? `, plus ${t.outUnknown} with no amount` : ""}.</p>
    <p class="fin-note">Paychecks come every pay period, so some months have three; monthly figures use annual ÷ 12. Dates come from the sheet. This is not a list of what's been paid.</p>
    ${t.items.length ? `<ol class="tl">${t.items.map(row).join("")}</ol>` : '<p class="panel-note">Nothing with a date in the next 31 days.</p>'}
    ${t.undated.length ? more(`No date in the sheet (${t.undated.length})`, `<ul class="fin-list">${t.undated.map((u) => `<li><strong>${esc(u.name)}</strong>${u.amount != null ? `, ${money(u.amount, true)}` : ""} (${esc(u.frequency || "how often not recorded")}): ${esc(u.why)}. ${sheetLink(u.ref)}</li>`).join("")}</ul>`) : ""}
    ${more(`Posted payments, last 30 days (${t.posted.length})`, t.posted.length ? `<ul class="fin-list">${t.posted.map((p) => `<li>${esc(shortDate(p.date))}: ${esc(p.name)} ${money(p.amount, true)} ${sheetLink(p.ref)}</li>`).join("")}</ul>` : '<p class="panel-note">None in the last 30 days. Only the water log has dated payments.</p>')}`;
}

// ---------- 3. Monthly allocation ----------
function stack(parts, base) {
  return `<p class="fin-stack" aria-hidden="true">${parts.filter((p) => p.amount > 0).map((p) => `<span class="fin-seg seg-${p.key}" style="width:${(p.amount / base) * 100}%"></span>`).join("")}</p>`;
}
function renderAllocation(m) {
  const a = m.allocation;
  if (a.income == null) { $("fin-allocation").innerHTML = '<p class="panel-note">No take-home income in the sheet, so there is nothing to split.</p>'; return; }
  const r = a.recorded, w = a.withEstimates;
  const recParts = [{ key: "needs", amount: r.needs }, { key: "wants", amount: r.wants }, { key: "savings", amount: r.savings }, { key: "left", amount: Math.max(0, r.unallocated ?? 0) }];
  const estParts = [{ key: "needs", amount: w.needs }, { key: "extra", amount: w.extra }, { key: "wants", amount: w.wants }, { key: "savings", amount: w.savings }, { key: "left", amount: Math.max(0, w.unallocated ?? 0) }];
  const base = Math.max(a.income, r.needs + r.wants + r.savings, w.needs + w.extra + w.wants + w.savings) || 1;
  const over = w.unallocated != null && w.unallocated < 0 ? -w.unallocated : 0;
  const share = (n) => pct(n / a.income);
  const legend = [["needs", "Needs and required debt"], ["extra", "Sheet estimates"], ["wants", "Wants"], ["savings", "Savings"], ["left", "Unallocated"]];
  $("fin-allocation").innerHTML = `
    <p class="fin-lead">Out of <strong>${money(a.income)}</strong> take-home a month ${badge(m.income.status)}</p>
    <div class="fin-bars">
      <p class="fin-bar-label">Recorded plan ${badge("recorded")}</p>${stack(recParts, base)}
      <p class="fin-bar-label">Plan + sheet estimates ${badge("estimate")}${over ? ` <strong class="fin-over">Over by ${money(over)}</strong>` : ""}</p>${stack(estParts, base)}
      <p class="fin-bar-label">Actual</p>
      ${a.actual.available ? stack([{ key: "needs", amount: a.actual.needs }, { key: "wants", amount: a.actual.wants }, { key: "savings", amount: a.actual.savings }, { key: "left", amount: Math.max(0, a.actual.income - a.actual.needs - a.actual.wants - a.actual.savings) }], Math.max(base, a.actual.income)) : `<p class="fin-unavailable">${badge("unknown", "Unavailable")} ${esc(a.actual.reason)}</p>`}
    </div>
    <ul class="fin-legend" aria-hidden="true">${legend.map(([k, l]) => `<li><span class="fin-key seg-${k}"></span>${esc(l)}</li>`).join("")}</ul>
    ${table("Monthly plan by part", ["Part", "Recorded plan", "With estimates", "Share of take-home", "50/30/20 reference"], [
      `<tr><th scope="row">Needs and required debt</th><td class="num">${money(r.needs)}</td><td class="num">${money(w.needs + w.extra)}</td><td class="num">${share(r.needs)} → ${share(w.needs + w.extra)}</td><td class="num">${pct(a.reference.needs)}</td></tr>`,
      `<tr><th scope="row">Wants</th><td class="num">${money(r.wants)}</td><td class="num">${money(w.wants)}</td><td class="num">${share(r.wants)}</td><td class="num">${pct(a.reference.wants)}</td></tr>`,
      `<tr><th scope="row">Savings from take-home</th><td class="num">${money(r.savings)}</td><td class="num">${money(w.savings)}</td><td class="num">${share(r.savings)}</td><td class="num">${pct(a.reference.savings)}</td></tr>`,
      `<tr class="fin-total"><th scope="row">Unallocated</th><td class="num">${signed(r.unallocated)}</td><td class="num">${signed(w.unallocated)}</td><td class="num">${r.unallocated == null ? "Unknown" : share(r.unallocated)}</td><td class="num">–</td></tr>`,
    ])}
    <p class="fin-note">Parts aren't forced to add up to 100%, because the plan is incomplete. 50/30/20 is only a reference: room left in wants isn't spending money.</p>
    <p class="fin-note">Saved from take-home: <strong>${pct(a.savingsRate)}</strong> (plan). Payroll 401(k): ${money(a.payroll401k)} a month, taken out before take-home pay, so it's not in that rate. ${sheetLink(a.payrollRef)}</p>
    ${a.mixedRate ? `<p class="fin-note">${badge("conflict")} The Summary tab's ${pct(a.summaryRate)} savings rate adds payroll 401(k) to take-home savings but divides by take-home pay. ${sheetLink(a.summaryRef)}</p>` : ""}`;
}

// ---------- 4. Savings and safety net ----------
function renderSafety(m) {
  const b = m.buckets;
  const top = Math.max(...b.map((x) => x.amount ?? 0), 1);
  const dateText = (x) => x.date ? (x.dateKind === "note" ? `Note mentions ${shortDate(x.date)}; no bank date` : `As of ${shortDate(x.date)}`) : "No date";
  const cov = m.coverage;
  const runway = (label, n, status) => `<li class="run"><p class="run-head"><span>${esc(label)}</span> <strong>${monthsText(n)}</strong> ${badge(status)}</p>
      <span class="run-track" aria-hidden="true"><span class="run-fill" style="width:${Math.min(100, Math.max(0, ((n ?? 0) / 8) * 100))}%"></span><span class="run-mark" style="left:37.5%"></span><span class="run-mark" style="left:75%"></span></span></li>`;
  $("fin-safety").innerHTML = `
    <ul class="bucket-list">${b.map((x) => `<li class="bucket">
      <p class="bucket-head"><strong>${esc(x.label)}</strong> <span class="bucket-amt">${money(x.amount)}</span> ${badge(x.status)}</p>
      <span class="fin-track" aria-hidden="true"><span class="fin-fill bucket-${x.key}" style="width:${Math.round(((x.amount ?? 0) / top) * 100)}%"></span></span>
      <p class="bucket-note">${esc(x.note)} ${esc(dateText(x))}. ${sheetLink(x.ref)}</p>
    </li>`).join("")}</ul>
    ${m.separateCash.length ? `<p class="fin-note">Accounts kept separate on the Savings tab (${money(m.separateCash.reduce((n, x) => n + (x.balance ?? 0), 0))}${m.separateCashDate ? `, received ${esc(shortDate(m.separateCashDate))}` : ""}) aren't counted above.</p>` : ""}
    <h3 class="fin-h3">Emergency runway</h3>
    ${cov.valid ? `<p class="fin-note">Months the counted cash would cover. Marks at 3 and 6 months.${cov.confirmed ? "" : " Estimates, not a promise."}</p>
      <ul class="run-list">
        ${runway("Normal months", cov.normal, cov.confirmed ? "confirmed" : "estimate")}
        ${runway("Job loss", cov.jobLoss, "estimate")}
        ${cov.upper != null ? runway("Job loss, using the whole bills reserve", cov.upper, "estimate") : ""}
        ${cov.oneTimeKnown ? runway("If unpaid one-time costs come out of savings", cov.afterOneTime, "estimate") : ""}
      </ul>
      ${more("Assumptions", `<ul class="fin-list">${cov.assumptions.map((s) => `<li>${esc(s)}</li>`).join("")}<li>Monthly essentials: ${money(cov.essentials)} (${esc(STATUS[cov.essentialsStatus])}). Job-loss essentials: ${money(cov.jobLossEssentials)}.</li></ul><p>${cov.refs.map((r) => sheetLink(r)).join(" · ")}</p>`)}`
      : `<p class="fin-unavailable">${badge("unknown", "Not shown")} The sheet needs a cash amount counted as available and monthly essentials before a runway can be worked out.</p>`}`;
}

// ---------- 5. Debt ----------
function renderDebt(m) {
  const d = m.debt;
  if (!d.mortgages.length && !d.cards.length && !d.devices.length) { $("fin-debt").innerHTML = '<p class="panel-note">No debt found in the sheet.</p>'; return; }
  const cards = d.cards.filter((c) => c.kind !== "Paid off");
  const paidOff = d.cards.length - cards.length;
  const escrow = /escrow/i.test(d.notes.map((n) => n.text).join(" "));
  $("fin-debt").innerHTML = `
    <p class="fin-lead">Required each month: <strong>${money(d.requiredMonthly)}</strong> ${badge("recorded")}${d.cardPayments ? ` + card minimums ${money(d.cardPayments.amount)} ${badge(d.cardPayments.status)}` : ""}</p>
    ${d.mortgages.map((l) => `<h3 class="fin-h3">${esc(l.name)}</h3>
      <dl class="fin-facts">
        <div><dt>Balance</dt><dd>${money(l.balance)} ${badge("recorded")}${l.date ? ` <span class="fin-date">note dated ${esc(shortDate(l.date))}</span>` : ""}</dd></div>
        ${l.estimatePrincipal != null ? `<div><dt>Estimated now</dt><dd>${money(l.estimatePrincipal)} ${badge("estimate")}</dd></div>` : ""}
        <div><dt>Payment</dt><dd>${money(l.monthly, true)} a month${escrow ? ", with escrow" : ""}</dd></div>
        <div><dt>APR</dt><dd>${l.apr != null ? pct(l.apr) : "Not recorded"}</dd></div>
        <div><dt>Due</dt><dd>${esc(l.due || "Not recorded")}</dd></div>
      </dl><p class="fin-note">${sheetLink(l.ref)}${l.estimateRef ? ` · ${sheetLink(l.estimateRef)}` : ""}</p>`).join("")}
    <h3 class="fin-h3">Credit cards</h3>
    ${cards.length ? table("Credit cards", ["Card", "Balance", "Type", "APR", "Due", { label: "Missing", num: false }], cards.map((c) =>
      `<tr><th scope="row">${esc(c.name)} ${sheetLink(c.ref, "Sheet")}</th><td class="num">${money(c.balance, true)}</td><td class="num">${esc(c.kind)}</td><td class="num">${c.apr != null ? pct(c.apr) : "–"}</td><td class="num">${esc(c.due || "–")}</td><td>${esc(c.gaps.join(", ") || "–")}</td></tr>`)) : '<p class="panel-note">No open card balances recorded.</p>'}
    ${paidOff ? `<p class="fin-note">${paidOff} paid-off ${paidOff === 1 ? "card is" : "cards are"} not listed.</p>` : ""}
    ${cards.some((c) => c.note) ? more("Card notes from the sheet", `<ul class="fin-list">${cards.filter((c) => c.note).map((c) => `<li><strong>${esc(c.name)}:</strong> ${esc(c.note)}</li>`).join("")}</ul>`) : ""}
    ${d.cardEstimates.length ? more("Other card figures (Estimate Inputs)", table("Card figures on Estimate Inputs", ["Figure", "Amount", { label: "How it's used", num: false }], d.cardEstimates.map((x) => `<tr><th scope="row">${esc(x.label)} ${sheetLink(x.ref, "Sheet")}</th><td class="num">${money(x.amount, true)}</td><td>${esc(x.basis)}</td></tr>`))) : ""}
    ${d.devices.length ? `<h3 class="fin-h3">Devices</h3>${table("Device installments", ["Device", "Balance", "Payment", { label: "When", num: false }], d.devices.map((l) =>
      `<tr><th scope="row">${esc(l.name)} ${sheetLink(l.ref, "Sheet")}</th><td class="num">${money(l.balance, true)}</td><td class="num">${/one-?time/i.test(l.frequency) ? `${money(l.payment, true)} once` : `${money(l.monthly, true)} a month`}</td><td>${esc(l.due || "Not recorded")}</td></tr>`))}` : ""}
    <p class="fin-note">No payoff dates: minimum payments and some APRs aren't in the sheet, so a forecast would be a guess.</p>
    ${d.notes.length ? more("Debt notes from the sheet", `<ul class="fin-list">${d.notes.map((n) => `<li>${esc(n.text)} ${sheetLink(n.ref)}</li>`).join("")}</ul>`) : ""}`;
}

// ---------- 6. Trends ----------
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym) => { const [y, mo] = ym.split("-").map(Number); return `${MON[mo - 1]} ${y}`; };
/** Monthly bars with gaps left as a flat mark (a blank month is no record, not $0). Decorative: a table repeats it. */
function barChart(points, thisMonth) {
  const max = Math.max(...points.map((p) => p.amount ?? 0), 1);
  const w = 100 / points.length;
  return `<svg class="fin-chart" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <line x1="0" y1="39.5" x2="100" y2="39.5" class="ch-axis"/>
    ${points.map((p, i) => p.amount == null
      ? `<rect x="${i * w + w * 0.15}" y="38" width="${w * 0.7}" height="1.5" class="ch-gap"/>`
      : `<rect x="${i * w + w * 0.15}" y="${39 - (p.amount / max) * 36}" width="${w * 0.7}" height="${(p.amount / max) * 36}" class="${p.month === thisMonth ? "ch-partial" : "ch-bar"}"/>`).join("")}
  </svg>`;
}
function renderTrends(m) {
  const t = m.trends;
  const thisMonth = m.asOf.slice(0, 7);
  const bills = t.bills.map((s) => {
    const shown = s.points;
    const gaps = shown.filter((p) => p.amount == null && p.month !== thisMonth).length;
    const last = shown[shown.length - 1];
    return `<li class="trend">
      <h4 class="trend-title">${esc(s.service)}</h4>
      <p class="trend-line">${s.recentAvg != null ? `Recent average <strong>${money(s.recentAvg, true)}</strong> over ${s.recentCount} recorded months.` : "Not enough recorded months for an average."}${gaps ? ` ${gaps} ${gaps === 1 ? "month has" : "months have"} no record (flat mark).` : ""}</p>
      ${barChart(shown, thisMonth)}
      <p class="trend-axis" aria-hidden="true"><span>${esc(monthLabel(shown[0].month))}</span><span>${esc(monthLabel(last.month))}${last.month === thisMonth ? " (so far)" : ""}</span></p>
      ${more("Show the numbers", table(`${s.service} payments by month`, ["Month", "Paid"], shown.map((p) => `<tr><th scope="row">${esc(monthLabel(p.month))}</th><td class="num">${p.amount == null ? "No record" : money(p.amount, true)}${p.month === thisMonth ? " (month in progress)" : ""}</td></tr>`)))}
    </li>`;
  }).join("");
  const salary = t.salary.length ? `<h3 class="fin-h3">Salary rate</h3>
    <p class="fin-note">Annual pay rate from each change date. A rate, not wages received that year.</p>
    ${table("Salary rate history", ["Effective", "Annual rate", { label: "Reason", num: false }], t.salary.map((s) => `<tr><th scope="row">${esc(shortDate(s.date))}</th><td class="num">${money(s.annual)}</td><td>${esc(s.reason)}</td></tr>`))}` : "";
  const nw = t.netWorth.length ? `<h3 class="fin-h3">Net worth records</h3>
    <p class="fin-note">Separate records, not a line: the gaps have no data and each record covers different accounts.</p>
    ${table("Net worth records", ["Date", "Net worth", "Kind", { label: "Basis", num: false }], t.netWorth.map((r) => `<tr><th scope="row">${esc(shortDate(r.date))} ${sheetLink(r.ref, "Sheet")}</th><td class="num">${money(r.netWorth)}</td><td class="num">${r.kind === "recorded" ? "Recorded" : "Estimated"}</td><td>${esc(r.basis)}</td></tr>`))}` : "";
  $("fin-trends").innerHTML = `
    ${t.bills.length ? `<h3 class="fin-h3">Bills paid by month</h3><p class="fin-note">Actual payments only, up to 24 months. The current month is partial and drawn lighter.</p><ul class="trend-list">${bills}</ul>` : ""}
    <div class="fin-two-inner"><div>${salary}</div><div>${nw}</div></div>
    ${t.missing.length ? `<h3 class="fin-h3">Not enough data yet</h3><ul class="fin-list">${t.missing.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`;
}

// ---------- Bills and subscriptions (folded) ----------
const FUND = { parent: "Parent's card", allowance: "Allowance", "in-allowance": "Inside allowance", unknown: "Not recorded" };
function renderBills(m) {
  const lines = m.lines;
  if (!lines.length) { $("fin-bills").innerHTML = '<p class="panel-note">No active bills found on the Recurring Expenses tab.</p>'; return; }
  const sections = [...new Set(lines.map((b) => b.section))];
  const sum = (xs) => xs.reduce((n, b) => n + (b.monthlyAmount ?? 0), 0);
  const due = (d) => (d ? (/^\d+$/.test(d) ? `Day ${d}` : d) : "–");
  const inA = m.commitments.inAllowance.names;
  $("fin-bills").innerHTML = `
    <p class="fin-lead">${lines.length} active bills. The household pays <strong>${money(m.commitments.needsBills + m.commitments.wantsBills)}</strong> a month${m.commitments.parent.count ? `; ${money(m.commitments.parent.total)} more is on a parent's card` : ""}.</p>
    ${inA.length ? `<p class="fin-note">${esc(inA.join(", "))} ${inA.length === 1 ? "is" : "are"} paid from the allowance account, so ${inA.length === 1 ? "it's" : "they're"} inside the allowance, not counted again.</p>` : ""}
    <ul class="fin-sections">${sections.map((s) => {
      const list = lines.filter((b) => b.section === s);
      return `<li><details>
      <summary><span class="fin-sec-name">${esc(s)}</span><span class="fin-sec-sum">${money(sum(list.filter((b) => b.funding !== "parent" && b.funding !== "in-allowance")))} a month · ${list.length} ${list.length === 1 ? "bill" : "bills"}</span></summary>
      ${table(`${s} bills`, ["Bill", "Amount", "How often", "Due", "Monthly", { label: "Paid from", num: false }], list.map((b) =>
        `<tr><th scope="row">${esc(b.name)}${b.kind ? ` <span class="fin-tag">${esc(b.kind)}</span>` : ""}${b.note ? `<details class="fin-row-note"><summary>Note</summary>${esc(b.note)}</details>` : ""}</th>
        <td class="num">${money(b.amount, true)}</td><td class="num">${esc(b.frequency || "–")}</td><td class="num">${esc(due(b.due))}</td>
        <td class="num">${b.monthlyAmount == null ? "Unknown" : money(b.monthlyAmount, true)}${b.computed ? " (worked out)" : ""}</td>
        <td>${esc(FUND[b.funding] || b.account)} ${sheetLink(b.ref, "Sheet")}</td></tr>`))}
    </details></li>`;
    }).join("")}</ul>
    ${m.planned.length ? `<p class="fin-note">Planned, no amount yet: ${esc(m.planned.map((p) => p.name).join(", "))}.</p>` : ""}`;
}

// ---------- Where the numbers come from ----------
function renderSources(m) {
  $("fin-sources").innerHTML = more("How each number is worked out", `<dl class="fin-sources">${m.sources.map((s) => `<div>
    <dt>${esc(s.metric)}</dt>
    <dd><p>${esc(s.formula)}</p><p><strong>Date:</strong> ${esc(s.date)}</p><p><strong>Limits:</strong> ${esc(s.limits)}</p>${s.refs.length ? `<p>${s.refs.map((r) => sheetLink(r)).join(" · ")}</p>` : ""}</dd>
  </div>`).join("")}</dl>`) + (m.savingsNote ? more("Savings source note", `<p>${esc(m.savingsNote.text)}</p>`) : "");
}

$("btn-refresh").addEventListener("click", () => load(true));

let started = false;
Brain.boot({ onUpdate(state) { if (state.auth === "in" && !started) { started = true; load(); } } });
