// Where Finances and Home get money numbers: the J&M P&L Google Sheet (config.js financeSheetId), exported from
// Drive as .xlsx with this browser's read-only sign-in and read by src/xlsx-lite.js and src/finance-sheet.js.
// Nothing is sent to the Cortex server or kept in storage; each page load reads the sheet fresh. /demo uses sample data.
import { readXlsx } from "/src/xlsx-lite.js";
import { parseWorkbook, TABS } from "/src/finance-sheet.js";

let pending = null; // one read per page, shared by everything that asks

/** @returns {Promise<{ result: import("./src/types").SheetFinanceResult } | { message: string }>} */
export function loadSheetFinance({ fresh = false } = {}) {
  if (fresh) pending = null;
  return (pending ||= read().catch((e) => { pending = null; return { message: e.message }; }));
}

async function read() {
  if (Demo.on) return { result: (await Demo.data()).finances(new Date()) };
  const id = (window.CORTEX_CONFIG.financeSheetId || "").trim();
  if (!id) return { message: "No finance sheet is set. Add its id as financeSheetId in config.js." };
  if (!Drive.linked()) return { message: "Sign in with Google to read the J&M P&L sheet." };
  let info, bytes;
  try {
    [info, bytes] = await Promise.all([Drive.sheetInfo(id), Drive.exportXlsx(id)]);
  } catch (e) {
    if (e.status === 404 || e.status === 403) return { message: "Cortex can't open the J&M P&L sheet with this Google account. Sign in with the account that owns the sheet, or share the sheet with it." };
    return { message: `Couldn't read the J&M P&L sheet: ${e.message}` };
  }
  let tabs;
  try { tabs = await readXlsx(bytes, TABS); } catch { return { message: "The J&M P&L sheet came back in a form Cortex couldn't read." }; }
  const finance = parseWorkbook(tabs);
  return { result: { finance, modifiedTime: info.modifiedTime || null, url: info.webViewLink || `https://docs.google.com/spreadsheets/d/${id}/edit`, name: info.name || "J&M P&L" } };
}
