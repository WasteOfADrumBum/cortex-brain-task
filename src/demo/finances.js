// Sample month for the Finances tab (phase 4). Made up: no real income, bills or amounts.
// The Finances view arrives in phase 4; this data is typed now so the demo has it ready.
/** @typedef {import("../types").FinanceMonth} FinanceMonth */

/**
 * @param {Date} today
 * @returns {FinanceMonth}
 */
export function finances(today) {
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  /** @param {number} day */
  const on = (day) => `${ym}-${String(day).padStart(2, "0")}`;
  return {
    month: ym,
    currency: "USD",
    income: [{ name: "Salary", amount: 4200, due: on(1), paid: true }, { name: "Side project", amount: 350, due: on(15), paid: false }],
    bills: [
      { name: "Rent", amount: 1450, due: on(1), paid: true },
      { name: "Electric", amount: 92, due: on(12), paid: true },
      { name: "Internet", amount: 60, due: on(18), paid: false },
      { name: "Phone", amount: 45, due: on(21), paid: false },
      { name: "Car insurance", amount: 118, due: on(26), paid: false },
    ],
    updatedAt: new Date(today.getFullYear(), today.getMonth(), 1, 9).toISOString(),
    source: "Sample data",
  };
}
