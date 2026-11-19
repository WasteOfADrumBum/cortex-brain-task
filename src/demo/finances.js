// Sample finances for /demo, in the same shape the real Finances tab reads from its Google Sheet
// (src/finance-sheet.js). Made up: no real income, bills, accounts or amounts. Due days sit around today so the
// demo always shows bills coming up.
/** @typedef {import("../types").SheetFinanceResult} SheetFinanceResult */

/**
 * @param {Date} today
 * @returns {SheetFinanceResult}
 */
export function finances(today) {
  const day = (/** @type {number} */ add) => String(((today.getDate() - 1 + add + 28) % 28) + 1);
  const y = (/** @type {number} */ m) => Math.round(m * 12 * 100) / 100;
  const p = (/** @type {number} */ m) => Math.round(((m * 12) / 26) * 100) / 100;
  const row = (/** @type {string} */ label, /** @type {number} */ m, /** @type {"income" | "out" | "left"} */ kind) => ({ label, payPeriod: p(m), monthly: m, yearly: y(m), kind });
  return {
    name: "Sample budget",
    url: "https://example.com/sheet",
    modifiedTime: new Date(today.getTime() - 2 * 864e5).toISOString(),
    finance: {
      snapshot: [
        row("Net income (estimated)", 4800, "income"),
        row("Recurring expenses", 1650, "out"),
        row("Debt / loan payments", 1400, "out"),
        row("Occasional cost reserve", 150, "out"),
        row("Left over", 1600, "left"),
      ],
      debt: [
        { label: "Total debt", amount: 182500, total: false },
        { label: "Credit card debt", amount: 1240, total: false },
      ],
      savings: [
        { label: "Household savings", amount: 14200, total: false },
        { label: "Kids' savings", amount: 2300, total: false },
        { label: "Total savings", amount: 16500, total: true },
      ],
      safetyNet: [
        { label: "3-month emergency fund", amount: 9600, total: false },
        { label: "6-month emergency fund", amount: 19200, total: false },
      ],
      allocation: [
        { category: "Needs", actual: 31100, actualShare: 0.54, target: 28800, targetShare: 0.5 },
        { category: "Wants", actual: 9200, actualShare: 0.16, target: 17280, targetShare: 0.3 },
        { category: "Savings", actual: 8100, actualShare: 0.14, target: 11520, targetShare: 0.2 },
      ],
      allocationBase: 57600,
      bills: [
        { name: "Electric", section: "Home & Utilities", kind: "Need", amount: 140, frequency: "Monthly", due: day(2), monthly: 140, yearly: 1680 },
        { name: "Internet", section: "Home & Utilities", kind: "Need", amount: 65, frequency: "Monthly", due: day(5), monthly: 65, yearly: 780 },
        { name: "Water", section: "Home & Utilities", kind: "Need", amount: 55, frequency: "Monthly", due: "", monthly: 55, yearly: 660 },
        { name: "Phone", section: "Phones", kind: "Need", amount: 80, frequency: "Monthly", due: day(12), monthly: 80, yearly: 960 },
        { name: "Car insurance", section: "Vehicle", kind: "Need", amount: 120, frequency: "Monthly", due: day(9), monthly: 120, yearly: 1440 },
        { name: "Registration", section: "Vehicle", kind: "Need", amount: 90, frequency: "Yearly", due: "Mar 31", monthly: 7.5, yearly: 90 },
        { name: "Music streaming", section: "Subscriptions", kind: "Want", amount: 12, frequency: "Monthly", due: day(1), monthly: 12, yearly: 144 },
        { name: "Video streaming", section: "Subscriptions", kind: "Want", amount: 18, frequency: "Monthly", due: day(20), monthly: 18, yearly: 216 },
        { name: "Gym", section: "Health", kind: "Want", amount: 35, frequency: "Monthly", due: day(15), monthly: 35, yearly: 420 },
      ],
      loans: [{ name: "Home loan", type: "Mortgage", balance: 181260, monthly: 1350, due: "1st", status: "Active" }],
      cards: [
        { name: "Rewards card", balance: 0, apr: 0.2299, due: "9th", status: "Paid Off" },
        { name: "Everyday card", balance: 1240, apr: 0.1999, due: day(6), status: "Active" },
      ],
      accounts: [
        { name: "Bills reserve", purpose: "Bills reserve", balance: 6200, group: "Household" },
        { name: "Long-term savings", purpose: "Long-term household savings", balance: 8000, group: "Household" },
        { name: "Kid's savings", purpose: "Child savings", balance: 2300, group: "Child" },
      ],
      missing: [],
    },
  };
}
