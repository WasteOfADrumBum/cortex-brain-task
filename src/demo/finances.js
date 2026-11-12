// Sample finances for /demo: every month of this year so far, in the same shape /api/finance returns.
// Made up: no real income, bills, accounts or amounts. The current month is part-way through, with one bill
// overdue and one due this week, so the demo shows every state.
/** @typedef {import("../types").FinanceYear} FinanceYear */
/** @typedef {import("../types").SavedFinanceMonth} SavedFinanceMonth */

/**
 * @param {Date} today
 * @returns {FinanceYear}
 */
export function finances(today) {
  const y = today.getFullYear();
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  /** @type {SavedFinanceMonth[]} */
  const months = [];
  for (let m = 1; m <= today.getMonth() + 1; m++) {
    const ym = `${y}-${pad(m)}`;
    const current = m === today.getMonth() + 1;
    const last = new Date(y, m, 0).getDate();
    const endDay = current ? today.getDate() : last;
    const on = (/** @type {number} */ d) => `${ym}-${pad(Math.min(d, last))}`;
    // Paid when the day has passed, except two bills in the current month: one overdue, one due soon.
    const paid = (/** @type {number} */ d, late = false) => !current || (d < today.getDate() && !late);
    const wobble = (m * 37) % 90;
    const bills = [
      { name: "Rent", amount: 1450, due: on(1), paid: paid(1), category: "housing" },
      { name: "Electric", amount: 70 + wobble, due: on(12), paid: paid(12), category: "utilities" },
      { name: "Internet", amount: 60, due: on(Math.max(1, today.getDate() - 2)), paid: paid(today.getDate() - 2, true), category: "utilities" },
      { name: "Phone", amount: 45, due: on(Math.min(last, today.getDate() + 3)), paid: paid(today.getDate() + 3), category: "utilities" },
      { name: "Car insurance", amount: 118, due: on(26), paid: paid(26), category: "insurance" },
      { name: "Streaming", amount: 16, due: on(28), paid: paid(28), category: "subscriptions" },
    ];
    const income = [
      { name: "Salary", amount: 2100, date: on(1) },
      ...(endDay >= 15 ? [{ name: "Salary", amount: 2100, date: on(15) }] : []),
      ...(m % 3 === 0 ? [{ name: "Side project", amount: 350, date: on(20) }] : []),
    ].filter((i) => i.date <= on(endDay));
    const out = bills.filter((b) => b.paid).reduce((n, b) => n + b.amount, 0) + 640 + wobble * 3;
    months.push({
      month: ym,
      periodStart: on(1),
      periodEnd: on(endDay),
      source: "Sample data",
      generatedAt: new Date(y, m - 1, endDay, 7).toISOString(),
      totals: { in: income.reduce((n, i) => n + i.amount, 0), out },
      coverage: [{ account: "Checking ...0000", status: "complete" }, { account: "Card ...1111", status: current ? "delayed" : "complete" }],
      income,
      bills,
      savedAt: new Date(y, m - 1, endDay, 7, 5).toISOString(),
    });
  }
  return { year: y, months };
}
