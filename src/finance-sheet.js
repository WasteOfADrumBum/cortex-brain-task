// Reads the J&M P&L workbook (grids from src/xlsx-lite.js) into the model the Finances tab and Home show.
// The sheet is written for people, not code, so rows are found by their labels ("CURRENT SNAPSHOT", "Expense",
// "Account") rather than fixed cells, and a missing tab or section just leaves that part empty.
// Runs only in the browser: the numbers never go to the Cortex server, a log or Drive. Account digits ("x1234")
// and bracketed codes are dropped from names, and long note columns are never read.

/** @typedef {import('./xlsx-lite.js').Grid} Grid */
/** @typedef {import('./types').SheetFinance} SheetFinance */
/** @typedef {import('./types').SheetBill} SheetBill */

/** The tabs Cortex reads; everything else in the workbook is ignored. */
export const TABS = ['Summary', 'Recurring Expenses', 'Debt & Loans', 'Savings'];

const blank = (/** @type {unknown} */ v) => v == null || (typeof v === 'string' && !v.trim());
const label = (/** @type {unknown} */ v) => (blank(v) ? '' : String(v).replace(/\s+/g, ' ').trim());

/** A money cell -> number, or null for empty, "-" or text. Accepts numbers and "$1,234.50" style text. */
export function amount(/** @type {unknown} */ v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s) * 100) / 100;
}
/** A percent cell -> fraction (0.5 for 50%). Numbers from the .xlsx are already fractions. */
export function percent(/** @type {unknown} */ v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = /^(-?\d+(?:\.\d+)?)\s*%$/.exec(v.trim());
  return m ? Math.round(Number(m[1]) * 100) / 10000 : null;
}
/** Names without account digits, card marks or bracketed codes: "Joint Reserve  x9783" -> "Joint Reserve". */
export function cleanName(/** @type {unknown} */ v) {
  return label(v).replace(/\[[^\]]*\]/g, '').replace(/\bx\d{3,}\b/gi, '').replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();
}
/** Short status words only ("Active", "Paid Off"); long notes in a status column are dropped. */
const shortText = (/** @type {unknown} */ v, max = 24) => { const s = label(v); return s && s.length <= max ? s : ''; };

const rowEmpty = (/** @type {Grid[number] | undefined} */ row) => !row || row.every(blank);
const findRow = (/** @type {Grid} */ g, /** @type {RegExp} */ rx, from = 0) => {
  for (let r = from; r < g.length; r++) if (rx.test(label(g[r]?.[0]))) return r;
  return -1;
};
/** A new section's title row, like "DEBT SUMMARY": capitals only, longer than a short code such as "HOA". */
const isTitle = (/** @type {Grid[number] | undefined} */ row) => { const s = label(row?.[0]); return s.length > 6 && /[A-Z]/.test(s) && s === s.toUpperCase(); };
/** Rows after `start` up to the next empty row or section title. */
function block(/** @type {Grid} */ g, /** @type {number} */ start) {
  const out = [];
  for (let r = start + 1; r < g.length && !rowEmpty(g[r]) && !isTitle(g[r]); r++) out.push(g[r]);
  return out;
}
/** The last money value in a row (label-and-amount lists keep the amount in the far column). */
const lastAmount = (/** @type {Grid[number]} */ row) => { for (let c = row.length - 1; c > 0; c--) { const a = amount(row[c]); if (a != null) return a; } return null; };

/** A list section on Summary: label in A, amount in the last column; an unlabelled row is the total. */
function kvList(/** @type {Grid} */ g, /** @type {RegExp} */ title, /** @type {string} */ totalLabel) {
  const at = findRow(g, title);
  if (at < 0) return [];
  return block(g, at).map((row) => ({ label: label(row[0]) || totalLabel, amount: lastAmount(row), total: !label(row[0]) }));
}

/** Summary: the per-period snapshot, debt, savings, safety net and the 50/30/20 table. */
function summary(/** @type {Grid} */ g) {
  const snapAt = findRow(g, /^current snapshot/i);
  const snapshot = snapAt < 0 ? [] : block(g, snapAt).map((row) => ({
    label: label(row[0]) || 'Left over',
    payPeriod: amount(row[1]), monthly: amount(row[2]), yearly: amount(row[3]),
    kind: /** @type {'income' | 'out' | 'left'} */ (!label(row[0]) ? 'left' : /income/i.test(label(row[0])) ? 'income' : 'out'),
  }));
  const allocAt = (() => { for (let r = 0; r < g.length; r++) if (/^category$/i.test(label(g[r]?.[0])) && /actual/i.test(label(g[r]?.[1]))) return r; return -1; })();
  const rows = allocAt < 0 ? [] : block(g, allocAt);
  const allocation = rows.filter((r) => !/net income/i.test(label(r[0]))).map((r) => ({
    category: label(r[0]).replace(/\s*\(\d+%\)\s*$/, ''),
    actual: amount(r[1]), actualShare: percent(r[2]), target: amount(r[3]), targetShare: percent(r[4]),
  }));
  const net = rows.find((r) => /net income/i.test(label(r[0])));
  return {
    snapshot,
    debt: kvList(g, /^debt$/i, 'Total'),
    savings: kvList(g, /^current savings balances/i, 'Total savings'),
    safetyNet: kvList(g, /^safety net/i, 'Total'),
    allocation,
    allocationBase: net ? amount(net[1]) : null,
  };
}

/** Header row -> column index finder. */
function columns(/** @type {Grid[number]} */ header) {
  const names = header.map(label);
  return (/** @type {RegExp} */ rx) => names.findIndex((n) => rx.test(n));
}
/** The nearest single-label row above `r` (a section title like "HOME & UTILITIES"). */
function titleAbove(/** @type {Grid} */ g, /** @type {number} */ r) {
  for (let i = r - 1; i >= 0; i--) {
    const row = g[i];
    if (rowEmpty(row)) continue;
    const filled = row.filter((v) => !blank(v));
    if (filled.length === 1) return label(filled[0]);
    return '';
  }
  return '';
}
const titleCase = (/** @type {string} */ s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s&/-])\w/g, (m) => m.toUpperCase()) : s);

/** Recurring Expenses: every table headed "Expense", skipping totals and rows with no amount. */
function bills(/** @type {Grid} */ g) {
  /** @type {SheetBill[]} */
  const out = [];
  for (let r = 0; r < g.length; r++) {
    if (!/^expense$/i.test(label(g[r]?.[0]))) continue;
    const col = columns(g[r]);
    const title = titleAbove(g, r);
    // Cancelled and historical tables list what used to be paid ("Cancel Date", "Monthly Savings"): not bills.
    if (/cancel|historical|former/i.test(title) || col(/cancel|savings/i) >= 0) continue;
    const section = titleCase(title) || 'Other';
    const c = { kind: col(/50\/30\/20/), amount: col(/^amount/i), freq: col(/frequency/i), due: col(/^due/i), monthly: col(/^monthly/i), yearly: col(/^yearly/i), status: col(/^status/i) };
    for (const row of block(g, r)) {
      const name = cleanName(row[0]);
      if (!name || /\btotal$/i.test(name)) continue;
      const each = c.amount >= 0 ? amount(row[c.amount]) : null;
      const monthly = c.monthly >= 0 ? amount(row[c.monthly]) : null;
      if (!each && !monthly) continue;
      const status = c.status >= 0 ? shortText(row[c.status]) : '';
      if (status && !/^active$/i.test(status)) continue;
      const kind = c.kind >= 0 ? label(row[c.kind]) : '';
      out.push({
        name, section,
        kind: /^need/i.test(kind) ? 'Need' : /^want/i.test(kind) ? 'Want' : '',
        amount: each, frequency: c.freq >= 0 ? label(row[c.freq]) : '',
        due: c.due >= 0 ? dueText(row[c.due]) : '',
        monthly, yearly: c.yearly >= 0 ? amount(row[c.yearly]) : null,
      });
    }
  }
  return out;
}

/** Spreadsheet date serial (days since 1899-12-30) -> "Jan 31". Small numbers are days of the month. */
function dueText(/** @type {unknown} */ v) {
  if (typeof v === 'number') {
    if (v >= 1 && v <= 31) return String(Math.round(v));
    if (v > 59) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    }
    return '';
  }
  return shortText(v, 30);
}

/** Debt & Loans: loan tables (Account, Type, Balance) and the credit-card table (Account, Balance, APR). */
function debts(/** @type {Grid} */ g) {
  const loans = [];
  const cards = [];
  for (let r = 0; r < g.length; r++) {
    if (!/^account$/i.test(label(g[r]?.[0]))) continue;
    const col = columns(g[r]);
    const isCards = col(/^apr/i) >= 0;
    const c = { type: col(/^type$/i), balance: col(/^balance/i), payment: col(/^monthly payment/i), apr: col(/^apr/i), due: col(/^due/i), status: col(/^status/i) };
    for (const row of block(g, r)) {
      const name = cleanName(row[0]);
      if (!name) continue;
      const status = c.status >= 0 ? shortText(row[c.status]) : '';
      const balance = c.balance >= 0 ? amount(row[c.balance]) : null;
      if (isCards) {
        cards.push({ name, balance: balance ?? 0, apr: c.apr >= 0 ? percent(row[c.apr]) : null, due: c.due >= 0 ? dueText(row[c.due]) : '', status });
      } else {
        loans.push({ name, type: c.type >= 0 ? label(row[c.type]) : '', balance, monthly: c.payment >= 0 ? amount(row[c.payment]) : null, due: c.due >= 0 ? dueText(row[c.due]) : '', status });
      }
    }
  }
  return { loans, cards };
}

/** Savings: the cash accounts table (Account, Purpose, Current Balance). */
function accounts(/** @type {Grid} */ g) {
  const at = findRow(g, /savings accounts/i);
  if (at < 0) return [];
  const col = columns(g[at]);
  const c = { purpose: col(/^purpose/i), balance: col(/balance/i), type: col(/^type$/i) };
  return block(g, at).map((row) => ({
    name: cleanName(row[0]),
    purpose: c.purpose >= 0 ? shortText(row[c.purpose], 40) : '',
    balance: c.balance >= 0 ? amount(row[c.balance]) : null,
    group: c.type >= 0 ? shortText(row[c.type]) : '',
  })).filter((a) => a.name);
}

/**
 * The whole model from the workbook's grids. Missing tabs leave their parts empty and are named in `missing`.
 * @param {Record<string, Grid>} tabs
 * @returns {SheetFinance}
 */
export function parseWorkbook(tabs) {
  const s = tabs.Summary ? summary(tabs.Summary) : { snapshot: [], debt: [], savings: [], safetyNet: [], allocation: [], allocationBase: null };
  const d = tabs['Debt & Loans'] ? debts(tabs['Debt & Loans']) : { loans: [], cards: [] };
  return {
    ...s,
    bills: tabs['Recurring Expenses'] ? bills(tabs['Recurring Expenses']) : [],
    loans: d.loans,
    cards: d.cards,
    accounts: tabs.Savings ? accounts(tabs.Savings) : [],
    missing: TABS.filter((t) => !tabs[t]),
  };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/**
 * The next date a bill or debt is due on or after `today`, or null when its due date isn't a date
 * ("With AT&T bill", blank, or a one-time date that has passed). "6" or "9th" is a day each month;
 * "Jan 31" is a day each year; "Nov 13, 2026" is that day only.
 * @param {string} due
 * @param {Date} today local midnight
 */
export function nextDue(due, today) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const day = /^(\d{1,2})(?:st|nd|rd|th)?$/i.exec(due.trim());
  if (day) {
    const d = Number(day[1]);
    if (d < 1 || d > 31) return null;
    const at = (/** @type {number} */ y, /** @type {number} */ m) => new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate()));
    const thisMonth = at(t.getFullYear(), t.getMonth());
    return thisMonth >= t ? thisMonth : at(t.getFullYear(), t.getMonth() + 1);
  }
  const md = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/.exec(due.trim());
  if (!md) return null;
  const m = MONTHS.indexOf(md[1].toLowerCase());
  if (m < 0) return null;
  if (md[3]) { const once = new Date(Number(md[3]), m, Number(md[2])); return once >= t ? once : null; }
  const y = new Date(t.getFullYear(), m, Number(md[2]));
  return y >= t ? y : new Date(t.getFullYear() + 1, m, Number(md[2]));
}

/**
 * Bills and debt payments due within `days` of today, soonest first.
 * @param {SheetFinance} f
 * @param {Date} today
 * @param {number} days
 * @returns {{ name: string, amount: number | null, date: Date, kind: string }[]}
 */
export function upcoming(f, today, days) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const out = [];
  for (const b of f.bills) {
    const date = b.due ? nextDue(b.due, today) : null;
    if (date && date <= end) out.push({ name: b.name, amount: b.amount, date, kind: 'Bill' });
  }
  for (const l of f.loans) {
    const date = l.due ? nextDue(l.due, today) : null;
    if (date && date <= end && (l.monthly ?? 0) > 0) out.push({ name: l.name, amount: l.monthly, date, kind: 'Loan' });
  }
  for (const c of f.cards) {
    const date = c.due ? nextDue(c.due, today) : null;
    if (date && date <= end && c.balance > 0) out.push({ name: c.name, amount: null, date, kind: 'Card' });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** The monthly headline numbers: take-home in, everything out, and what's left. */
export function monthly(/** @type {SheetFinance} */ f) {
  const income = f.snapshot.filter((r) => r.kind === 'income').reduce((n, r) => n + (r.monthly ?? 0), 0);
  const outRows = f.snapshot.filter((r) => r.kind === 'out');
  const out = outRows.reduce((n, r) => n + (r.monthly ?? 0), 0);
  const left = f.snapshot.find((r) => r.kind === 'left')?.monthly ?? Math.round((income - out) * 100) / 100;
  return { income, out: Math.round(out * 100) / 100, left, rows: outRows };
}
