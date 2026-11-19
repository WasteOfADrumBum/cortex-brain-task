// The money rules behind the Finances page (src/finance-model.js). Every number here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWorkbook, amount, noteDate, scrub, isFormulaError } from "../src/finance-sheet.js";
import { buildModel, monthlyOf, funding, pricePeriods, priceIn, spendingTotal, isAllowance } from "../src/finance-model.js";
import { demoWorkbook, DEMO_TAB_NAMES } from "../src/demo/finance-workbook.js";

const TODAY = new Date(2026, 10, 19); // Nov 19, 2026
const demoModel = (today = TODAY) => buildModel(parseWorkbook(demoWorkbook(today), DEMO_TAB_NAMES), today);
/** A bill with only the fields a test cares about. */
const bill = (o) => ({ name: "Bill", section: "Home", subcategory: "", owner: "", kind: "Need", amount: null, frequency: "Monthly", due: "", monthly: null, yearly: null, status: "Active", renewal: "", account: "Reserve", note: "", error: false, ref: { tab: "Recurring Expenses", range: "A1:N1" }, ...o });
/** An empty workbook model to fill in per test. */
const empty = () => parseWorkbook({});

test("spending totals leave out transfers and card repayments, and count the allowance once", () => {
  const r = spendingTotal([
    { amount: 100, basis: "purchase" },
    { amount: 400, basis: "transfer" }, // moving money to savings
    { amount: 100, basis: "card-repayment" }, // paying off the purchase above
    { amount: 300, basis: "allowance" },
    { amount: 20, basis: "in-allowance" }, // bought out of the allowance
    { amount: 50, basis: "debt" },
  ]);
  assert.equal(r.total, 450);
  assert.equal(r.excluded, 3);
});

test("funding: parent cards, the allowance and things paid from the allowance account are told apart", () => {
  const allowance = bill({ name: "Partner's Spending Money", subcategory: "Personal Spending", account: "Shared Spending", kind: "Want", monthly: 300 });
  const accounts = new Set(["sharedspending"]);
  assert.ok(isAllowance(allowance));
  assert.equal(funding(allowance, accounts), "allowance");
  assert.equal(funding(bill({ account: "Shared Spending" }), accounts), "in-allowance");
  assert.equal(funding(bill({ account: "Mom's Credit Card" }), accounts), "parent");
  assert.equal(funding(bill({ account: "Visa", note: "Receipt Oct 1; paid by parents." }), accounts), "parent");
  assert.equal(funding(bill({ account: "Unknown" }), accounts), "unknown");
  assert.equal(funding(bill({ account: "" }), accounts), "unknown");
  assert.equal(funding(bill({ account: "Bills Reserve" }), accounts), "household");
});

test("the plan counts household money only: no parent-paid bills and no double count through the allowance", () => {
  const f = empty();
  f.incomeSources = [{ name: "Salary (net estimated)", type: "Salary", include: true, netPerPeriod: 1000, grossPerPeriod: 1500, netMonthly: 2000, grossMonthly: 3000, netYearly: 24000, grossYearly: 36000, ref: { tab: "Income", range: "A4:I4" } }];
  f.bills = [
    bill({ name: "Electric", monthly: 100 }),
    bill({ name: "Streaming", kind: "Want", monthly: 15, account: "Mom's Credit Card" }),
    bill({ name: "Spending Money", subcategory: "Personal Spending", kind: "Want", monthly: 300, account: "Shared Spending" }),
    bill({ name: "Club", kind: "Want", monthly: 5, account: "Shared Spending" }),
  ];
  const m = buildModel(f, TODAY);
  assert.equal(m.commitments.needs, 100);
  assert.equal(m.commitments.wants, 300, "the allowance counts; the club paid from it and the parent-paid stream don't");
  assert.deepEqual(m.commitments.parent, { total: 15, count: 1 });
  assert.deepEqual(m.commitments.inAllowance.names, ["Club"]);
});

test("blank amounts stay unknown, never zero, and the residual is labelled as incomplete", () => {
  const f = empty();
  f.incomeSources = [{ name: "Salary", type: "Salary", include: true, netPerPeriod: 1000, grossPerPeriod: 1500, netMonthly: 2000, grossMonthly: 3000, netYearly: 24000, grossYearly: 36000, ref: { tab: "Income", range: "A4:I4" } }];
  f.bills = [bill({ monthly: 500 }), bill({ name: "Mystery", monthly: null, amount: null })];
  f.reserves = [{ name: "Vet", category: "Pets", kind: "Need", annual: null, monthly: null, status: "Active", timing: "Annual", note: "", ref: { tab: "Occasional Costs", range: "A5:N5" } }];
  const m = buildModel(f, TODAY);
  assert.equal(m.unallocated.complete, false);
  assert.equal(m.unallocated.label, "Unallocated in recorded plan");
  assert.equal(m.unallocated.recorded, 1500, "the blank bill and blank reserve add nothing, but are listed as missing");
  assert.ok(m.unallocated.missing.some((x) => x.key === "reserves"));
  assert.ok(m.unallocated.missing.some((x) => x.key === "unknown" && /Mystery/.test(x.text)));
  assert.ok(m.unallocated.missing.some((x) => x.key === "groceries"));
  assert.equal(m.unallocated.afterEstimates, null, "with no grocery estimate in the sheet, there's no after-estimates figure");
  assert.equal(m.income.status, "recorded");
});

test("a card with a blank balance is unknown unless it is marked paid off", () => {
  const grid = [
    ["Credit Cards"],
    ["Account", "Balance ($)", "APR", "Credit Limit", "Frequency", "Due Date", "Status"],
    ["Old Card", "-", "20%", 1000, "Monthly", "9th", "Paid Off"],
    ["New Card", "-", "21%", 1000, "Monthly", "Nov 2 (statement)", "Current $50; last statement minimum $25. Payment not confirmed."],
  ];
  const f = parseWorkbook({ "Debt & Loans": grid });
  assert.deepEqual(f.cards.map((c) => c.balance), [0, null]);
  const m = buildModel(f, TODAY);
  assert.equal(m.debt.cards[1].kind, "Unknown");
  assert.ok(m.debt.cards[1].gaps.includes("minimum payment"));
  assert.ok(m.attention.some((a) => a.title === "New Card balance"));
  assert.ok(m.timeline.undated.some((u) => u.name === "New Card" && /passed/.test(u.why)), "a yearless statement date that has passed isn't moved to next year");
});

test("savings rate uses take-home savings only; the Summary rate that mixes in payroll 401(k) is flagged", () => {
  const m = demoModel();
  assert.ok(Math.abs(m.allocation.savingsRate - 433.34 / 4800) < 1e-9);
  assert.equal(m.allocation.payroll401k, 350);
  assert.equal(m.allocation.mixedRate, true);
  assert.ok(m.attention.some((a) => a.title === "Savings rate mixes pay"));
});

test("dated prices: only the strict '<Mon>-<Mon> <YYYY> $amount' form is read, and overlaps are conflicts", () => {
  const note = "Offer 11/10/26: Nov-Dec 2026 $95.00; Jan-Dec 2027 $60.00/month. Check pricing again in 2028.";
  assert.deepEqual(pricePeriods(note), [{ from: "2026-11", to: "2026-12", amount: 95 }, { from: "2027-01", to: "2027-12", amount: 60 }]);
  const b = bill({ amount: 60, monthly: 60, note });
  assert.deepEqual(priceIn(b, "2026-11"), { amount: 95, source: "note" });
  assert.deepEqual(priceIn(b, "2027-03"), { amount: 60, source: "sheet" });
  assert.deepEqual(priceIn(b, "2028-02"), { amount: 60, source: "sheet" }, "no period: the sheet's amount");
  assert.deepEqual(pricePeriods("Price goes up to about $90 sometime next year"), [], "loose wording is ignored, not guessed at");
  const clash = bill({ amount: 80, note: "Nov-Dec 2026 $100.00; Nov-Nov 2026 $110.00" });
  assert.deepEqual(priceIn(clash, "2026-11"), { amount: null, source: "conflict" });
});

test("the timeline uses the note's price in the months it covers and flags the budget conflict", () => {
  const m = demoModel();
  const internet = m.timeline.items.find((i) => i.name === "Internet");
  assert.equal(internet.amount, 95);
  assert.equal(internet.priceFromNote, true);
  assert.ok(m.attention.some((a) => a.title === "Internet price" && a.level === "high"));
  assert.ok(!m.attention.some((a) => a.title === "Internet over budget"), "the price note already explains it");
});

test("emergency coverage leaves out the bills reserve, children's savings and retirement", () => {
  const f = empty();
  f.accounts = [
    { name: "Bills Reserve", purpose: "Bills reserve", balance: 5000, deposit: 500, group: "Household", ref: { tab: "Savings", range: "A7:E7" } },
    { name: "Long-Term", purpose: "Long-term household savings", balance: 8000, deposit: 100, group: "Household", ref: { tab: "Savings", range: "A8:E8" } },
    { name: "Kid's Savings", purpose: "Child savings", balance: 2000, deposit: null, group: "Child", ref: { tab: "Savings", range: "A9:E9" } },
  ];
  f.estimates = [{ section: "LIVING COSTS", label: "Estimated essential costs monthly", value: 4000, b: "$4,000.00", c: "", d: "", e: "", ref: { tab: "Estimate Inputs", range: "A40:E40" } }];
  f.investments = [{ name: "401(k)", type: "Retirement", perPeriod: 100, monthly: 216.67, status: "Active", note: "", ref: { tab: "Savings", range: "A3:H3" } }];
  const m = buildModel(f, TODAY);
  assert.equal(m.coverage.cash, 8000, "only the long-term account counts");
  assert.equal(m.coverage.normal, 2);
  assert.equal(m.coverage.cashStatus, "estimate");
  assert.equal(m.coverage.confirmed, false);
  const byKey = Object.fromEntries(m.buckets.map((b) => [b.key, b]));
  assert.equal(byKey.bills.amount, 5000);
  assert.equal(byKey.children.amount, 2000);
  assert.equal(byKey.emergency.amount, null, "nothing designated for emergencies yet: unknown, not zero");
  assert.equal(byKey.emergency.status, "unknown");
});

test("confirmed overrides replace estimates, and coverage is confirmed only with cash, essentials and a date", () => {
  const f = parseWorkbook(demoWorkbook(TODAY), DEMO_TAB_NAMES);
  const set = (rx, v) => { const row = f.dashboard.find((r) => rx.test(r.label)); row.value = v; row.b = String(v); };
  set(/^designated available emergency cash/i, 9000);
  set(/^confirmed essential monthly/i, 3000);
  let m = buildModel(f, TODAY);
  assert.equal(m.coverage.normal, 3);
  assert.equal(m.coverage.confirmed, false, "no as-of date yet");
  set(/^emergency balance as-of/i, "2026-11-15");
  set(/^additional monthly debt payments/i, 0);
  m = buildModel(f, TODAY);
  assert.equal(m.coverage.confirmed, true);
  assert.equal(m.buckets.find((b) => b.key === "emergency").amount, 9000);
  assert.deepEqual(m.commitments.adds.find((a) => a.key === "cards"), { key: "cards", label: "Card minimums", amount: 0, status: "confirmed", basis: "Confirmed override on Dashboard Data", ref: m.commitments.adds.find((a) => a.key === "cards").ref }, "a confirmed $0 is a real zero");
  assert.ok(!m.attention.some((a) => a.title === "Card minimums missing"));
});

test("precision is kept through the sums; only display rounds", () => {
  assert.equal(amount(1 / 3), 1 / 3, "sheet numbers keep full precision");
  const yearly = monthlyOf({ monthly: null, amount: 100, frequency: "Yearly" });
  assert.equal(yearly.amount, 100 / 12);
  assert.equal(yearly.computed, true);
  const f = empty();
  f.incomeSources = [{ name: "Salary", type: "Salary", include: true, netPerPeriod: null, grossPerPeriod: null, netMonthly: 1000, grossMonthly: null, netYearly: null, grossYearly: null, ref: { tab: "Income", range: "A4:I4" } }];
  f.bills = [1, 2, 3].map((i) => bill({ name: `Thing ${i}`, amount: 100, frequency: "Yearly" }));
  const m = buildModel(f, TODAY);
  assert.equal(m.commitments.needs, (100 / 12) * 3, "three yearly bills sum to exactly $25.00, not $24.99 from rounding each first");
  assert.equal(Math.round(m.commitments.needs * 100) / 100, 25);
});

test("paydays are predicted from the dated paystub; dateless items are listed, not dropped", () => {
  const m = demoModel();
  const paydays = m.timeline.items.filter((i) => i.kind === "payday");
  assert.ok(paydays.length >= 2);
  assert.ok(paydays.every((p) => p.dateKind === "predicted"));
  const gap = (new Date(paydays[1].date) - new Date(paydays[0].date)) / 864e5;
  assert.equal(gap, 14);
  for (const name of ["Water / Trash", "HOA", "Sample Watch"]) assert.ok(m.timeline.undated.some((u) => u.name === name), name);
  assert.ok(m.timeline.items.filter((i) => i.kind !== "payday").every((i) => i.status !== "Paid"), "the sheet never says a bill is paid");
});

test("one-time costs whose date has passed stay unresolved instead of being assumed paid or overdue", () => {
  const m = demoModel();
  const crown = m.attention.find((a) => a.title === "Dental crown");
  assert.ok(crown && /confirm whether it was paid/.test(crown.text));
  assert.ok(m.coverage.oneTimeKnown > 0);
  assert.ok(m.coverage.afterOneTime < m.coverage.normal);
});

test("conflicts the demo carries are all found", () => {
  const titles = demoModel().attention.map((a) => a.title);
  for (const t of ["Card minimums missing", "Water over budget", "Two sets of balances", "Paycheck routing differs", "Two job-loss budgets", "Retirement figures differ", "Paid from allowance account", "Irregular costs blank"]) {
    assert.ok(titles.includes(t), t);
  }
  const levels = demoModel().attention.map((a) => a.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => ["high", "medium", "low"].indexOf(a) - ["high", "medium", "low"].indexOf(b)), "most important first");
});

test("formula errors are kept as errors, never read as numbers, and flagged with their cell", () => {
  assert.ok(isFormulaError("#REF!"));
  assert.equal(amount("#DIV/0!"), null);
  const f = parseWorkbook({ Summary: [["CURRENT SNAPSHOT", "Pay Period ($)", "Monthly ($)"], ["Net Income (estimated)", "#REF!", 2000]] });
  assert.deepEqual(f.errors, [{ tab: "Summary", range: "B2", value: "#REF!" }]);
  assert.ok(buildModel(f, TODAY).attention.some((a) => a.title === "Formula error" && /Summary B2/.test(a.text)));
});

test("note dates ignore future dates; notes lose account digits, links and long numbers", () => {
  assert.equal(noteDate("Snapshot Oct 12 2026; matures Jun 1, 2055.", "2026-11-19"), "2026-10-12");
  const s = scrub("Paid by Visa x1357 and ••••2468 on Oct 30, 2026; account 908172; see https://example.com/a?b=1 and msg 0a1b2c3d4e5f6a7b. Total $1,234.56.");
  for (const bad of ["1357", "2468", "908172", "example.com", "0a1b2c3d4e5f6a7b"]) assert.ok(!s.includes(bad), bad);
  assert.ok(s.includes("Oct 30, 2026") && s.includes("$1,234.56"), "dates and amounts stay");
});

test("the model never offers a 'safe to spend' figure", () => {
  const text = JSON.stringify(demoModel());
  assert.ok(!/safe to spend|can afford|spending money left/i.test(text));
});
