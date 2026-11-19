// Finances from the budget sheet: the .xlsx reader (a real zip built here) and the label-driven parser.
// Every number below is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { readXlsx, cellRef } from "../src/xlsx-lite.js";
import { parseWorkbook, nextDue, upcoming, monthly, cleanName, amount, percent } from "../src/finance-sheet.js";
import demo from "../src/demo/index.js";

/** A minimal zip (no CRCs; the reader doesn't check them). Entries are deflated unless store is set. */
function zip(files, store = false) {
  const enc = new TextEncoder();
  const parts = [], dir = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const raw = enc.encode(text);
    const data = store ? raw : deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(store ? 0 : 8, 10);
    c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nameBytes.length, 28); c.writeUInt32LE(offset, 42);
    dir.push(c, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const dirBuf = Buffer.concat(dir);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dirBuf.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, dirBuf, end]));
}

const WORKBOOK = `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
  <sheet name="Summary" sheetId="1" r:id="rId3"/><sheet name="Debt &amp; Loans" sheetId="2" r:id="rId4"/><sheet name="Other" sheetId="3" r:id="rId5"/></sheets></workbook>`;
const RELS = `<Relationships><Relationship Id="rId3" Type="ws" Target="worksheets/sheet1.xml"/><Relationship Id="rId4" Type="ws" Target="/xl/worksheets/sheet2.xml"/><Relationship Id="rId5" Type="ws" Target="worksheets/sheet3.xml"/></Relationships>`;
const SHARED = `<sst><si><t>CURRENT SNAPSHOT</t></si><si><r><t>Net </t></r><r><t>Income</t></r></si><si><t xml:space="preserve">Bills &amp; more</t></si></sst>`;
const SHEET1 = `<worksheet><cols><col min="1" max="1"/></cols><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Monthly</t></is></c></row>
  <row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" s="3"><f>B9*2</f><v>1234.5</v></c><c r="C2"/></row>
  <row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3" t="str"><f>"-"</f><v>-</v></c><c r="AA3" t="b"><v>1</v></c></row>
</sheetData></worksheet>`;
const SHEET2 = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Account</t></is></c></row></sheetData></worksheet>`;

test("readXlsx reads shared, rich, inline and formula text, numbers and booleans, by tab name", async () => {
  const files = { "xl/workbook.xml": WORKBOOK, "xl/_rels/workbook.xml.rels": RELS, "xl/sharedStrings.xml": SHARED, "xl/worksheets/sheet1.xml": SHEET1, "xl/worksheets/sheet2.xml": SHEET2, "xl/worksheets/sheet3.xml": SHEET2 };
  for (const store of [false, true]) {
    const tabs = await readXlsx(zip(files, store), ["Summary", "Debt & Loans"]);
    assert.deepEqual(Object.keys(tabs), ["Summary", "Debt & Loans"], "tabs not asked for are skipped");
    const g = tabs.Summary;
    assert.deepEqual(g[0], ["CURRENT SNAPSHOT", "Monthly"]);
    assert.deepEqual(g[1], ["Net Income", 1234.5]);
    assert.equal(g[2][0], "Bills & more");
    assert.equal(g[2][1], "-");
    assert.equal(g[2][26], true);
    assert.equal(tabs["Debt & Loans"][0][0], "Account");
  }
  assert.deepEqual(cellRef("AB12"), [11, 27]);
  await assert.rejects(readXlsx(new Uint8Array([1, 2, 3])), /zip/);
});

// Grids shaped like the real J&M P&L tabs (labels, headers and blank rows), with made-up values.
const SUMMARY = [
  ["HOUSEHOLD FINANCIAL SUMMARY"], [],
  ["CURRENT SNAPSHOT", "Pay Period ($)", "Monthly ($)", "Yearly ($)"],
  ["Pat's Net Income (estimated)", 2000, 4333.33, 52000],
  ["Recurring Expenses", 800, 1733.33, 20800],
  ["Debt / Loan Payments", 600, 1300, 15600],
  ["Occasional Cost Reserve", "-", "-", "-"],
  [null, 600, 1300, 15600],
  [],
  ["DEBT", null, null, "Amount"], ["Total Debt", null, null, 150000], ["Credit Card Debt", null, null, "$1,500.00"],
  [],
  ["CURRENT SAVINGS BALANCES", null, null, "Amount"], ["Household Savings", null, null, 20000], ["Children's Savings", null, null, 1000], [null, null, null, 21000],
  [],
  ["SAFETY NET", null, null, "Amount"], ["3-Month Emergency Fund", null, null, 9000], ["6-Month Emergency Fund", null, null, 18000],
  [],
  ["Category", "Actual Amount", "Actual %", "Should Be @ Current Income", "Target %"],
  ["Needs (50%)", 30000, 0.577, 26000, 0.5], ["Wants (30%)", "$8,000.00", "15.38%", 15600, "30%"], ["Savings (20%)", 6000, 0.115, 10400, 0.2],
  ["Net Income", 52000, 0.83, 52000, 1],
  [], ["A long note that mentions 12345678 and is never read."],
];
const RECURRING = [
  ["RECURRING EXPENSES — CATEGORY TABLES"], ["Needs first, then Wants."], [],
  ["HOME & UTILITIES"],
  ["Expense", "Subcategory", "Owner", "50/30/20", "Amount / Occurrence ($)", "Frequency", "Due Date", "Pay Period ($)", "Monthly ($)", "Yearly ($)", "Status", "Renewal Method", "Payment / Account", "Notes / Source"],
  ["Electric", "Electric", "Joint", "Need", 150, "Monthly", 6, 69.23, 150, 1800, "Active", "N/A", "Reserve  x1234", "private note"],
  ["Property Tax [ABC-0001]", "Tax", "Joint", "Need", 300, "Yearly", 46053, 11.54, 25, 300, "Active"],
  ["Therapy", "Health", "Pat", "Need", "-", "Monthly", null, "-", "-", "-", "Planned"],
  ["Old thing", "x", "Pat", "Want", 10, "Monthly", 3, 4.6, 10, 120, "Cancelled"],
  ["Home & Utilities Total", null, null, null, null, null, null, 80.77, 175, 2100],
  [],
  ["SUBSCRIPTIONS"],
  ["Expense", "Subcategory", "Owner", "50/30/20", "Amount / Occurrence ($)", "Frequency", "Due Date", "Pay Period ($)", "Monthly ($)", "Yearly ($)", "Status"],
  ["Streaming", "Video", "Joint", "Want", 15, "Monthly", "", 6.92, 15, 180, "Active"],
  ["Subscriptions Total"],
  [],
  ["CANCELED / HISTORICAL EXPENSES"],
  ["Expense", "Subcategory", "Owner", "50/30/20", "Amount / Occurrence ($)", "Frequency", "Due Date", "Cancel Date", "Renewal Method", "Monthly Savings ($)", "Yearly Savings ($)"],
  ["Groceries", "Food", "Joint", "Need", 500, "Monthly", "TBD", "", "N/A", 500, 6000],
];
const DEBT = [
  ["DEBT & LOANS"],
  ["Account", "Type", "Balance ($)", "Payment / Occurrence ($)", "Frequency", "Due Date", "Pay Period ($)", "Monthly Payment ($)", "Yearly Payment ($)", "Status"],
  ["Mortgage", "Mortgage", 148500, 1300, "Monthly", "1st", 600, 1300, 15600, "Active"],
  [],
  ["Credit Cards"],
  ["Account", "Balance ($)", "APR", "Credit Limit", "Frequency", "Due Date", "Status"],
  ["Points Card  x1111", "-", "21.5%", 5000, "Monthly", "9th", "Paid Off"],
  ["Cash Card® x2222", 1500, 0.1999, 10000, "Monthly", "Nov 13, 2026", "Current balance; not statement balance, with a long note"],
  ["DEBT SUMMARY", "Amount"],
  ["Total Debt", 150000],
];
const SAVINGS = [
  ["SAVINGS & TRANSFERS"], [],
  ["CASH / SAVINGS ACCOUNTS", "Purpose", "Current Balance ($)", "Deposit / Pay Period ($)", "Type"],
  ["Joint Reserve  x9999", "Bills reserve", 8000, 500, "Household"],
  ["Kid's Savings  x8888", "Child savings", 1000, "-", "Child"],
];

test("parseWorkbook finds every section by its labels and drops account digits and notes", () => {
  const f = parseWorkbook({ Summary: SUMMARY, "Recurring Expenses": RECURRING, "Debt & Loans": DEBT, Savings: SAVINGS });
  assert.deepEqual(f.missing, []);
  assert.deepEqual(f.snapshot.map((r) => [r.label, r.kind, r.monthly]), [
    ["Pat's Net Income (estimated)", "income", 4333.33], ["Recurring Expenses", "out", 1733.33], ["Debt / Loan Payments", "out", 1300],
    ["Occasional Cost Reserve", "out", null], ["Left over", "left", 1300],
  ]);
  assert.deepEqual(f.debt.map((d) => [d.label, d.amount]), [["Total Debt", 150000], ["Credit Card Debt", 1500]]);
  assert.deepEqual(f.savings.at(-1), { label: "Total savings", amount: 21000, total: true });
  assert.equal(f.safetyNet.length, 2);
  assert.deepEqual(f.allocation.map((a) => [a.category, a.actualShare, a.targetShare]), [["Needs", 0.577, 0.5], ["Wants", 0.1538, 0.3], ["Savings", 0.115, 0.2]]);
  assert.equal(f.allocationBase, 52000);

  assert.deepEqual(f.bills.map((b) => [b.name, b.section, b.kind, b.due, b.monthly]), [
    ["Electric", "Home & Utilities", "Need", "6", 150],
    ["Property Tax", "Home & Utilities", "Need", "Jan 31", 25],
    ["Streaming", "Subscriptions", "Want", "", 15],
  ], "planned, cancelled and total rows are skipped; codes in brackets are dropped; date serials become dates");
  assert.deepEqual(f.loans, [{ name: "Mortgage", type: "Mortgage", balance: 148500, monthly: 1300, due: "1st", status: "Active" }]);
  assert.deepEqual(f.cards.map((c) => [c.name, c.balance, c.apr, c.due, c.status]), [
    ["Points Card", 0, 0.215, "9th", "Paid Off"],
    ["Cash Card", 1500, 0.1999, "Nov 13, 2026", ""],
  ], "the summary table after the cards is not read as cards; long status notes are dropped");
  assert.deepEqual(f.accounts.map((a) => a.name), ["Joint Reserve", "Kid's Savings"]);
  const text = JSON.stringify(f);
  for (const secret of ["1234", "1111", "2222", "9999", "private note", "12345678", "ABC-0001"]) assert.ok(!text.includes(secret), secret);

  const m = monthly(f);
  assert.equal(m.income, 4333.33);
  assert.equal(m.out, 3033.33);
  assert.equal(m.left, 1300);
});

test("missing tabs leave their parts empty and are named", () => {
  const f = parseWorkbook({ Summary: SUMMARY });
  assert.deepEqual(f.missing, ["Recurring Expenses", "Debt & Loans", "Savings"]);
  assert.deepEqual(f.bills, []);
  assert.deepEqual(parseWorkbook({}).snapshot, []);
});

test("due dates: a day each month, a day each year, or one date", () => {
  const today = new Date(2026, 10, 18); // Nov 18
  const iso = (d) => d && `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  assert.equal(iso(nextDue("21", today)), "2026-11-21");
  assert.equal(iso(nextDue("6", today)), "2026-12-6");
  assert.equal(iso(nextDue("18th", today)), "2026-11-18");
  assert.equal(iso(nextDue("31", new Date(2027, 1, 3))), "2027-2-28", "short months clamp to their last day");
  assert.equal(iso(nextDue("Jan 31", today)), "2027-1-31");
  assert.equal(iso(nextDue("Nov 13, 2026", today)), null, "a one-time date that has passed");
  assert.equal(iso(nextDue("Dec 2, 2026", today)), "2026-12-2");
  assert.equal(iso(nextDue("Sept 18th", today)), "2027-9-18");
  assert.equal(nextDue("TBD", today), null);
  assert.equal(nextDue("With phone bill", today), null);
  const f = parseWorkbook({ Summary: SUMMARY, "Recurring Expenses": RECURRING, "Debt & Loans": DEBT });
  assert.deepEqual(upcoming(f, today, 14).map((x) => [x.name, iso(x.date)]), [["Mortgage", "2026-12-1"]]);
  assert.deepEqual(upcoming(f, new Date(2026, 10, 1), 13).map((x) => x.name), ["Mortgage", "Electric", "Cash Card"]);
});

test("amounts and percents accept sheet text or numbers", () => {
  assert.equal(amount("$1,234.567"), 1234.57);
  assert.equal(amount("-"), null);
  assert.equal(amount(""), null);
  assert.equal(percent("23.74%"), 0.2374);
  assert.equal(percent(0.5), 0.5);
  assert.equal(cleanName("PNC Cash Unlimited® Visa Signature®  x2242"), "PNC Cash Unlimited Visa Signature");
});

test("the demo finances use the sheet shape and made-up names only", () => {
  const d = demo.finances(new Date());
  assert.ok(d.finance.snapshot.some((r) => r.kind === "income"));
  assert.ok(upcoming(d.finance, new Date(), 14).length > 0, "the demo always has something due soon");
  assert.ok(d.url.startsWith("https://example.com/"));
});
