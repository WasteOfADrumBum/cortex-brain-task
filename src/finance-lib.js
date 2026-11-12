// Finance payload rules, shared by the paste import (finances.js, in the browser), the save routes (api/finance.js,
// api/ingest/finance.js) and the tests, so every path accepts and rejects exactly the same JSON.
// Schema: docs/cortex-v2-spec.md, "Finances tab and ingest endpoint". No account or card numbers: any string with a
// run of 8 or more digits is refused, and accounts are labelled by nickname plus last 4 digits at most.

/** @typedef {import('./types').FinanceMonth} FinanceMonth */

export const LIMITS = { name: 60, account: 40, notes: 600, items: 100, accounts: 20 };
const STATUSES = ['complete', 'delayed', 'unavailable'];
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

class FieldError extends Error {
  /** @param {string} field @param {string} message */
  constructor(field, message) { super(message); this.field = field; }
}

/** Every string anywhere in the value, with its path ("bills[2].name"). */
function* strings(/** @type {unknown} */ v, path = '') {
  if (typeof v === 'string') yield [path, v];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* strings(v[i], `${path}[${i}]`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) yield* strings(x, path ? `${path}.${k}` : k);
}

const isObj = (/** @type {unknown} */ v) => !!v && typeof v === 'object' && !Array.isArray(v);
function str(/** @type {any} */ o, /** @type {string} */ key, /** @type {string} */ path, /** @type {number} */ max, required = true) {
  const v = o[key];
  if (v === undefined && !required) return undefined;
  if (typeof v !== 'string' || !v.trim()) throw new FieldError(path, 'must be text');
  if (v.length > max) throw new FieldError(path, `must be ${max} characters or fewer`);
  return v.trim();
}
function date(/** @type {any} */ o, /** @type {string} */ key, /** @type {string} */ path) {
  const v = o[key];
  if (typeof v !== 'string' || !DATE.test(v)) throw new FieldError(path, 'must be a date like 2026-10-31');
  return v;
}
function amount(/** @type {any} */ o, /** @type {string} */ key, /** @type {string} */ path) {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e7) throw new FieldError(path, 'must be a number of 0 or more');
  return Math.round(v * 100) / 100;
}
function list(/** @type {any} */ o, /** @type {string} */ key, /** @type {number} */ max) {
  const v = o[key];
  if (!Array.isArray(v)) throw new FieldError(key, 'must be a list');
  if (v.length > max) throw new FieldError(key, `can hold at most ${max} items`);
  return v;
}

/**
 * Checks a pasted or posted month. Returns { ok: true, value } with a clean copy (trimmed text, amounts rounded to
 * cents, unknown fields dropped) or { ok: false, field, message } naming the first problem.
 * @param {unknown} input
 * @returns {{ ok: true, value: FinanceMonth } | { ok: false, field: string, message: string }}
 */
export function validateFinance(input) {
  try {
    if (!isObj(input)) throw new FieldError('(top level)', 'must be one JSON object for one month');
    for (const [path, s] of strings(input)) {
      // Spaces between digits are ignored, so "4111 1111 1111 1111" is caught too. Hyphens are not, so dates pass.
      if (/\d{8,}/.test(s.replace(/(?<=\d) +(?=\d)/g, ''))) {
        throw new FieldError(path, 'contains a run of 8 or more digits, which looks like an account or card number');
      }
    }
    const o = /** @type {any} */ (input);
    if (typeof o.month !== 'string' || !MONTH.test(o.month)) throw new FieldError('month', 'must be a month like 2026-10');
    const periodStart = date(o, 'periodStart', 'periodStart');
    const periodEnd = date(o, 'periodEnd', 'periodEnd');
    if (!periodStart.startsWith(o.month) || !periodEnd.startsWith(o.month)) throw new FieldError('periodStart', `must fall in ${o.month}`);
    if (periodEnd < periodStart) throw new FieldError('periodEnd', 'must not be before periodStart');
    const source = str(o, 'source', 'source', 40);
    if (typeof o.generatedAt !== 'string' || Number.isNaN(Date.parse(o.generatedAt))) throw new FieldError('generatedAt', 'must be a date and time');
    if (!isObj(o.totals)) throw new FieldError('totals', 'must have in and out');
    const totals = { in: amount(o.totals, 'in', 'totals.in'), out: amount(o.totals, 'out', 'totals.out') };
    const coverage = list(o, 'coverage', LIMITS.accounts).map((/** @type {any} */ c, /** @type {number} */ i) => {
      const p = `coverage[${i}]`;
      if (!isObj(c)) throw new FieldError(p, 'must have account and status');
      if (!STATUSES.includes(c.status)) throw new FieldError(`${p}.status`, 'must be complete, delayed or unavailable');
      return { account: /** @type {string} */ (str(c, 'account', `${p}.account`, LIMITS.account)), status: c.status };
    });
    const income = list(o, 'income', LIMITS.items).map((/** @type {any} */ x, /** @type {number} */ i) => {
      const p = `income[${i}]`;
      if (!isObj(x)) throw new FieldError(p, 'must have name, amount and date');
      return { name: /** @type {string} */ (str(x, 'name', `${p}.name`, LIMITS.name)), amount: amount(x, 'amount', `${p}.amount`), date: date(x, 'date', `${p}.date`) };
    });
    const bills = list(o, 'bills', LIMITS.items).map((/** @type {any} */ x, /** @type {number} */ i) => {
      const p = `bills[${i}]`;
      if (!isObj(x)) throw new FieldError(p, 'must have name, amount, due and paid');
      if (typeof x.paid !== 'boolean') throw new FieldError(`${p}.paid`, 'must be true or false');
      /** @type {import('./types').FinanceBill} */
      const bill = { name: /** @type {string} */ (str(x, 'name', `${p}.name`, LIMITS.name)), amount: amount(x, 'amount', `${p}.amount`), due: date(x, 'due', `${p}.due`), paid: x.paid };
      const category = str(x, 'category', `${p}.category`, 30, false);
      if (category) bill.category = category;
      return bill;
    });
    /** @type {FinanceMonth} */
    const value = { month: o.month, periodStart, periodEnd, source: /** @type {string} */ (source), generatedAt: o.generatedAt, totals, coverage, income, bills };
    const notes = str(o, 'notes', 'notes', LIMITS.notes, false);
    if (notes) value.notes = notes;
    return { ok: true, value };
  } catch (e) {
    if (e instanceof FieldError) return { ok: false, field: e.field, message: `${e.field} ${e.message}` };
    throw e;
  }
}

/**
 * Differences worth a confirm before replacing a saved month: fewer bills or income items than before, or an
 * account whose data isn't complete. [] means save without asking.
 * @param {FinanceMonth | null} prev
 * @param {FinanceMonth} next
 */
export function shrinkWarnings(prev, next) {
  const out = [];
  if (prev && next.bills.length < prev.bills.length) out.push(`${prev.bills.length - next.bills.length} fewer bills than the saved copy (${prev.bills.length} to ${next.bills.length}).`);
  if (prev && next.income.length < prev.income.length) out.push(`${prev.income.length - next.income.length} fewer income items than the saved copy (${prev.income.length} to ${next.income.length}).`);
  for (const c of next.coverage) if (c.status !== 'complete') out.push(`${c.account} is marked ${c.status}, so its numbers may be missing.`);
  return out;
}

/**
 * Plain numbers for the views: money in and out from the report's totals, bills paid and due.
 * @param {FinanceMonth} m
 * @param {Date} today
 */
export function summarize(m, today) {
  const day = today.toISOString().slice(0, 10);
  const week = new Date(today.getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const unpaid = m.bills.filter((b) => !b.paid);
  return {
    in: m.totals.in,
    out: m.totals.out,
    net: Math.round((m.totals.in - m.totals.out) * 100) / 100,
    billsPaid: m.bills.length - unpaid.length,
    billsTotal: m.bills.length,
    overdue: unpaid.filter((b) => b.due < day),
    dueSoon: unpaid.filter((b) => b.due >= day && b.due <= week),
  };
}
