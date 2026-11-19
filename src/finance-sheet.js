// Reads the J&M P&L workbook (grids from src/xlsx-lite.js) into the raw model that src/finance-model.js works on.
// The sheet is written for people, not code, so rows are found by their labels ("CURRENT SNAPSHOT", "Expense",
// "Account") rather than fixed cells, and a missing tab or section just leaves that part empty.
// Every item keeps where it came from (tab and row) so the page can link back to it.
// Runs only in the browser: the numbers never go to the Cortex server, a log or Drive. Account digits ("x1234"),
// card marks, links and long number runs are scrubbed from names and notes before anything is kept.
// This file only reads. Interpreting the numbers (what is an estimate, what is missing, what conflicts) is
// src/finance-model.js's job.

/** @typedef {import('./xlsx-lite.js').Grid} Grid */
/** @typedef {import('./types').SheetFinance} SheetFinance */
/** @typedef {import('./types').SheetBill} SheetBill */
/** @typedef {import('./types').SheetRef} SheetRef */

/**
 * Which workbook tab plays each part, by its name in the real J&M P&L. The demo passes its own names. Only these
 * tabs are read; everything else in the workbook is ignored. The first four are needed for the basics.
 */
export const TAB_NAMES = {
  summary: 'Summary', recurring: 'Recurring Expenses', debt: 'Debt & Loans', savings: 'Savings',
  dashboard: 'Dashboard Data', estimates: 'Estimate Inputs', income: 'Joshua Income', partnerIncome: 'Maggie Income',
  paychecks: 'Joshua Paycheck History', occasional: 'Occasional Costs', netWorth: 'Net Worth History',
  billTrends: 'Bill Trends', water: 'Davidson Water', layoff: 'Layoff Plan',
};
/** The tab names to read from the .xlsx export. */
export const TABS = Object.values(TAB_NAMES);

const blank = (/** @type {unknown} */ v) => v == null || (typeof v === 'string' && !v.trim());
const label = (/** @type {unknown} */ v) => (blank(v) ? '' : String(v).replace(/\s+/g, ' ').trim());

/** A formula error as Google exports it ("#REF!", "#N/A", "#DIV/0!"). */
export const isFormulaError = (/** @type {unknown} */ v) => typeof v === 'string' && /^#(REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|ERROR!|SPILL!|CALC!)$/.test(v.trim());

/** A money cell -> number, or null for empty, "-", text or a formula error. Numbers keep full precision. */
export function amount(/** @type {unknown} */ v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim();
  const neg = /^\(.*\)$/.test(s) || /^-\$/.test(s) || /^-\d/.test(s);
  s = s.replace(/[$,\s()]/g, '').replace(/^-/, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return neg ? -n : n;
}
/** A percent cell -> fraction (0.5 for 50%). Numbers from the .xlsx are already fractions. */
export function percent(/** @type {unknown} */ v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = /^(-?\d+(?:\.\d+)?)\s*%$/.exec(v.trim());
  return m ? Math.round(Number(m[1]) * 100) / 10000 : null;
}
/** "5.8 months" or 5.8 -> 5.8. */
export function months(/** @type {unknown} */ v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = /^(\d+(?:\.\d+)?)\s*months?$/i.exec(label(v));
  return m ? Number(m[1]) : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function valid(/** @type {number} */ y, /** @type {number} */ mo, /** @type {number} */ d) {
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null;
}
/**
 * A date cell or a date written on its own -> "YYYY-MM-DD", or null. Accepts spreadsheet serials (days since
 * 1899-12-30), "2026-11-02", "11/02/2026" and "Nov 9, 2026". Text with anything else around it is not a date.
 */
export function isoDate(/** @type {unknown} */ v) {
  if (typeof v === 'number') {
    if (v < 30000 || v > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
  }
  const s = label(v);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return valid(+m[3], +m[1], +m[2]);
  m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m && MONTHS.includes(m[1].toLowerCase())) return valid(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  return null;
}
/**
 * The latest full date written inside a note ("Nov 9, 2026", "2026-10-24", "10/30/2026") on or before `notAfter`
 * (so a maturity date or next renewal isn't mistaken for when the note was written), or null.
 * Only used to show "the note mentions …"; it is never treated as a bank balance date.
 */
export function noteDate(/** @type {string} */ text, /** @type {string} */ notAfter = '9999-12-31') {
  const ok = noteDates(text).filter((d) => d <= notAfter);
  return ok.length ? ok[ok.length - 1] : null;
}
/** Every full date written inside a note, oldest first. */
export function noteDates(/** @type {string} */ text) {
  if (!text) return [];
  const found = [];
  for (const m of text.matchAll(/\b([A-Z][a-z]{2})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
    const i = MONTHS.indexOf(m[1].toLowerCase());
    if (i >= 0) found.push(valid(+m[3], i + 1, +m[2]));
  }
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) found.push(valid(+m[1], +m[2], +m[3]));
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) found.push(valid(+m[3], +m[1], +m[2]));
  return /** @type {string[]} */ (found.filter(Boolean)).sort();
}

/** Names without account digits, card marks or bracketed codes: "Joint Reserve  x9783" -> "Joint Reserve". */
export function cleanName(/** @type {unknown} */ v) {
  return label(v).replace(/\[[^\]]*\]/g, '').replace(/\bx\d{3,}\b/gi, '').replace(/[•*]{1,}\s?\d{3,}/g, '').replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();
}
/**
 * A note with nothing that identifies an account: links, emails, account digits ("x1234", "••••5678", "*9012"),
 * long digit runs (account and customer numbers) and message ids are removed. Dates and amounts stay.
 */
export function scrub(/** @type {unknown} */ v) {
  return label(v)
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[email]')
    .replace(/\b[xX]\d{3,}\b/g, '')
    .replace(/[•*]+\s?\d{3,}/g, '')
    .replace(/\b(?=[a-f0-9]*\d)(?=[a-f0-9]*[a-f])[a-f0-9]{12,}\b/gi, '')
    .replace(/(?<![\d.,$/-])\d{5,}(?![\d.,%/-])/g, '')
    .replace(/\s+([,.;)])/g, '$1').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
}
/** Short status words only ("Active", "Paid Off"); long notes in a status column go to `note` instead. */
const shortText = (/** @type {unknown} */ v, max = 24) => { const s = label(v); return s && s.length <= max ? s : ''; };

const rowEmpty = (/** @type {Grid[number] | undefined} */ row) => !row || row.every(blank);
const findRow = (/** @type {Grid} */ g, /** @type {RegExp} */ rx, from = 0) => {
  for (let r = from; r < g.length; r++) if (rx.test(label(g[r]?.[0]))) return r;
  return -1;
};
/** A new section's title row, like "DEBT SUMMARY": capitals only, longer than a short code such as "HOA". */
const isTitle = (/** @type {Grid[number] | undefined} */ row) => { const s = label(row?.[0]); return s.length > 6 && /[A-Z]/.test(s) && s === s.toUpperCase(); };
/** Rows after `start` up to the next empty row or section title, each with its zero-based index. */
function block(/** @type {Grid} */ g, /** @type {number} */ start) {
  /** @type {{ row: Grid[number], r: number }[]} */
  const out = [];
  for (let r = start + 1; r < g.length && !rowEmpty(g[r]) && !isTitle(g[r]); r++) out.push({ row: g[r], r });
  return out;
}
/** The last money value in a row (label-and-amount lists keep the amount in the far column). */
const lastAmount = (/** @type {Grid[number]} */ row) => { for (let c = row.length - 1; c > 0; c--) { const a = amount(row[c]); if (a != null) return a; } return null; };
/** Where a row lives, for links: one-based sheet row, columns A to `toCol`. */
const ref = (/** @type {string} */ tab, /** @type {number} */ r, toCol = 'Z') => /** @type {SheetRef} */ ({ tab, range: `A${r + 1}:${toCol}${r + 1}` });
const refSpan = (/** @type {string} */ tab, /** @type {number} */ r1, /** @type {number} */ r2, toCol = 'Z') => /** @type {SheetRef} */ ({ tab, range: `A${r1 + 1}:${toCol}${r2 + 1}` });
const cell = (/** @type {Grid[number]} */ row, /** @type {number} */ c) => (c >= 0 ? row[c] ?? null : null);

/** A list section on Summary: label in A, amount in the last column; an unlabelled row is the total. */
function kvList(/** @type {Grid} */ g, /** @type {RegExp} */ title, /** @type {string} */ totalLabel, /** @type {string} */ tab) {
  const at = findRow(g, title);
  if (at < 0) return [];
  return block(g, at).map(({ row, r }) => ({ label: label(row[0]) || totalLabel, amount: lastAmount(row), total: !label(row[0]), ref: ref(tab, r, 'F') }));
}

/** Summary: the per-period snapshot, debt, savings, safety net and the 50/30/20 table (kept for comparison only). */
function summary(/** @type {Grid} */ g, /** @type {string} */ tab) {
  const snapAt = findRow(g, /^current snapshot/i);
  const snapshot = snapAt < 0 ? [] : block(g, snapAt).map(({ row, r }) => ({
    label: label(row[0]) || 'Left over',
    payPeriod: amount(row[1]), monthly: amount(row[2]), yearly: amount(row[3]),
    kind: /** @type {'income' | 'out' | 'left'} */ (!label(row[0]) ? 'left' : /income/i.test(label(row[0])) ? 'income' : 'out'),
    ref: ref(tab, r, 'D'),
  }));
  const allocAt = (() => { for (let r = 0; r < g.length; r++) if (/^category$/i.test(label(g[r]?.[0])) && /actual/i.test(label(g[r]?.[1]))) return r; return -1; })();
  const rows = allocAt < 0 ? [] : block(g, allocAt).map((x) => x.row);
  const allocation = rows.filter((r) => !/net income/i.test(label(r[0]))).map((r) => ({
    category: label(r[0]).replace(/\s*\(\d+%\)\s*$/, ''),
    actual: amount(r[1]), actualShare: percent(r[2]), target: amount(r[3]), targetShare: percent(r[4]),
  }));
  const net = rows.find((r) => /net income/i.test(label(r[0])));
  return {
    snapshot,
    debt: kvList(g, /^debt$/i, 'Total', tab),
    savings: kvList(g, /^current savings balances/i, 'Total savings', tab),
    safetyNet: kvList(g, /^safety net/i, 'Total', tab),
    allocation,
    allocationBase: net ? amount(net[1]) : null,
    allocationRef: allocAt < 0 ? null : refSpan(tab, allocAt, allocAt + rows.length, 'F'),
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
const titleCase = (/** @type {string} */ s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s&/(-])\w/g, (m) => m.toUpperCase()) : s);

/**
 * Recurring Expenses: every table headed "Expense". Active rows (and rows with no status) are bills; planned rows
 * are kept apart so the page can say they have no amount yet; cancelled and historical tables are skipped.
 */
function recurring(/** @type {Grid} */ g, /** @type {string} */ tab) {
  /** @type {SheetBill[]} */
  const bills = [];
  /** @type {SheetBill[]} */
  const planned = [];
  for (let r = 0; r < g.length; r++) {
    if (!/^expense$/i.test(label(g[r]?.[0]))) continue;
    const col = columns(g[r]);
    const title = titleAbove(g, r);
    if (/cancel|historical|former/i.test(title) || col(/cancel|savings/i) >= 0) continue;
    const section = titleCase(title) || 'Other';
    const c = {
      sub: col(/^subcategory/i), owner: col(/^owner/i), kind: col(/50\/30\/20/), amount: col(/^amount/i), freq: col(/frequency/i),
      due: col(/^due/i), monthly: col(/^monthly/i), yearly: col(/^yearly/i), status: col(/^status/i), renew: col(/^renewal/i),
      account: col(/^payment/i), note: col(/^notes?/i),
    };
    for (const { row, r: at } of block(g, r)) {
      const name = cleanName(row[0]);
      if (!name || /\btotal$/i.test(name)) continue;
      const status = label(cell(row, c.status));
      const kind = label(cell(row, c.kind));
      const rawMonthly = cell(row, c.monthly);
      /** @type {SheetBill} */
      const bill = {
        name, section,
        subcategory: label(cell(row, c.sub)),
        owner: label(cell(row, c.owner)),
        kind: /^need/i.test(kind) ? 'Need' : /^want/i.test(kind) ? 'Want' : '',
        amount: amount(cell(row, c.amount)),
        frequency: label(cell(row, c.freq)),
        due: dueText(cell(row, c.due)),
        monthly: amount(rawMonthly),
        yearly: amount(cell(row, c.yearly)),
        status: shortText(status) || (status ? 'See note' : ''),
        renewal: shortText(cell(row, c.renew), 30),
        account: cleanName(cell(row, c.account)),
        note: scrub(cell(row, c.note)),
        error: [rawMonthly, cell(row, c.amount)].some(isFormulaError),
        ref: ref(tab, at, 'N'),
      };
      if (/^planned$/i.test(status)) planned.push(bill);
      else if (!status || /^active$/i.test(status)) bills.push(bill);
    }
  }
  return { bills, planned };
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

/** Debt & Loans: loan and device tables (Account, Type, Balance), the card table (Account, Balance, APR) and notes. */
function debts(/** @type {Grid} */ g, /** @type {string} */ tab) {
  const loans = [];
  const cards = [];
  for (let r = 0; r < g.length; r++) {
    if (!/^account$/i.test(label(g[r]?.[0]))) continue;
    const col = columns(g[r]);
    const isCards = col(/^apr/i) >= 0;
    const group = titleCase(titleAbove(g, r)) || (isCards ? 'Credit Cards' : 'Loans');
    const c = {
      type: col(/^type$/i), balance: col(/^balance/i), occurrence: col(/^payment \/ occurrence/i), freq: col(/^frequency/i),
      payment: col(/^monthly payment/i), apr: col(/^apr/i), limit: col(/limit/i), due: col(/^due/i), status: col(/^status/i), note: col(/^notes?/i),
    };
    for (const { row, r: at } of block(g, r)) {
      const name = cleanName(row[0]);
      if (!name) continue;
      const statusRaw = label(cell(row, c.status));
      const status = shortText(statusRaw);
      const balance = amount(cell(row, c.balance));
      const note = scrub([statusRaw.length > 24 ? statusRaw : '', label(cell(row, c.note))].filter(Boolean).join(' '));
      const dueCell = cell(row, c.due);
      const dueRaw = label(dueCell);
      if (isCards) {
        const paidOff = /paid off/i.test(statusRaw);
        cards.push({
          name, group,
          // A blank or "-" balance is only a confirmed zero when the card is marked paid off; otherwise it's unknown.
          balance: balance ?? (paidOff ? 0 : null),
          apr: percent(cell(row, c.apr)), limit: amount(cell(row, c.limit)),
          due: typeof dueCell === 'number' ? dueText(dueCell) : dueRaw.length <= 40 ? dueRaw : '',
          status, note, ref: ref(tab, at, 'K'),
        });
      } else {
        loans.push({
          name, group, type: label(cell(row, c.type)), balance,
          payment: amount(cell(row, c.occurrence)), frequency: label(cell(row, c.freq)),
          monthly: amount(cell(row, c.payment)), due: typeof dueCell === 'number' ? dueText(dueCell) : shortText(dueRaw, 40),
          status, note, ref: ref(tab, at, 'K'),
        });
      }
    }
  }
  const sumAt = findRow(g, /^debt summary/i);
  const debtSummary = sumAt < 0 ? [] : block(g, sumAt).map(({ row, r }) => ({ label: label(row[0]), amount: amount(row[1]), ref: ref(tab, r, 'B') }));
  // Long one-cell notes below the tables (mortgage evidence, card snapshot dates).
  const debtNotes = [];
  for (let r = 0; r < g.length; r++) {
    const s = label(g[r]?.[0]);
    if (s.length > 80 && (g[r] || []).filter((v) => !blank(v)).length === 1) debtNotes.push({ text: scrub(s), date: noteDate(s), ref: ref(tab, r, 'A') });
  }
  return { loans, cards, debtSummary, debtNotes };
}

/** Savings: cash accounts, the retirement/investment table, Maggie's separate cash, and the source notes. */
function savingsTab(/** @type {Grid} */ g, /** @type {string} */ tab) {
  const at = findRow(g, /savings accounts/i);
  const accounts = [];
  if (at >= 0) {
    const col = columns(g[at]);
    const c = { purpose: col(/^purpose/i), balance: col(/balance/i), deposit: col(/^deposit/i), type: col(/^type$/i) };
    for (const { row, r } of block(g, at)) {
      const name = cleanName(row[0]);
      if (!name) continue;
      accounts.push({
        name, purpose: shortText(cell(row, c.purpose), 40), balance: amount(cell(row, c.balance)),
        deposit: amount(cell(row, c.deposit)), group: shortText(cell(row, c.type)), ref: ref(tab, r, 'E'),
      });
    }
  }
  const invAt = findRow(g, /^savings \/ investments/i);
  const investments = [];
  if (invAt >= 0) {
    const col = columns(g[invAt]);
    for (const { row, r } of block(g, invAt)) {
      const name = cleanName(row[0]);
      if (!name || /total/i.test(name)) continue;
      investments.push({
        name, type: label(cell(row, col(/^type$/i))), perPeriod: amount(cell(row, col(/pay period/i))), monthly: amount(cell(row, col(/^monthly/i))),
        status: shortText(cell(row, col(/^status/i))), note: scrub(cell(row, col(/^notes?/i))), ref: ref(tab, r, 'H'),
      });
    }
  }
  const sepAt = findRow(g, /cash snapshot/i);
  const separateCash = [];
  let separateCashDate = null;
  if (sepAt >= 0) {
    for (const { row, r } of block(g, sepAt)) {
      const name = cleanName(row[0]);
      const d = /^received\s+(.+)$/i.exec(name);
      if (d) { separateCashDate = isoDate(d[1]); continue; }
      if (!name || /^total/i.test(name)) continue;
      separateCash.push({ name, balance: amount(row[1]), kind: shortText(row[2], 60), ref: ref(tab, r, 'C') });
    }
  }
  const savingsNotes = [];
  for (let r = 0; r < g.length; r++) {
    const s = label(g[r]?.[0]);
    if (s.length > 80) savingsNotes.push({ text: scrub(s), date: noteDate(s), ref: ref(tab, r, 'A') });
  }
  return { accounts, investments, separateCash, separateCashDate, savingsNotes };
}

/**
 * A label/value tab (Dashboard Data, Estimate Inputs): every row with a label in A, with its section. Values stay
 * raw so the model can read them as money, percent, months, dates or Yes/No.
 */
function labelled(/** @type {Grid} */ g, /** @type {string} */ tab) {
  const rows = [];
  let section = '';
  for (let r = 0; r < g.length; r++) {
    const row = g[r] || [];
    const name = label(row[0]);
    if (!name) continue;
    if (isTitle(row)) section = name;
    rows.push({ section, label: name, value: row[1] ?? null, b: label(row[1]), c: scrub(row[2]), d: scrub(row[3]), e: scrub(row[4]), ref: ref(tab, r, 'E') });
  }
  return rows;
}

/** Joshua Income: income rows (with "Include in Baseline?") and the per-paycheck routing table. */
function income(/** @type {Grid} */ g, /** @type {string} */ tab) {
  const at = findRow(g, /^income source/i);
  const sources = [];
  if (at >= 0) {
    const col = columns(g[at]);
    const c = { type: col(/^type$/i), include: col(/baseline/i), netPP: col(/^net \/ pay/i), grossPP: col(/^gross \/ pay/i), netM: col(/^net monthly/i), grossM: col(/^gross monthly/i), netY: col(/^net yearly/i), grossY: col(/^gross yearly/i) };
    for (const { row, r } of block(g, at)) {
      const name = label(row[0]);
      if (!name) continue;
      sources.push({
        name: cleanName(name), type: label(cell(row, c.type)), include: /^yes/i.test(label(cell(row, c.include))),
        netPerPeriod: amount(cell(row, c.netPP)), grossPerPeriod: amount(cell(row, c.grossPP)),
        netMonthly: amount(cell(row, c.netM)), grossMonthly: amount(cell(row, c.grossM)),
        netYearly: amount(cell(row, c.netY)), grossYearly: amount(cell(row, c.grossY)), ref: ref(tab, r, 'I'),
      });
    }
  }
  const rAt = findRow(g, /direct deposit routing/i);
  const routing = [];
  if (rAt >= 0) {
    const col = columns(g[rAt]);
    for (const { row, r } of block(g, rAt)) {
      const name = cleanName(row[0]);
      if (!name) continue;
      routing.push({
        account: name, purpose: label(cell(row, col(/^purpose/i))), perPeriod: amount(cell(row, col(/per pay period/i))),
        monthly: amount(cell(row, col(/^monthly/i))), savings: /^yes/i.test(label(cell(row, col(/savings/i)))), ref: ref(tab, r, 'F'),
      });
    }
  }
  const notes = [];
  for (let r = 0; r < g.length; r++) { const s = label(g[r]?.[0]); if (s.length > 60) notes.push({ text: scrub(s), date: noteDate(s), ref: ref(tab, r, 'A') }); }
  return { sources, routing, notes };
}

/** Maggie Income: only whether each scenario is in the baseline, and its monthly gross, for the "excluded" list. */
function scenarioIncome(/** @type {Grid} */ g, /** @type {string} */ tab) {
  const out = [];
  for (let r = 0; r < g.length; r++) {
    const col = columns(g[r] || []);
    const inc = col(/include in baseline/i);
    if (inc < 0) continue;
    for (const { row, r: at } of block(g, r)) {
      const name = label(row[0]);
      if (!name) continue;
      out.push({ name, include: /^yes/i.test(label(row[inc])), grossMonthly: amount(cell(row, col(/gross monthly/i))), ref: ref(tab, at, 'J') });
    }
  }
  return out;
}

/** Joshua Paycheck History: the dated current paycheck (a payday anchor), its pay period, salary history, deposits. */
function paychecks(/** @type {Grid} */ g, /** @type {string} */ tab) {
  let anchor = null, anchorRef = null, periodDays = null, netPerCheck = null;
  const titleAt = findRow(g, /^current paycheck\b/i);
  if (titleAt >= 0) {
    const m = /(\d{1,2}\/\d{1,2}\/\d{4})\s*$/.exec(label(g[titleAt][0]));
    anchor = m ? isoDate(m[1]) : null;
    anchorRef = ref(tab, titleAt, 'F');
  }
  const ppAt = findRow(g, /^pay period$/i);
  if (ppAt >= 0) {
    const row = g[ppAt + 1] || [];
    const m = /^(\S+)\s*-\s*(\S+)$/.exec(label(row[0]));
    const a = m && isoDate(m[1]), b = m && isoDate(m[2]);
    if (a && b) periodDays = Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
    netPerCheck = amount(cell(row, columns(g[ppAt])(/^net/i)));
  }
  const hAt = findRow(g, /^effective date$/i);
  const salaryHistory = hAt < 0 ? [] : block(g, hAt).map(({ row, r }) => ({
    date: isoDate(row[0]), reason: label(row[1]), annual: amount(cell(row, columns(g[hAt])(/^annual/i))), ref: ref(tab, r, 'G'),
  })).filter((x) => x.date && x.annual != null);
  const dAt = (() => { for (let r = 0; r < g.length; r++) if (/^account$/i.test(label(g[r]?.[0])) && columns(g[r])(/pending/i) >= 0) return r; return -1; })();
  const deposits = [];
  if (dAt >= 0) {
    const col = columns(g[dAt]);
    for (const { row, r } of block(g, dAt)) {
      const account = cleanName(row[0]).replace(/\s*\(.*\)\s*$/, '');
      if (!account || /^total$/i.test(account)) continue;
      deposits.push({ account, current: amount(cell(row, col(/current/i))), pending: amount(cell(row, col(/pending/i))), ref: ref(tab, r, 'F') });
    }
  }
  return { anchor, anchorRef, periodDays, netPerCheck, salaryHistory, deposits };
}

/** Occasional Costs: the reserve table (blank costs stay blank) and any one-time commitment table below it. */
function occasional(/** @type {Grid} */ g, /** @type {string} */ tab) {
  const reserves = [];
  const oneTime = [];
  for (let r = 0; r < g.length; r++) {
    if (!/^item$/i.test(label(g[r]?.[0]))) continue;
    const col = columns(g[r]);
    const title = titleAbove(g, r);
    if (col(/annual budget/i) >= 0) {
      for (const { row, r: at } of block(g, r)) {
        const name = label(row[0]);
        if (!name) continue;
        const k = label(row[col(/50\/30\/20/)]);
        reserves.push({
          name, category: label(row[1]), kind: /** @type {'Need' | 'Want' | ''} */ (/^need/i.test(k) ? 'Need' : /^want/i.test(k) ? 'Want' : ''),
          annual: amount(cell(row, col(/annual budget/i))), monthly: amount(cell(row, col(/monthly reserve/i))),
          status: shortText(cell(row, col(/^status/i))), timing: shortText(cell(row, col(/timing/i)), 40), note: scrub(cell(row, col(/^notes?/i))), ref: ref(tab, at, 'N'),
        });
      }
    } else {
      for (const { row, r: at } of block(g, r)) {
        const name = cleanName(row[0]);
        if (!name) continue;
        const note = scrub(cell(row, col(/^notes?/i)));
        oneTime.push({
          name, group: titleCase(title), category: label(row[1]),
          estimate: amount(cell(row, col(/patient|^amount|estimate$/i))),
          date: isoDate(cell(row, col(/appointment|^date|^due/i))), payment: shortText(cell(row, col(/payment status|^status/i)), 40),
          note, noteDate: noteDate(note), ref: ref(tab, at, 'N'),
        });
      }
    }
  }
  return { reserves, oneTime };
}

/** Net Worth History: dated rows (date, cash, home, retirement, mortgage, other debt, net worth, basis). */
function netWorth(/** @type {Grid} */ g, /** @type {string} */ tab) {
  const at = findRow(g, /^reference date$/i);
  if (at < 0) return [];
  const col = columns(g[at]);
  return block(g, at).map(({ row, r }) => ({
    date: isoDate(row[0]), cash: amount(cell(row, col(/^cash/i))), home: amount(cell(row, col(/^home/i))), retirement: amount(cell(row, col(/^retirement/i))),
    mortgage: amount(cell(row, col(/^mortgage/i))), otherDebt: amount(cell(row, col(/^other debt/i))), netWorth: amount(cell(row, col(/^net worth/i))),
    basis: scrub(cell(row, col(/basis/i))), ref: ref(tab, r, 'H'),
  })).filter((x) => x.date);
}

/** Bill Trends: the monthly payments table ("Month", "<Service> actual" columns). Blank means no record, not $0. */
function billTrends(/** @type {Grid} */ g, /** @type {string} */ tab) {
  const at = (() => { for (let r = 0; r < g.length; r++) if (/^month$/i.test(label(g[r]?.[0])) && columns(g[r])(/actual$/i) >= 0) return r; return -1; })();
  if (at < 0) return [];
  const series = (g[at] || []).map((v, c) => ({ n: label(v), c })).filter((x) => /\bactual$/i.test(x.n));
  const rows = block(g, at);
  return series.map((s) => ({
    service: s.n.replace(/\s*actual$/i, ''),
    points: rows.map(({ row, r }) => {
      const m = /^([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(label(row[0]));
      const i = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
      return !m || i < 0 ? null : { month: `${m[2]}-${String(i + 1).padStart(2, '0')}`, amount: amount(row[s.c]), ref: ref(tab, r, 'Q') };
    }).filter((p) => p != null),
  }));
}

/** Davidson Water: dated payments (date, amount). The account number column is never read. */
function waterPayments(/** @type {Grid} */ g, /** @type {string} */ tab) {
  const at = findRow(g, /^payment date$/i);
  if (at < 0) return [];
  const col = columns(g[at]);
  return block(g, at).map(({ row, r }) => ({ date: isoDate(row[0]), amount: amount(cell(row, col(/^amount/i))), ref: ref(tab, r, 'C') }))
    .filter((p) => p.date && p.amount != null);
}

/** Layoff Plan: the "As of" date and the essentials total, for comparing with Estimate Inputs' job-loss case. */
function layoff(/** @type {Grid} */ g, /** @type {string} */ tab) {
  let asOf = null;
  for (const v of g[0] || []) { const m = /^as of\s+(.+)$/i.exec(label(v)); if (m) asOf = isoDate(m[1]); }
  const r = findRow(g, /^essentials total/i);
  return { asOf, essentials: r < 0 ? null : amount(g[r][1]), ref: r < 0 ? null : ref(tab, r, 'D') };
}

const colName = (/** @type {number} */ c) => { let s = ''; for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
/** Every formula error in the tabs read, so the page can point at it instead of showing a wrong number. */
function errors(/** @type {Record<string, Grid>} */ tabs) {
  const out = [];
  for (const [tab, g] of Object.entries(tabs)) {
    for (let r = 0; r < g.length; r++) for (let c = 0; c < (g[r] || []).length; c++) {
      if (isFormulaError(g[r][c])) out.push({ tab, range: `${colName(c)}${r + 1}`, value: String(g[r][c]).trim() });
    }
  }
  return out;
}

/**
 * The whole raw model from the workbook's grids. Missing tabs leave their parts empty and are named in `missing`.
 * @param {Record<string, Grid>} tabs
 * @param {typeof TAB_NAMES} [names] which tab plays each part (the demo uses its own names)
 * @returns {SheetFinance}
 */
export function parseWorkbook(tabs, names = TAB_NAMES) {
  const n = names;
  const g = (/** @type {keyof typeof TAB_NAMES} */ k) => tabs[n[k]];
  const s = g('summary') ? summary(g('summary'), n.summary) : { snapshot: [], debt: [], savings: [], safetyNet: [], allocation: [], allocationBase: null, allocationRef: null };
  const d = g('debt') ? debts(g('debt'), n.debt) : { loans: [], cards: [], debtSummary: [], debtNotes: [] };
  const rec = g('recurring') ? recurring(g('recurring'), n.recurring) : { bills: [], planned: [] };
  const sv = g('savings') ? savingsTab(g('savings'), n.savings) : { accounts: [], investments: [], separateCash: [], separateCashDate: null, savingsNotes: [] };
  const inc = g('income') ? income(g('income'), n.income) : { sources: [], routing: [], notes: [] };
  const occ = g('occasional') ? occasional(g('occasional'), n.occasional) : { reserves: [], oneTime: [] };
  const read = Object.values(n).filter((t) => tabs[t]);
  return {
    ...s,
    bills: rec.bills,
    planned: rec.planned,
    loans: d.loans,
    cards: d.cards,
    debtSummary: d.debtSummary,
    debtNotes: d.debtNotes,
    accounts: sv.accounts,
    investments: sv.investments,
    separateCash: sv.separateCash,
    separateCashDate: sv.separateCashDate,
    savingsNotes: sv.savingsNotes,
    dashboard: g('dashboard') ? labelled(g('dashboard'), n.dashboard) : [],
    estimates: g('estimates') ? labelled(g('estimates'), n.estimates) : [],
    incomeSources: inc.sources,
    routing: inc.routing,
    incomeNotes: inc.notes,
    scenarios: g('partnerIncome') ? scenarioIncome(g('partnerIncome'), n.partnerIncome) : [],
    paychecks: g('paychecks') ? paychecks(g('paychecks'), n.paychecks) : { anchor: null, anchorRef: null, periodDays: null, netPerCheck: null, salaryHistory: [], deposits: [] },
    reserves: occ.reserves,
    oneTime: occ.oneTime,
    netWorth: g('netWorth') ? netWorth(g('netWorth'), n.netWorth) : [],
    billTrends: g('billTrends') ? billTrends(g('billTrends'), n.billTrends) : [],
    water: g('water') ? waterPayments(g('water'), n.water) : [],
    layoff: g('layoff') ? layoff(g('layoff'), n.layoff) : { asOf: null, essentials: null, ref: null },
    errors: errors(Object.fromEntries(read.map((t) => [t, tabs[t]]))),
    missing: Object.values(n).filter((t) => !tabs[t]),
  };
}

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
 * Bills and debt payments due within `days` of today, soonest first. (Home uses this; the Finances page uses the
 * fuller timeline in src/finance-model.js.)
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
    if (date && date <= end && (c.balance ?? 1) > 0) out.push({ name: c.name, amount: null, date, kind: 'Card' });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** The Summary tab's own monthly headline (kept for comparison; the page uses src/finance-model.js instead). */
export function monthly(/** @type {SheetFinance} */ f) {
  const income = f.snapshot.filter((r) => r.kind === 'income').reduce((n, r) => n + (r.monthly ?? 0), 0);
  const outRows = f.snapshot.filter((r) => r.kind === 'out');
  const out = outRows.reduce((n, r) => n + (r.monthly ?? 0), 0);
  const left = f.snapshot.find((r) => r.kind === 'left')?.monthly ?? income - out;
  return { income, out, left, rows: outRows };
}
