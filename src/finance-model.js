// Turns the raw workbook model (src/finance-sheet.js) into what the Finances page shows, keeping the money rules in
// one place, apart from the page: what is recorded plan versus estimate versus confirmed, what is unknown rather
// than zero, what is a transfer rather than spending, who pays for what, and what in the sheet conflicts.
// Pure functions with no browser APIs, so the tests run them directly. Amounts keep full precision here; only the
// page rounds, for display.
//
// Ground rules (from the workbook's own definitions on Dashboard Data and Estimate Inputs):
// - The plan is a budget, not actual spending. Actuals only exist where the sheet records a complete month.
// - A blank amount is unknown, never $0. A confirmed $0 must be written as 0.
// - Transfers between owned accounts are not spending. The spending allowance paid into a shared account counts
//   once, as wants; anything else paid from that same account is already inside it.
// - Card purchases are counted where they are bought; card minimums count as required debt. A full card repayment
//   is never added on top of the purchases it pays for.
// - Costs paid on a parent's card are shown, but they don't come out of household take-home pay.
// - Payroll 401(k) comes out before take-home pay, so it is never mixed into a take-home savings rate.
// - Bills reserve, children's savings and retirement are not emergency cash.
// - A Drive edit time or sync time is not a balance date.

/** @typedef {import('./types').SheetFinance} SheetFinance */
/** @typedef {import('./types').SheetBill} SheetBill */
/** @typedef {import('./types').SheetRef} SheetRef */
/** @typedef {import('./types').FinStatus} FinStatus */
/** @typedef {import('./types').FinAttention} FinAttention */

import { amount, percent, isoDate, noteDate, nextDue } from './finance-sheet.js';

/** Words for each status, used on every figure so nothing depends on colour. */
export const STATUS = /** @type {const} */ ({
  confirmed: 'Confirmed',
  recorded: 'Recorded plan',
  estimate: 'Estimate',
  unknown: 'Unknown',
  conflict: 'Conflict',
  computed: 'Worked out',
});

const sum = (/** @type {(number | null | undefined)[]} */ xs) => xs.reduce((/** @type {number} */ n, x) => n + (x ?? 0), 0);
const lower = (/** @type {string} */ s) => (s || '').toLowerCase();
const norm = (/** @type {string} */ s) => lower(s).replace(/[^a-z]/g, '');
const ym = (/** @type {Date} */ d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const isoDay = (/** @type {Date} */ d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const midnight = (/** @type {Date} */ d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fromIso = (/** @type {string} */ s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON_NAME = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (/** @type {string} */ ymStr) => { const [y, m] = ymStr.split('-').map(Number); return `${MON_NAME[m - 1]} ${y}`; };

/** A labelled row from Dashboard Data or Estimate Inputs. */
function find(/** @type {SheetFinance['estimates']} */ rows, /** @type {RegExp} */ rx, /** @type {RegExp} */ section = /./) {
  return rows.find((r) => rx.test(r.label) && section.test(r.section)) || null;
}

// ---------------------------------------------------------------------------------------------------------------
// Bills: monthly amount, funding, effective-dated prices
// ---------------------------------------------------------------------------------------------------------------

/** Times a year for each frequency word; monthly = amount × times ÷ 12. */
const FREQ = /** @type {Record<string, number>} */ ({ monthly: 12, biweekly: 26, weekly: 52, quarterly: 4, yearly: 1, annual: 1, annually: 1, semiannual: 2 });
/**
 * The monthly amount of a bill: the sheet's monthly column, or amount × frequency when that column is blank.
 * Null when neither is known (a blank is never treated as $0).
 * @param {Pick<SheetBill, 'monthly' | 'amount' | 'frequency'>} b
 */
export function monthlyOf(b) {
  if (b.monthly != null) return { amount: b.monthly, computed: false };
  const f = FREQ[norm(b.frequency)];
  if (b.amount != null && f) return { amount: (b.amount * f) / 12, computed: true };
  return { amount: null, computed: false };
}

const PARENT = /\b(mom|mother|parents?|dad|father)('?s)?\b/i;
/** The spending allowance: a set amount moved to someone's spending account each paycheck. */
export const isAllowance = (/** @type {Pick<SheetBill, 'name' | 'subcategory'>} */ b) => /personal spending|spending money|allowance/i.test(`${b.name} ${b.subcategory || ''}`);

/**
 * Who pays a bill:
 * - "parent": a parent's card (shown, but not household money);
 * - "allowance": the spending allowance itself (counted once, as wants);
 * - "in-allowance": paid from the account the allowance goes to, so already inside the allowance;
 * - "unknown": no payment account in the sheet (counted as household, to be safe);
 * - "household".
 * @param {SheetBill} b
 * @param {Set<string>} allowanceAccounts normalised names of the accounts allowances are paid into
 */
export function funding(b, allowanceAccounts) {
  if (PARENT.test(b.account || '') || /paid by parents?/i.test(b.note || '')) return 'parent';
  if (isAllowance(b)) return 'allowance';
  if (b.account && allowanceAccounts.has(norm(b.account))) return 'in-allowance';
  if (!b.account || /^unknown$/i.test(b.account)) return 'unknown';
  return 'household';
}

const PERIOD_RX = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*[-–]\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\s*:?\s*\$\s?(\d[\d,]*(?:\.\d{2})?)/gi;
/**
 * Dated prices written in a note in one strict form only: "<Mon>-<Mon> <YYYY> $<amount>" (for example
 * "Nov-Dec 2026 $95.00; Jan-Dec 2027 $60.00"). Anything looser is ignored rather than guessed at.
 * @param {string} note
 * @returns {{ from: string, to: string, amount: number }[]}
 */
export function pricePeriods(note) {
  const out = [];
  for (const m of (note || '').matchAll(PERIOD_RX)) {
    const a = MON.indexOf(lower(m[1]).slice(0, 3)), b = MON.indexOf(lower(m[2]).slice(0, 3));
    const value = amount(m[4]);
    if (a < 0 || b < 0 || b < a || value == null) continue;
    out.push({ from: `${m[3]}-${String(a + 1).padStart(2, '0')}`, to: `${m[3]}-${String(b + 1).padStart(2, '0')}`, amount: value });
  }
  return out;
}
/**
 * The price that applies in a month: a dated price from the note when exactly one covers the month, otherwise the
 * sheet's amount. Two notes covering the same month with different prices is a conflict (amount null).
 * @param {SheetBill} b
 * @param {string} month "YYYY-MM"
 */
export function priceIn(b, month) {
  const hits = pricePeriods(b.note).filter((p) => p.from <= month && month <= p.to);
  const distinct = [...new Set(hits.map((h) => h.amount))];
  /** @type {'sheet' | 'note' | 'conflict'} */
  let source = 'sheet';
  if (distinct.length > 1) source = 'conflict';
  else if (distinct.length === 1 && distinct[0] !== b.amount) source = 'note';
  return { amount: distinct.length > 1 ? null : distinct.length === 1 ? distinct[0] : b.amount, source };
}

// ---------------------------------------------------------------------------------------------------------------
// Spending totals without double counting
// ---------------------------------------------------------------------------------------------------------------

/**
 * Spending from a list of lines without counting anything twice. Lines marked "transfer" (moves between owned
 * accounts) and "card-repayment" (paying off purchases already counted) are left out; "in-allowance" lines are
 * inside the allowance that is already counted.
 * @param {{ amount: number | null, basis: 'purchase' | 'transfer' | 'card-repayment' | 'allowance' | 'in-allowance' | 'debt' }[]} lines
 */
export function spendingTotal(lines) {
  const counted = lines.filter((l) => l.basis === 'purchase' || l.basis === 'allowance' || l.basis === 'debt');
  return { total: sum(counted.map((l) => l.amount)), unknown: counted.filter((l) => l.amount == null).length, excluded: lines.length - counted.length };
}

// ---------------------------------------------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------------------------------------------

/**
 * Everything the Finances page shows, worked out from the sheet.
 * @param {SheetFinance} f
 * @param {Date} today
 */
export function buildModel(f, today) {
  const now = midnight(today);
  const thisMonth = ym(now);
  const todayIso = isoDay(now);
  /** The latest date a note mentions that isn't in the future (when the note was written, roughly). */
  const writtenOn = (/** @type {string} */ text) => noteDate(text, todayIso);
  /** @type {FinAttention[]} */
  const attention = [];
  const flag = (/** @type {Omit<FinAttention, 'id'>} */ a) => attention.push({ id: `a${attention.length + 1}`, ...a });

  // ----- Income -----
  const baseline = f.incomeSources.filter((s) => s.include);
  const incomeNet = baseline.length && baseline.every((s) => s.netMonthly != null) ? sum(baseline.map((s) => s.netMonthly)) : null;
  const snapIncome = f.snapshot.find((r) => r.kind === 'income');
  const net = incomeNet ?? snapIncome?.monthly ?? null;
  const income = {
    net,
    gross: baseline.length && baseline.every((s) => s.grossMonthly != null) ? sum(baseline.map((s) => s.grossMonthly)) : null,
    perPaycheck: baseline.length && baseline.every((s) => s.netPerPeriod != null) ? sum(baseline.map((s) => s.netPerPeriod)) : null,
    status: /** @type {FinStatus} */ (net == null ? 'unknown' : [...baseline.map((s) => s.name), snapIncome?.label || ''].some((n) => /estimat/i.test(n)) ? 'estimate' : 'recorded'),
    sources: baseline.map((s) => s.name),
    excluded: [
      ...f.incomeSources.filter((s) => !s.include).map((s) => ({ name: s.name, amount: s.netMonthly ?? s.netYearly, per: s.netMonthly != null ? 'month' : 'year', note: s.type ? `${s.type}, net` : 'Net', ref: s.ref })),
      ...f.scenarios.filter((s) => !s.include).map((s) => ({ name: `${s.ref.tab.replace(/\s*income$/i, '')}: ${s.name}`, amount: s.grossMonthly, per: 'month', note: 'Scenario, gross', ref: s.ref })),
    ],
    ref: baseline[0]?.ref || snapIncome?.ref || null,
  };

  // ----- Bills and who pays them -----
  const allowanceAccounts = new Set(f.bills.filter(isAllowance).map((b) => norm(b.account)).filter(Boolean));
  const lines = f.bills.map((b) => {
    const m = monthlyOf(b);
    return { ...b, monthlyAmount: m.amount, computed: m.computed, funding: funding(b, allowanceAccounts) };
  });
  const householdLines = lines.filter((l) => l.funding === 'household' || l.funding === 'unknown' || l.funding === 'allowance');
  const needsBills = sum(householdLines.filter((l) => l.kind === 'Need').map((l) => l.monthlyAmount));
  const wantsBills = sum(householdLines.filter((l) => l.kind !== 'Need').map((l) => l.monthlyAmount));
  const parentLines = lines.filter((l) => l.funding === 'parent');
  const inAllowance = lines.filter((l) => l.funding === 'in-allowance');
  const unknownAmount = lines.filter((l) => l.monthlyAmount == null);
  const noAccount = lines.filter((l) => l.funding === 'unknown');

  // ----- Debt payments -----
  const isOneTime = (/** @type {{ frequency: string }} */ l) => /one-?time|once/i.test(l.frequency);
  const recurringDebt = f.loans.filter((l) => !isOneTime(l) && (l.monthly ?? 0) > 0);
  const requiredDebt = sum(recurringDebt.map((l) => l.monthly));
  const oneTimeDebts = f.loans.filter(isOneTime);

  // ----- Irregular reserves (blank stays blank) -----
  const reserves = f.reserves.map((r) => ({ ...r, monthlyAmount: r.monthly ?? (r.annual != null ? r.annual / 12 : null) }));
  const activeReserves = reserves.filter((r) => !/optional/i.test(r.status));
  const reserveNeeds = sum(activeReserves.filter((r) => r.kind === 'Need').map((r) => r.monthlyAmount));
  const reserveWants = sum(activeReserves.filter((r) => r.kind !== 'Need').map((r) => r.monthlyAmount));
  const blankReserves = activeReserves.filter((r) => r.monthlyAmount == null);

  // ----- Savings from take-home and payroll retirement -----
  const savingsRouting = f.routing.filter((r) => r.savings);
  const dashSavings = find(f.dashboard, /^take-home savings transfers/i);
  const takeHomeSavings = savingsRouting.length ? sum(savingsRouting.map((r) => r.monthly)) : amount(dashSavings?.value);
  const payroll401k = sum(f.investments.filter((i) => /retire/i.test(i.type)).map((i) => i.monthly));
  const payrollRef = f.investments.find((i) => /retire/i.test(i.type))?.ref || null;

  // ----- Overrides (Dashboard Data yellow cells) -----
  const ov = (/** @type {RegExp} */ rx) => find(f.dashboard, rx, /OVERRIDE/i);
  const ovCard = ov(/^additional monthly debt payments/i);
  const ovAllIn = ov(/^all required debt payments included/i);
  const ovCash = ov(/^designated available emergency cash/i);
  const ovEss = ov(/^confirmed essential monthly/i);
  const ovAsOf = ov(/^emergency balance as-of/i);
  const overrides = {
    cardPayments: amount(ovCard?.value), allIncluded: /^yes/i.test(ovAllIn?.b || ''),
    cash: amount(ovCash?.value), essentials: amount(ovEss?.value), asOf: isoDate(ovAsOf?.value),
    actualIncome: amount(ov(/^actual take-home income/i)?.value), actualNeeds: amount(ov(/^actual needs/i)?.value),
    actualWants: amount(ov(/^actual wants/i)?.value), actualSavings: amount(ov(/^actual savings/i)?.value),
    actualMonth: isoDate(ov(/^allocation month/i)?.value),
  };

  // ----- Estimates the sheet itself provides (Estimate Inputs) -----
  const est = (/** @type {RegExp} */ rx) => find(f.estimates, rx);
  const eGroceries = est(/^central groceries monthly/i);
  const eFuel = est(/^fuel monthly estimate/i);
  const eCards = est(/^estimated additional debt payments/i);
  const eReport = est(/^reference report date/i);
  const reportDate = isoDate(eReport?.value);

  const inPlan = (/** @type {RegExp} */ rx) => lines.some((l) => rx.test(`${l.name} ${l.subcategory}`));
  /** Things the recorded plan leaves out, each with the sheet's own estimate when it has one. */
  const adds = [];
  if (!inPlan(/grocer|food/i)) adds.push({ key: 'groceries', label: 'Groceries', amount: amount(eGroceries?.value), status: /** @type {FinStatus} */ (eGroceries ? 'estimate' : 'unknown'), basis: eGroceries?.c || '', ref: eGroceries?.ref || null });
  if (!inPlan(/\bfuel\b|\bgas\b|gasoline/i)) adds.push({ key: 'fuel', label: 'Fuel', amount: amount(eFuel?.value), status: /** @type {FinStatus} */ (eFuel ? 'estimate' : 'unknown'), basis: eFuel?.c || '', ref: eFuel?.ref || null });
  if (overrides.cardPayments != null) adds.push({ key: 'cards', label: 'Card minimums', amount: overrides.cardPayments, status: /** @type {FinStatus} */ ('confirmed'), basis: 'Confirmed override on Dashboard Data', ref: ovCard?.ref || null });
  else if (!overrides.allIncluded) adds.push({ key: 'cards', label: 'Card minimums', amount: amount(eCards?.value), status: /** @type {FinStatus} */ (eCards ? 'estimate' : 'unknown'), basis: eCards?.c || '', ref: eCards?.ref || null });

  // ----- Recorded plan and what's unallocated -----
  const recordedNeeds = needsBills + requiredDebt + reserveNeeds;
  const recordedWants = wantsBills + reserveWants;
  const recordedSavings = takeHomeSavings ?? 0;
  const unallocated = net == null ? null : net - recordedNeeds - recordedWants - recordedSavings;
  const addsKnown = sum(adds.map((a) => a.amount));
  const afterEstimates = unallocated == null || adds.some((a) => a.amount == null) ? null : unallocated - addsKnown;

  /** Why the plan is incomplete, most important first. */
  const missing = [];
  for (const a of adds) if (a.status !== 'confirmed') missing.push({ key: a.key, text: `${a.label} ${a.key === 'fuel' ? 'is' : 'are'} not in the recorded plan${a.amount != null ? ' (the sheet has an estimate)' : ''}.`, ref: a.ref });
  if (blankReserves.length) missing.push({ key: 'reserves', text: `${blankReserves.length} irregular ${blankReserves.length === 1 ? 'cost has' : 'costs have'} no amount (${blankReserves.slice(0, 3).map((r) => r.name).join(', ')}${blankReserves.length > 3 ? ', …' : ''}).`, ref: blankReserves[0].ref });
  if (f.planned.length) missing.push({ key: 'planned', text: `${f.planned.length} planned ${f.planned.length === 1 ? 'bill has' : 'bills have'} no amount yet (${f.planned.map((p) => p.name).join(', ')}).`, ref: f.planned[0].ref });
  if (unknownAmount.length) missing.push({ key: 'unknown', text: `${unknownAmount.length} active ${unknownAmount.length === 1 ? 'bill has' : 'bills have'} no monthly amount (${unknownAmount.map((l) => l.name).join(', ')}).`, ref: unknownAmount[0].ref });
  if (takeHomeSavings == null) missing.push({ key: 'savings', text: 'No savings transfers from take-home pay are recorded.', ref: null });
  const complete = missing.length === 0;

  const commitments = {
    needs: recordedNeeds, wants: recordedWants, needsBills, wantsBills, requiredDebt, reserveNeeds, reserveWants,
    total: recordedNeeds + recordedWants,
    withEstimates: recordedNeeds + recordedWants + addsKnown,
    adds,
    parent: { total: sum(parentLines.map((l) => l.monthlyAmount)), count: parentLines.length },
    inAllowance: { total: sum(inAllowance.map((l) => l.monthlyAmount)), names: inAllowance.map((l) => l.name) },
    noAccount: noAccount.length,
  };

  // ----- Savings buckets -----
  const isChild = (/** @type {{ purpose: string, group: string }} */ a) => /child|kid/i.test(`${a.purpose} ${a.group}`);
  const isBills = (/** @type {{ purpose: string }} */ a) => /bill/i.test(a.purpose);
  const household = f.accounts.filter((a) => !isChild(a));
  const billsAccounts = household.filter(isBills);
  const otherHousehold = household.filter((a) => !isBills(a));
  const children = f.accounts.filter(isChild);
  const savingsNote = f.savingsNotes.find((n) => /balance/i.test(n.text)) || f.savingsNotes[0] || null;
  const savingsNoteDate = savingsNote ? writtenOn(savingsNote.text) : null;
  const eVerified = est(/^verified retirement statement/i);
  const eVerifiedDate = isoDate(est(/^verified retirement date/i)?.value);
  const eUndated = est(/^undated retirement snapshot/i);
  const knownTotal = (/** @type {{ balance: number | null }[]} */ xs) => (xs.length && xs.every((x) => x.balance != null) ? sum(xs.map((x) => x.balance)) : xs.length ? null : 0);
  const otherTotal = knownTotal(otherHousehold);
  const buckets = [
    { key: 'bills', label: 'Bills reserve', amount: knownTotal(billsAccounts), status: /** @type {FinStatus} */ ('recorded'), accounts: billsAccounts.map((a) => a.name), date: savingsNoteDate, dateKind: 'note', note: 'Pays upcoming bills. Not emergency cash.', ref: billsAccounts[0]?.ref || null },
    { key: 'emergency', label: 'Set aside for emergencies', amount: overrides.cash, status: /** @type {FinStatus} */ (overrides.cash != null ? 'confirmed' : 'unknown'), accounts: [], date: overrides.asOf, dateKind: overrides.asOf ? 'source' : 'none', note: overrides.cash != null ? 'Confirmed on Dashboard Data.' : 'Not designated in the sheet yet (Dashboard Data override is blank).', ref: ovCash?.ref || null },
    { key: 'other', label: 'Other household savings', amount: otherTotal == null ? null : Math.max(0, otherTotal - (overrides.cash ?? 0)), status: /** @type {FinStatus} */ ('recorded'), accounts: otherHousehold.map((a) => a.name), date: savingsNoteDate, dateKind: 'note', note: overrides.cash == null ? 'The coverage estimate counts these as available.' : 'After the amount set aside for emergencies.', ref: otherHousehold[0]?.ref || null },
    { key: 'children', label: "Children's savings", amount: knownTotal(children), status: /** @type {FinStatus} */ ('recorded'), accounts: children.map((a) => a.name), date: savingsNoteDate, dateKind: 'note', note: "The kids' money. Not household cash.", ref: children[0]?.ref || null },
    { key: 'retirement', label: 'Retirement', amount: amount(eVerified?.value), status: /** @type {FinStatus} */ (eVerified ? 'recorded' : 'unknown'), accounts: [], date: eVerifiedDate, dateKind: eVerifiedDate ? 'source' : 'none', note: 'Locked up for retirement. Not emergency cash.', ref: eVerified?.ref || payrollRef },
  ];

  // ----- Emergency coverage -----
  const eAvail = est(/^savings available in base/i);
  const eEss = est(/^estimated essential costs monthly/i);
  const eJob = est(/^job-loss essential cost/i);
  const eIns = est(/^replacement insurance/i);
  // The bills reserve balance as Estimate Inputs records it (its treatment says it is the bills reserve).
  const eReserve = f.estimates.find((r) => /cash|balance/i.test(r.section) && /^bills reserve/i.test(r.c) && amount(r.value) != null) || null;
  const cash = overrides.cash ?? amount(eAvail?.value) ?? otherTotal;
  const cashStatus = /** @type {FinStatus} */ (overrides.cash != null ? 'confirmed' : eAvail || otherTotal != null ? 'estimate' : 'unknown');
  const essentials = overrides.essentials ?? amount(eEss?.value);
  const jobLossEss = amount(eJob?.value);
  const oneTimeKnown = sum([...f.oneTime.map((o) => o.estimate), ...oneTimeDebts.map((d) => d.balance ?? d.payment)]);
  const runway = (/** @type {number | null} */ c, /** @type {number | null} */ e) => (c != null && e != null && e > 0 ? c / e : null);
  const coverage = {
    cash, cashStatus, cashDate: overrides.cash != null ? overrides.asOf : reportDate,
    cashDateKind: overrides.cash != null ? (overrides.asOf ? 'source' : 'none') : reportDate ? 'report' : 'none',
    essentials, essentialsStatus: /** @type {FinStatus} */ (overrides.essentials != null ? 'confirmed' : eEss ? 'estimate' : 'unknown'),
    normal: runway(cash, essentials),
    jobLoss: runway(cash, jobLossEss), jobLossEssentials: jobLossEss,
    upper: runway(cash != null && eReserve ? cash + (amount(eReserve.value) ?? 0) : null, jobLossEss),
    afterOneTime: runway(cash != null ? cash - oneTimeKnown : null, essentials), oneTimeKnown,
    insurance: amount(eIns?.value), insuranceBasis: eIns?.c || '',
    valid: cash != null && essentials != null && essentials > 0,
    confirmed: overrides.cash != null && overrides.essentials != null && !!overrides.asOf,
    refs: [eAvail?.ref, eEss?.ref, eJob?.ref, ovCash?.ref].filter(Boolean),
    assumptions: [
      ...adds.filter((a) => a.basis).map((a) => `${a.label}: ${a.basis}`),
      eIns ? `Replacement health insurance in the job-loss case: ${eIns.c}` : '',
      eReserve ? 'The bills reserve is left out, except in the "whole bills reserve" case.' : '',
      oneTimeKnown ? 'Unpaid one-time costs are not taken out of savings in the main figures.' : '',
    ].filter(Boolean),
  };

  // ----- Debt -----
  const mortgageNoteRaw = f.debtNotes.find((n) => /mortgage/i.test(n.text));
  const mortgageNote = mortgageNoteRaw ? { ...mortgageNoteRaw, date: writtenOn(mortgageNoteRaw.text) } : null;
  const mortgages = f.loans.filter((l) => /mortgage/i.test(`${l.type} ${l.name}`)).map((l) => ({
    ...l, date: mortgageNote?.date || null, apr: percent(est(/^mortgage apr/i)?.value),
    estimatePrincipal: amount(est(/^current mortgage principal estimate/i)?.value), estimateRef: est(/^current mortgage principal estimate/i)?.ref || null,
  }));
  const devices = f.loans.filter((l) => /device|install/i.test(`${l.type} ${l.group}`));
  const cards = f.cards.map((c) => {
    const text = `${c.status} ${c.note}`;
    const kind = /paid off/i.test(text) && c.balance === 0 ? 'Paid off'
      : c.balance == null ? 'Unknown'
      : /not statement balance|current balance|^\s*current\b/i.test(text) ? 'Current balance'
      : /statement balance/i.test(text) ? 'Statement balance'
      : /historic|unverified/i.test(text) ? 'Historic, unverified'
      : 'Type not stated';
    const gaps = [];
    if (kind !== 'Paid off') {
      if (c.balance == null) gaps.push('balance');
      if (c.apr == null) gaps.push('APR');
      if (!c.due || /tbd/i.test(c.due)) gaps.push('due date');
      gaps.push('minimum payment');
    }
    return { ...c, kind, gaps };
  });
  const cardEstimates = f.estimates.filter((r) => /debt payment estimate/i.test(r.section) && /balance|proxy/i.test(r.label)).map((r) => ({ label: r.label, amount: amount(r.value), basis: r.c, ref: r.ref }));
  const debt = {
    mortgages, devices, cards, cardEstimates, summary: f.debtSummary, notes: f.debtNotes,
    requiredMonthly: requiredDebt, cardPayments: adds.find((a) => a.key === 'cards') || null,
    oneTime: oneTimeDebts,
  };

  // ----- Timeline (next 31 days) -----
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 31);
  const items = [];
  const undated = [];
  const p = f.paychecks;
  if (p.anchor && p.periodDays && p.periodDays >= 7 && p.periodDays <= 31) {
    let d = fromIso(p.anchor);
    while (d < now) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + p.periodDays);
    for (; d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + p.periodDays)) {
      items.push({ date: isoDay(d), kind: 'payday', name: 'Payday', amount: income.perPaycheck, amountStatus: /** @type {FinStatus} */ (income.perPaycheck != null ? income.status : 'unknown'), dateKind: 'predicted', account: 'Split by direct deposit', status: 'Predicted', source: `Every ${p.periodDays} days from the ${shortDate(p.anchor)} paystub`, ref: p.anchorRef });
    }
  }
  const occurrences = (/** @type {string} */ due) => {
    const out = [];
    let cursor = now;
    for (let i = 0; i < 3; i++) {
      const d = nextDue(due, cursor);
      if (!d || d > end) break;
      out.push(d);
      cursor = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      if (!/^\d{1,2}(?:st|nd|rd|th)?$/i.test(due.trim())) break;
    }
    return out;
  };
  const fundLabel = (/** @type {typeof lines[number]} */ l) => (l.funding === 'parent' ? `Parent's card` : l.funding === 'unknown' ? 'Not recorded' : l.account);
  for (const l of lines) {
    const dates = l.due ? occurrences(l.due) : [];
    const parses = !!l.due && (dates.length > 0 || nextDue(l.due, now) != null);
    if (!parses) {
      if (/month|week|quarter/i.test(l.frequency)) undated.push({ name: l.name, amount: l.amount, frequency: l.frequency, why: l.due ? `Due date "${l.due}" isn't a date` : 'No due date in the sheet', ref: l.ref });
      continue;
    }
    for (const d of dates) {
      const price = priceIn(l, ym(d));
      items.push({
        date: isoDay(d), kind: 'bill', name: l.name, amount: price.amount,
        amountStatus: /** @type {FinStatus} */ (price.source === 'conflict' ? 'conflict' : price.source === 'note' ? 'recorded' : 'recorded'),
        priceFromNote: price.source === 'note', dateKind: 'due', account: fundLabel(l), status: 'Not tracked',
        source: writtenOn(l.note) ? `Note dated ${shortDate(/** @type {string} */ (writtenOn(l.note)))}` : 'No source date', ref: l.ref,
      });
    }
  }
  for (const l of recurringDebt) {
    const dates = l.due ? occurrences(l.due) : [];
    if (!dates.length && !(l.due && nextDue(l.due, now))) { undated.push({ name: l.name, amount: l.monthly, frequency: l.frequency, why: l.due ? `Due "${l.due}"` : 'No due date in the sheet', ref: l.ref }); continue; }
    for (const d of dates) items.push({ date: isoDay(d), kind: 'debt', name: l.name, amount: l.monthly, amountStatus: /** @type {FinStatus} */ ('recorded'), dateKind: 'due', account: 'Not recorded', status: 'Not tracked', source: (mortgageNote?.date && /mortgage/i.test(l.type) ? `Note dated ${shortDate(/** @type {string} */ (mortgageNote.date))}` : 'No source date'), ref: l.ref });
  }
  for (const c of cards) {
    if (c.kind === 'Paid off') continue;
    const lead = /^([A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}(?:st|nd|rd|th)?)\b/.exec(c.due || '');
    // "9th" repeats monthly. "Nov 2" on a monthly card is one statement's due date, not a yearly date: if it has
    // passed, the next one simply isn't recorded.
    const yearless = lead && /^[A-Za-z]/.test(lead[1]) && !/\d{4}/.test(lead[1]);
    const d = !lead ? null : yearless ? nextDue(`${lead[1]}, ${now.getFullYear()}`, now) : nextDue(lead[1], now);
    if (d && d <= end) items.push({ date: isoDay(d), kind: 'card', name: c.name, amount: null, amountStatus: /** @type {FinStatus} */ ('unknown'), dateKind: 'due', account: 'Card', status: 'Minimum not recorded', source: 'No source date', ref: c.ref });
    else if (!d) undated.push({ name: c.name, amount: null, frequency: 'Monthly', why: lead ? 'Due date in the sheet has passed; next date not recorded' : 'No due date in the sheet', ref: c.ref });
  }
  const unresolved = [];
  for (const o of f.oneTime) {
    if (!o.date) { undated.push({ name: o.name, amount: o.estimate, frequency: 'One-time', why: 'No date in the sheet', ref: o.ref }); unresolved.push(o); continue; }
    const d = fromIso(o.date);
    if (d >= now && d <= end) items.push({ date: o.date, kind: 'one-time', name: o.name, amount: o.estimate, amountStatus: /** @type {FinStatus} */ ('estimate'), dateKind: 'due', account: 'Not recorded', status: o.payment || 'Not tracked', source: writtenOn(o.note) ? `Note dated ${shortDate(/** @type {string} */ (writtenOn(o.note)))}` : 'No source date', ref: o.ref });
    if (d < now || !/paid/i.test(o.payment) || /unpaid/i.test(o.payment)) unresolved.push(o);
  }
  for (const d of oneTimeDebts) { undated.push({ name: d.name, amount: d.balance ?? d.payment, frequency: 'One-time', why: d.due ? `Due "${d.due}"` : 'No due date in the sheet', ref: d.ref }); unresolved.push({ name: d.name, estimate: d.balance ?? d.payment, date: null, payment: d.status, note: d.note, ref: d.ref, noteDate: null, group: d.group, category: d.type }); }
  const posted = f.water.filter((w) => { const d = fromIso(/** @type {string} */ (w.date)); return d <= now && d >= new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30); })
    .map((w) => ({ date: /** @type {string} */ (w.date), kind: 'posted', name: 'Water payment', amount: w.amount, amountStatus: /** @type {FinStatus} */ ('confirmed'), dateKind: 'posted', account: 'Card', status: 'Posted', source: `${w.ref.tab} log`, ref: w.ref }));
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'payday' ? -1 : 1));
  const outgoing = items.filter((i) => i.kind !== 'payday');
  const timeline = {
    from: isoDay(now), to: isoDay(end), items, undated, posted,
    outKnown: sum(outgoing.map((i) => i.amount)), outUnknown: outgoing.filter((i) => i.amount == null).length,
    paydays: items.filter((i) => i.kind === 'payday').length,
  };

  // ----- Allocation -----
  const actualParts = [overrides.actualIncome, overrides.actualNeeds, overrides.actualWants, overrides.actualSavings];
  const actual = actualParts.every((x) => x != null) && overrides.actualMonth
    ? { available: true, month: overrides.actualMonth.slice(0, 7), income: /** @type {number} */ (overrides.actualIncome), needs: /** @type {number} */ (overrides.actualNeeds), wants: /** @type {number} */ (overrides.actualWants), savings: /** @type {number} */ (overrides.actualSavings), reason: '' }
    : { available: false, month: null, income: null, needs: null, wants: null, savings: null, reason: actualParts.some((x) => x != null) ? 'Some actual totals are filled in on Dashboard Data, but not all of them for one month.' : 'The sheet has no complete month of actual totals yet.' };
  const summarySavings = f.allocation.find((a) => /sav/i.test(a.category));
  const mixedRate = summarySavings?.actual != null && takeHomeSavings != null && payroll401k > 0 && Math.abs(summarySavings.actual - (takeHomeSavings + payroll401k) * 12) < 12;
  const allocation = {
    income: net,
    recorded: { needs: recordedNeeds, wants: recordedWants, savings: recordedSavings, unallocated },
    withEstimates: { needs: recordedNeeds, extra: addsKnown, wants: recordedWants, savings: recordedSavings, unallocated: afterEstimates },
    actual,
    reference: { needs: 0.5, wants: 0.3, savings: 0.2 },
    savingsRate: net ? recordedSavings / net : null,
    payroll401k, payrollRef,
    summaryRate: summarySavings?.actualShare ?? null, mixedRate, summaryRef: f.allocationRef,
  };

  // ----- Trends -----
  const billSeries = f.billTrends.map((s) => {
    const recorded = s.points.filter((pt) => pt.amount != null && pt.month < thisMonth);
    const recent = recorded.slice(-6);
    return { service: s.service, points: s.points.filter((pt) => pt.month <= thisMonth).slice(-24), recentAvg: recent.length >= 3 ? sum(recent.map((x) => x.amount)) / recent.length : null, recentCount: recent.length, firstMonth: recorded[0]?.month || null };
  }).filter((s) => s.points.filter((pt) => pt.amount != null).length >= 3);
  const nw = f.netWorth.map((r) => ({ ...r, kind: /^documented|^statement|^verified|actual/i.test(r.basis) ? 'recorded' : 'estimated' }));
  const nwGaps = [];
  for (let i = 1; i < nw.length; i++) {
    const days = (Date.parse(/** @type {string} */ (nw[i].date)) - Date.parse(/** @type {string} */ (nw[i - 1].date))) / 864e5;
    if (days > 400) nwGaps.push({ from: nw[i - 1].date, to: nw[i].date });
  }
  const actualMonths = f.dashboard.filter((r) => /actuals/i.test(r.section) || /^[A-Z][a-z]{2} \d{4}$/.test(r.label)).filter((r) => amount(r.value) != null);
  const trends = {
    bills: billSeries, salary: f.paychecks.salaryHistory, netWorth: nw, netWorthGaps: nwGaps,
    cashFlowMonths: actualMonths.length,
    missing: [
      actualMonths.length ? '' : 'No month of actual income and spending is recorded, so there is no cash-flow trend.',
      nwGaps.length ? `Net worth has no records between ${nwGaps.map((g) => `${shortDate(/** @type {string} */ (g.from))} and ${shortDate(/** @type {string} */ (g.to))}`).join('; ')}.` : '',
      'No savings goals or contribution targets are recorded, so none are shown.',
    ].filter(Boolean),
  };

  // ----- Needs attention -----
  for (const e of f.errors.slice(0, 5)) flag({ level: 'high', kind: 'conflict', title: 'Formula error', text: `${e.tab} ${e.range} shows ${e.value}, so that number can't be used.`, ref: { tab: e.tab, range: e.range } });
  const cardsAdd = adds.find((a) => a.key === 'cards');
  if (cardsAdd && cardsAdd.status !== 'confirmed') flag({ level: 'high', kind: 'missing', title: 'Card minimums missing', text: `Required card payments aren't in the recorded debt total${cardsAdd.amount != null ? '; an estimate is used instead' : ''}.`, ref: ovCard?.ref || cardsAdd.ref });
  for (const l of lines) {
    const periods = pricePeriods(l.note);
    if (!periods.length) continue;
    const nowPrice = priceIn(l, thisMonth);
    const later = periods.filter((pp) => pp.from > thisMonth).sort((a, b) => a.from.localeCompare(b.from))[0];
    if (nowPrice.source === 'conflict') flag({ level: 'high', kind: 'conflict', title: `${l.name} price`, text: `The note gives two prices for ${monthName(thisMonth)}; check which applies.`, ref: l.ref });
    else if (nowPrice.source === 'note' && nowPrice.amount != null) {
      const cur = periods.find((pp) => pp.from <= thisMonth && thisMonth <= pp.to);
      flag({ level: 'high', kind: 'conflict', title: `${l.name} price`, text: `Budget uses ${money(l.amount)}, but the note says ${money(nowPrice.amount)} through ${monthName(/** @type {string} */ (cur?.to))}${later ? `; ${money(later.amount)} starts ${monthName(later.from)}` : ''}.`, ref: l.ref });
    } else if (later && later.amount !== l.amount) flag({ level: 'low', kind: 'change', title: `${l.name} price change`, text: `The note says the price changes to ${money(later.amount)} in ${monthName(later.from)}.`, ref: l.ref });
  }
  // Recent actual bills against the budget line for the same service.
  for (const s of billSeries) {
    if (s.recentAvg == null) continue;
    const rx = new RegExp(`\\b${s.service.split(/\s+/)[0]}`, 'i');
    const match = lines.filter((l) => rx.test(`${l.name} ${l.subcategory}`));
    if (match.length !== 1 || pricePeriods(match[0].note).length) continue;
    const budget = match[0].monthlyAmount;
    if (budget == null || budget <= 0) continue;
    const gap = (s.recentAvg - budget) / budget;
    if (gap > 0.2) flag({ level: 'medium', kind: 'conflict', title: `${s.service} over budget`, text: `${s.service} payments averaged ${money(s.recentAvg)} over the last ${s.recentCount} recorded months, above the ${money(budget)} budget for "${match[0].name}".`, ref: match[0].ref });
  }
  // Savings balances recorded twice with different figures.
  const differing = f.accounts.map((a) => ({ a, e: f.estimates.find((r) => norm(r.label) === norm(a.name)) })).filter((x) => x.e && amount(x.e.value) != null && x.a.balance != null && Math.abs(/** @type {number} */ (amount(x.e.value)) - /** @type {number} */ (x.a.balance)) >= 0.01);
  if (differing.length) flag({ level: 'medium', kind: 'conflict', title: 'Two sets of balances', text: `Savings and Estimate Inputs show different balances for ${differing.map((x) => x.a.name).join(', ')}${savingsNoteDate || reportDate ? ` (Savings note mentions ${savingsNoteDate ? shortDate(savingsNoteDate) : 'no date'}; Estimate Inputs report ${reportDate ? shortDate(reportDate) : 'undated'})` : ''}.`, ref: differing[0].a.ref });
  // Which savings accounts the paycheck feeds, according to each routing table.
  const routeSet = new Set(savingsRouting.map((r) => norm(r.account)));
  const depositSet = new Set(f.paychecks.deposits.filter((d) => (d.pending ?? 0) > 0).map((d) => norm(d.account)));
  const accountDeposits = new Set(f.accounts.filter((a) => (a.deposit ?? 0) > 0 && !isBills(a)).map((a) => norm(a.name)));
  const onlyRouting = [...routeSet].filter((n) => (depositSet.size && !depositSet.has(n)) || (accountDeposits.size && !accountDeposits.has(n)));
  if (routeSet.size && onlyRouting.length) {
    const name = savingsRouting.find((r) => norm(r.account) === onlyRouting[0])?.account || '';
    flag({ level: 'medium', kind: 'conflict', title: 'Paycheck routing differs', text: `${savingsRouting[0].ref.tab} sends savings to ${name}, but the paystub deposits or Savings tab show a different account.`, ref: savingsRouting[0].ref });
  }
  if (f.layoff.essentials != null && jobLossEss != null && Math.abs(f.layoff.essentials - jobLossEss) / Math.max(f.layoff.essentials, jobLossEss) > 0.05) {
    flag({ level: 'medium', kind: 'conflict', title: 'Two job-loss budgets', text: `Layoff Plan essentials${f.layoff.asOf ? ` (${shortDate(f.layoff.asOf)})` : ''} are ${money(f.layoff.essentials)} a month; Estimate Inputs uses ${money(jobLossEss)}${reportDate ? ` (${shortDate(reportDate)})` : ''}.`, ref: f.layoff.ref });
  }
  if (eUndated && eVerified && amount(eUndated.value) !== amount(eVerified.value)) flag({ level: 'low', kind: 'undated', title: 'Retirement figures differ', text: `An undated retirement snapshot differs from the dated statement${eVerifiedDate ? ` (${shortDate(eVerifiedDate)})` : ''}; the dated statement is used.`, ref: eUndated.ref });
  if (mixedRate) flag({ level: 'medium', kind: 'conflict', title: 'Savings rate mixes pay', text: 'The Summary savings % adds payroll 401(k) to take-home savings but divides by take-home pay; this page keeps them apart.', ref: f.allocationRef });
  for (const o of unresolved) {
    const past = o.date && fromIso(o.date) < now;
    flag({ level: 'medium', kind: 'unresolved', title: o.name, text: past ? `Its date (${shortDate(/** @type {string} */ (o.date))}) has passed and the sheet still says "${o.payment || 'no status'}"; confirm whether it was paid.` : `One-time cost${o.estimate != null ? ` of about ${money(o.estimate)}` : ''} with no final amount or due date in the sheet.`, ref: o.ref });
  }
  if (savingsNote || f.accounts.length) flag({ level: 'low', kind: 'undated', title: 'Balances have no bank date', text: `Savings balances have no bank balance date${savingsNoteDate ? `; the note mentions ${shortDate(savingsNoteDate)}` : ''}.`, ref: savingsNote?.ref || f.accounts[0]?.ref || null });
  for (const c of cards.filter((c) => c.kind === 'Unknown')) flag({ level: 'medium', kind: 'missing', title: `${c.name} balance`, text: 'The balance column is blank but the card isn\'t marked paid off, so its balance is unknown.', ref: c.ref });
  const noApr = cards.filter((c) => c.kind !== 'Paid off' && c.apr == null);
  if (noApr.length) flag({ level: 'low', kind: 'missing', title: 'Card APR missing', text: `${noApr.map((c) => c.name).join(', ')} ${noApr.length === 1 ? 'has' : 'have'} no APR recorded.`, ref: noApr[0].ref });
  if (blankReserves.length) flag({ level: 'low', kind: 'missing', title: 'Irregular costs blank', text: `${blankReserves.length} occasional ${blankReserves.length === 1 ? 'cost has' : 'costs have'} no amount, so the reserve is unknown, not zero.`, ref: blankReserves[0].ref });
  if (f.planned.length) flag({ level: 'low', kind: 'missing', title: 'Planned bills', text: `${f.planned.map((x) => x.name).join(', ')} ${f.planned.length === 1 ? 'is' : 'are'} planned with no amount.`, ref: f.planned[0].ref });
  const undatedBills = undated.filter((u) => /month|week|quarter/i.test(u.frequency));
  if (undatedBills.length) flag({ level: 'low', kind: 'missing', title: 'Bills with no due date', text: `${undatedBills.length} recurring ${undatedBills.length === 1 ? 'bill has' : 'bills have'} no usable due date, so ${undatedBills.length === 1 ? "it isn't" : "they aren't"} on the timeline.`, ref: undatedBills[0].ref });
  if (noAccount.length) flag({ level: 'low', kind: 'missing', title: 'Payment account missing', text: `${noAccount.length} ${noAccount.length === 1 ? 'bill has' : 'bills have'} no payment account, so who pays ${noAccount.length === 1 ? 'it' : 'them'} is unclear.`, ref: noAccount[0].ref });
  if (inAllowance.length) flag({ level: 'low', kind: 'conflict', title: 'Paid from allowance account', text: `${inAllowance.map((l) => l.name).join(', ')} ${inAllowance.length === 1 ? 'is' : 'are'} paid from the spending-allowance account, so ${inAllowance.length === 1 ? "it's" : "they're"} counted inside the allowance, not again.`, ref: inAllowance[0].ref });
  // Renewals in the next 60 days (yearly bills with a due date).
  const soon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60);
  for (const l of lines.filter((x) => /year/i.test(x.frequency) && x.due)) {
    const d = nextDue(l.due, now);
    if (d && d <= soon) flag({ level: 'low', kind: 'change', title: `${l.name} renews`, text: `${l.renewal || 'Renews'} on ${shortDate(isoDay(d))}${l.amount != null ? ` for ${money(l.amount)}` : ''}${l.funding === 'parent' ? " (parent's card)" : ''}.`, ref: l.ref });
  }
  for (const q of f.estimates.filter((r) => /questions/i.test(r.section) && /open|partly/i.test(r.b))) flag({ level: 'low', kind: 'missing', title: q.label, text: `Open question in Estimate Inputs: ${q.c}`, ref: q.ref });
  const order = { high: 0, medium: 1, low: 2 };
  attention.sort((a, b) => order[a.level] - order[b.level]);

  // ----- Where every figure comes from -----
  const sources = [
    { metric: 'Income baseline', refs: [income.ref], formula: `Net monthly of the ${income.ref?.tab || 'income'} rows marked "Include in Baseline? Yes" (annual ÷ 12, not two paychecks a month).`, date: 'No pay date for the net figure; it is a planning estimate.', limits: 'Excludes rows marked "No" (one-time bonuses and partner income scenarios).' },
    { metric: 'Recorded commitments', refs: [lines[0]?.ref, recurringDebt[0]?.ref, reserves[0]?.ref], formula: 'Household-paid active bills (monthly column, or amount × frequency) + recurring debt payments + irregular reserves that have amounts.', date: 'Budget amounts, not dated transactions.', limits: 'Leaves out parent-paid bills and bills paid from the allowance account; blank reserves are unknown.' },
    { metric: 'Sheet estimates added', refs: adds.map((a) => a.ref), formula: 'Groceries, fuel and card minimums from Estimate Inputs, used only where the recorded plan has nothing for them.', date: reportDate ? `Estimate Inputs report date ${shortDate(reportDate)}.` : 'Undated.', limits: 'Estimates, not measured spending.' },
    { metric: complete ? 'Unallocated' : 'Unallocated in recorded plan', refs: [income.ref], formula: 'Income baseline − recorded needs and required debt − recorded wants − savings transfers from take-home.', date: 'Plan figure.', limits: 'Not money available to spend: there is no dated cash balance and no unpaid-bills ledger.' },
    { metric: 'Savings from take-home', refs: savingsRouting.map((r) => r.ref), formula: `Routing rows marked "Counts as Savings? Yes" on ${savingsRouting[0]?.ref.tab || 'the income tab'}.`, date: 'Plan figure.', limits: 'Payroll 401(k) is shown on its own; it comes out before take-home pay.' },
    { metric: 'Emergency coverage', refs: coverage.refs, formula: 'Cash counted as available ÷ monthly essentials (normal), or ÷ job-loss essentials including replacement insurance.', date: coverage.cashDate ? `${coverage.cashDateKind === 'report' ? 'Report date' : 'As of'} ${shortDate(coverage.cashDate)}; not a bank balance date.` : 'Undated.', limits: 'Excludes the bills reserve, children\'s savings and retirement.' },
    { metric: 'Debt', refs: [f.loans[0]?.ref, f.cards[0]?.ref], formula: 'Balances, APRs and due dates as recorded on Debt & Loans; mortgage APR and principal estimate from Estimate Inputs.', date: mortgageNote?.date ? `Mortgage note dated ${shortDate(mortgageNote.date)}; card balance dates not recorded.` : 'Balance dates not recorded.', limits: 'No payoff forecasts: minimum payments and several APRs are missing.' },
    { metric: 'Timeline', refs: [p.anchorRef], formula: 'Due dates from the sheet; paydays predicted every pay period from the dated paystub.', date: 'Predicted and recorded dates, not posted payments.', limits: 'The sheet doesn\'t record whether a bill was paid.' },
  ].map((s) => ({ ...s, refs: s.refs.filter(Boolean) }));

  return {
    asOf: isoDay(now), income, commitments, unallocated: { recorded: unallocated, afterEstimates, complete, label: complete ? 'Unallocated' : 'Unallocated in recorded plan', missing },
    lines, parentLines, inAllowance, planned: f.planned, reserves, buckets, separateCash: f.separateCash, separateCashDate: f.separateCashDate,
    coverage, debt, timeline, allocation, trends, attention, sources, savingsNote, reportDate,
    retirement: { verified: amount(eVerified?.value), verifiedDate: eVerifiedDate, undated: amount(eUndated?.value), payroll401k },
  };
}

/** "2026-11-09" -> "Nov 9, 2026". */
export function shortDate(/** @type {string} */ iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MON_NAME[m - 1]} ${d}, ${y}`;
}
/** Money for sentences: whole dollars at $1,000 and over, cents below. Rounds only here. */
export function money(/** @type {number | null | undefined} */ n) {
  if (n == null) return 'unknown';
  const big = Math.abs(n) >= 1000;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: big ? 0 : 2, maximumFractionDigits: big ? 0 : 2 });
}
