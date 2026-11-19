// Sample finances for /demo: a made-up workbook laid out like the real J&M P&L (src/demo/finance-workbook.js), read
// by the same parser the real page uses, so the demo shows every view, gap and conflict the page can show.
// No real income, bills, accounts or amounts.
/** @typedef {import("../types").SheetFinanceResult} SheetFinanceResult */
import { parseWorkbook } from "../finance-sheet.js";
import { demoWorkbook, DEMO_TAB_NAMES } from "./finance-workbook.js";

/**
 * @param {Date} today
 * @returns {SheetFinanceResult}
 */
export function finances(today) {
  return {
    name: "Sample budget",
    url: "https://example.com/sheet",
    modifiedTime: new Date(today.getTime() - 2 * 864e5).toISOString(),
    finance: parseWorkbook(demoWorkbook(today), DEMO_TAB_NAMES),
  };
}
