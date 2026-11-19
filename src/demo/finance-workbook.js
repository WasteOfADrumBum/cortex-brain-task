// A made-up budget workbook laid out like the real J&M P&L tabs (same labels, headers and blank rows), for /demo
// and the tests. Every name, amount, date and note here is invented. Dates move with `today` so the demo always
// has paydays and bills coming up, and it deliberately carries the kinds of gaps and conflicts the real page has
// to handle: missing card minimums, a dated price change in a note, a utility running over budget, parent-paid
// bills, an allowance account, blank irregular costs, an unresolved one-time cost and two sets of balances.
/** @typedef {import('../xlsx-lite.js').Grid} Grid */
import { TAB_NAMES } from '../finance-sheet.js';

/** The demo workbook's tab names: the real layout with made-up people. */
export const DEMO_TAB_NAMES = { ...TAB_NAMES, income: 'Sam Income', partnerIncome: 'Alex Income', paychecks: 'Sam Paycheck History', water: 'Water Payments' };

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
const add = (/** @type {Date} */ d, /** @type {number} */ days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
const us = (/** @type {Date} */ d) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
const iso = (/** @type {Date} */ d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const words = (/** @type {Date} */ d) => `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const day = (/** @type {Date} */ today, /** @type {number} */ offset) => add(today, offset).getDate();

/**
 * @param {Date} today
 * @returns {Record<string, Grid>}
 */
export function demoWorkbook(today) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const y = t.getFullYear();
  const m = t.getMonth();
  const report = add(t, -10);
  const sync = add(t, -22);
  // A paystub dated a few pay periods back, so paydays land in the next weeks.
  const stub = add(t, -14 * 6 + 3);
  const periodStart = add(stub, -18), periodEnd = add(stub, -5);
  const promoNote = `Retention offer ${us(add(t, -2))}: ${MON[m]}-Dec ${y} $95.00; Jan-Dec ${y + 1} $60.00/month. Check pricing again in ${y + 2}.`;
  const NA = null;

  return {
    Summary: [
      ['HOUSEHOLD FINANCIAL SUMMARY'], [],
      ['CURRENT SNAPSHOT', 'Pay Period ($)', 'Monthly ($)', 'Yearly ($)'],
      ["Sam's Net Income (estimated)", 2215.38, 4800, 57600],
      ['Recurring Expenses', 690, 1495, 17940],
      ['Debt / Loan Payments', 625.85, 1356, 16272],
      ['Occasional Cost Reserve', '-', '-', '-'],
      [NA, 899.54, 1949, 23388],
      [],
      ['DEBT', NA, NA, 'Amount'], ['Total Debt', NA, NA, 186900], ['Credit Card Debt', NA, NA, 2410],
      [],
      ['CURRENT SAVINGS BALANCES', NA, NA, 'Amount'], ['Household Savings', NA, NA, 21300], ["Children's Savings", NA, NA, 1450], [NA, NA, NA, 22750],
      [],
      ['SAFETY NET', NA, NA, 'Amount'], ['3-Month Emergency Fund', NA, NA, 8200], ['6-Month Emergency Fund', NA, NA, 16400],
      [],
      ['Category', 'Actual Amount', 'Actual %', 'Should Be @ Current Income', 'Target %'],
      ['Needs (50%)', 30500, 0.5295, 28800, 0.5], ['Wants (30%)', 6900, 0.1198, 17280, 0.3], ['Savings (20%)', 9400.08, 0.1632, 11520, 0.2],
      ['Net Income', 57600, 0.8, 57600, 1],
    ],
    'Dashboard Data': [
      ['DASHBOARD DATA AND INPUTS'], ['Working estimates use Estimate Inputs. Optional confirmed overrides go in the yellow cells.'], [],
      ['CURRENT RECORDED PLAN', 'Monthly USD', 'Source / limitation'],
      ['Estimated take-home income', 4800, 'Sample baseline only.'],
      ['Take-home savings transfers', 433.33, 'Excludes payroll 401(k).'],
      [],
      ['OPTIONAL CONFIRMED OVERRIDES', 'Value', 'What to enter'],
      ['Additional monthly debt payments', NA, 'All required debt payments missing from the known total, including card minimums.'],
      ['All required debt payments included?', 'No', 'Choose Yes only after the line above is complete.'],
      ['Designated available emergency cash', NA, 'Unrestricted cash set aside for emergencies.'],
      ['Confirmed essential monthly expenses', NA, 'Complete essentials.'],
      ['Emergency balance as-of date', NA, 'Source-dated balance date.'],
      ['Actual take-home income', NA, 'For one completed month.'],
      ['Actual needs', NA, ''], ['Actual wants', NA, ''], ['Actual savings and extra debt', NA, ''],
      ['Allocation month', NA, 'A date in the completed month.'],
      [],
      ['Month (2026 actuals)', 'Net income (USD)', 'Expenses + required debt (USD)', 'Net cash flow (USD)', 'Status'],
      [`Jan ${y}`, NA, NA, NA, 'Unavailable: complete monthly totals needed'],
      [`Feb ${y}`, NA, NA, NA, 'Unavailable: complete monthly totals needed'],
    ],
    'Estimate Inputs': [
      ['ESTIMATES AND SOURCE ASSUMPTIONS'], ['Sample working estimates.'], [],
      ['CASH AND RECORDED BALANCES', 'Value', 'Treatment', 'Source'],
      ['Reference report date', words(report), 'Report date only; bank balance dates unavailable.', 'Sample report'],
      ['Long-Term Savings', 12100, 'Savings.', 'Sample report'],
      ['Short-Term Savings', 6300, 'Savings.', 'Sample report'],
      ['Savings available in base scenario', 18400, 'Excludes bills reserve, child accounts and retirement.', 'Derived'],
      ['Bills Reserve', 2900, 'Bills reserve with some cushion. Used only in an upper scenario.', 'Sample report'],
      ['Undated retirement snapshot', 24100, 'Snapshot with no source date.', 'Sample report'],
      ['Verified retirement statement', 23650, 'Dated statement.', 'Savings!H3'],
      ['Verified retirement date', words(add(t, -50)), 'Statement date.', 'Savings!H3'],
      ['DEBT PAYMENT ESTIMATE', 'Value', 'Treatment', 'Source'],
      ['Rewards card statement balance', 410.5, 'Statement balance, not current purchases.', 'Sample report'],
      ['Store card historic balance', 1990, 'Historic, unverified.', 'Debt & Loans!B8'],
      ['Store card payment proxy', 40, 'Observed payment, not a verified minimum.', 'Sample note'],
      ['Estimated additional debt payments', 65, 'Payment proxies, not verified minimums.', 'Derived'],
      ['Mortgage APR', 0.0425, 'Fixed rate from a sample statement.', 'Debt & Loans!A20'],
      ['Current mortgage principal estimate', 184100, 'Scheduled amortization, not a new statement.', 'Derived'],
      ['LIVING COSTS AND COVERAGE', 'Value', 'Treatment', 'Source'],
      ['Central groceries monthly', 1100, 'Midpoint of a weekly range, annualized by 52/12.', 'Sample reply'],
      ['Fuel monthly estimate', 160, 'Assumes one refill a week; not measured spending.', 'Derived'],
      ['Estimated essential costs monthly', 4100, 'Adds groceries, fuel and card estimates to recorded needs.', 'Derived'],
      ['Replacement insurance monthly proxy', 1500, 'Historical plan cost; not a quote.', 'Sample plan'],
      ['Job-loss essential cost estimate', 5600, 'Adds replacement insurance; income excluded.', 'Sample plan'],
      ['Savings-only coverage months', 4.5, 'Savings / essentials.', 'Derived'],
      [],
      ['QUESTIONS TO RESOLVE IN CHAT', 'Status', 'Question', 'Why it matters'],
      ['Bills-reserve cushion', 'Open', 'How much of the bills reserve is spare cushion?', 'Refines the upper case.'],
      ['Food budget', 'Answered', 'Weekly groceries confirmed.', ''],
    ],
    'Sam Income': [
      ["SAM'S INCOME"], [],
      ['Income Source', 'Type', 'Include in Baseline?', 'Net / Pay Period ($)', 'Gross / Pay Period ($)', 'Net Monthly ($)', 'Gross Monthly ($)', 'Net Yearly ($)', 'Gross Yearly ($)'],
      ['Base Salary (net estimated)', 'Salary', 'Yes', 2215.38, 3230.77, 4800, 7000, 57600, 84000],
      ['One-time bonus', 'Bonus', 'No', NA, NA, NA, NA, 1200, 1800],
      [NA, NA, NA, 2215.38, 3230.77, 4800, 7000, 58800, 85800],
      [],
      ['NOTE'], ['Biweekly means 26 paychecks a year. Monthly figures use annual ÷ 12, not two paychecks per month.'],
      [],
      ['PENDING DIRECT DEPOSIT ROUTING', 'Purpose', 'Per Pay Period ($)', 'Monthly Equivalent ($)', 'Yearly ($)', 'Counts as Savings?'],
      ['Bills Reserve  x0001', 'Bills reserve', 900, 1950, 23400, 'No'],
      ['Long-Term Savings  x0002', 'Long-term savings', 100, 216.67, 2600, 'Yes'],
      ['Rainy Day Savings  x0003', 'Short-term savings', 100, 216.67, 2600, 'Yes'],
      ['Shared Spending  x0004', "Alex's spending", 150, 325, 3900, 'No'],
      ['Everyday Checking  x0005', 'Remaining take-home', 965.38, 2091.66, 25099.88, 'No'],
    ],
    'Alex Income': [
      ["ALEX'S INCOME"], [],
      ['PART-TIME JOB', 'Include in Baseline?', 'Hourly Rate ($)', 'Avg Tips / Hour ($)', 'Hours / Week', 'Weeks / Year', 'Gross Weekly ($)', 'Gross Monthly ($)', 'Gross Yearly ($)', 'Notes'],
      ['Part-time job', 'No', 12, 0, 15, 52, 180, 780, 9360, 'Estimate until it starts.'],
    ],
    'Sam Paycheck History': [
      ['PAYCHECK & RATE HISTORY'], [],
      [`CURRENT PAYCHECK — ${us(stub)}`],
      ['Pay Period', 'Gross Earnings ($)', 'Taxes ($)', 'Deductions ($)', 'Net Earnings ($)', 'Employer Benefits ($)'],
      [`${us(periodStart)} - ${us(periodEnd)}`, 3200, 520, 470, 2210, 400],
      [], [],
      ['RATE / SALARY HISTORY'],
      ['Effective Date', 'Change Reason', 'Hourly Rate ($)', 'Gross / Check ($)', 'Annual Salary ($)'],
      [`05/02/${y - 4}`, 'New Hire', 33.65, 2692.31, 70000],
      [`04/01/${y - 3}`, 'Merit', 34.66, 2773.08, 72100],
      [`04/01/${y - 1}`, 'Market Adjustment', 38.94, 3115.38, 81000],
      [`04/01/${y}`, 'Merit', 40.38, 3230.77, 84000],
      [],
      ['DIRECT DEPOSIT — CURRENT PAYSTUB VS PENDING SETUP'],
      ['Account', 'Ending', 'Type', 'Current Paystub ($)', 'Pending Setup ($)', 'Change ($)'],
      ['Bills Reserve (Bills)', '0001', 'Savings', 900, 900, '-'],
      ['Long-Term Savings', '0002', 'Savings', 100, 100, '-'],
      ['Short-Term Savings', '0006', 'Savings', 100, 100, '-'],
      ['TOTAL', '', '', 2210, 2210, '-'],
    ],
    'Recurring Expenses': [
      ['RECURRING EXPENSES — CATEGORY TABLES'], ['Needs first, then Wants.'], [],
      ['HOME & UTILITIES'],
      ['Expense', 'Subcategory', 'Owner', '50/30/20', 'Amount / Occurrence ($)', 'Frequency', 'Due Date', 'Pay Period ($)', 'Monthly ($)', 'Yearly ($)', 'Status', 'Renewal Method', 'Payment / Account', 'Notes / Source'],
      ['Electric', 'Electric', 'Joint', 'Need', 180, 'Monthly', day(t, 3), 83.08, 180, 2160, 'Active', 'N/A', 'Bills Reserve  x0001', 'Rolling-year average.'],
      ['Internet', 'Internet', 'Joint', 'Need', 60, 'Monthly', day(t, 9), 27.69, 60, 720, 'Active', 'N/A', 'Bills Reserve  x0001', promoNote],
      ['Water / Trash', 'Water / Trash', 'Joint', 'Need', 70, 'Monthly', NA, 32.31, 70, 840, 'Active', 'Unknown', 'Unknown', 'Prior-year average.'],
      ['HOA', 'HOA', 'Joint', 'Need', 60, 'Quarterly', NA, 9.23, 20, 240, 'Active', 'Unknown', 'Unknown'],
      ['Home & Utilities Total', NA, NA, NA, NA, NA, NA, 152.31, 330, 3960],
      [],
      ['VEHICLE & PROPERTY'],
      ['Expense', 'Subcategory', 'Owner', '50/30/20', 'Amount / Occurrence ($)', 'Frequency', 'Due Date', 'Pay Period ($)', 'Monthly ($)', 'Yearly ($)', 'Status', 'Renewal Method', 'Payment / Account', 'Notes / Source'],
      ['Car Insurance', 'Insurance', 'Joint', 'Need', 140, 'Monthly', day(t, 12), 64.62, 140, 1680, 'Active', 'Auto Renew', 'Bills Reserve  x0001', 'Sample insurer'],
      ['Property Tax [ABC-0001]', 'Property Tax', 'Joint', 'Need', 420, 'Yearly', 'Jan 31', 16.15, 35, 420, 'Active', 'Manual Renew', 'Unknown'],
      [],
      ['HEALTHCARE'],
      ['Expense', 'Subcategory', 'Owner', '50/30/20', 'Amount / Occurrence ($)', 'Frequency', 'Due Date', 'Pay Period ($)', 'Monthly ($)', 'Yearly ($)', 'Status', 'Renewal Method', 'Payment / Account', 'Notes / Source'],
      ['Sam — Primary Care', 'Primary Care', 'Sam', 'Need', 30, 'Quarterly', NA, 4.62, 10, 120, 'Active', 'N/A', 'Rewards Card  x0007'],
      ['Sam — Physical Therapy', 'Therapy', 'Sam', 'Need', '-', 'Monthly', NA, '-', '-', '-', 'Planned', 'N/A', 'Unknown'],
      [],
      ['SUBSCRIPTIONS & ENTERTAINMENT'],
      ['Expense', 'Subcategory', 'Owner', '50/30/20', 'Amount / Occurrence ($)', 'Frequency', 'Due Date', 'Pay Period ($)', 'Monthly ($)', 'Yearly ($)', 'Status', 'Renewal Method', 'Payment / Account', 'Notes / Source'],
      ['Video Streaming', 'Streaming', 'Joint', 'Want', 18, 'Monthly', day(t, 1), 8.31, 18, 216, 'Active', 'Auto Renew', 'Rewards Card  x0007'],
      ['Music Streaming', 'Streaming', 'Joint', 'Want', 12, 'Monthly', day(t, 20), 5.54, 12, 144, 'Active', 'Auto Renew', "Mom's Credit Card x0008", 'Paid by parents.'],
      ['Warehouse Club', 'Membership', 'Joint', 'Want', 60, 'Yearly', `${MON[add(t, 25).getMonth()]} ${add(t, 25).getDate()}`, 2.31, 5, 60, 'Active', 'Auto Renew', 'Shared Spending  x0004', 'Verify upcoming renewal.'],
      ['Game Pass', 'Membership', 'Sam', 'Want', 17, 'Monthly', day(t, 14), 7.85, 17, 204, 'Active', 'Auto Renew', "Mom's Credit Card x0008"],
      [],
      ['MISCELLANEOUS'],
      ['Expense', 'Subcategory', 'Owner', '50/30/20', 'Amount / Occurrence ($)', 'Frequency', 'Due Date', 'Pay Period ($)', 'Monthly ($)', 'Yearly ($)', 'Status', 'Renewal Method', 'Payment / Account', 'Notes / Source'],
      ["Alex's Spending Money", 'Personal Spending', 'Joint', 'Want', 150, 'Bi-weekly', 'TBD', 150, 325, 3900, 'Active', 'Auto Renew', 'Shared Spending  x0004', 'Direct Deposit'],
      [],
      ['CANCELED / HISTORICAL EXPENSES'],
      ['Expense', 'Subcategory', 'Owner', '50/30/20', 'Amount / Occurrence ($)', 'Frequency', 'Due Date', 'Cancel Date', 'Renewal Method', 'Monthly Savings ($)', 'Yearly Savings ($)', 'Payment / Account', 'Notes / Source'],
      ['Groceries / Household Spend', 'Food & Household', 'Joint', 'Need', 500, 'Monthly', 'TBD', '', 'N/A', 500, 6000, '', 'Historical only.'],
    ],
    'Debt & Loans': [
      ['DEBT & LOANS'],
      ['Account', 'Type', 'Balance ($)', 'Payment / Occurrence ($)', 'Frequency', 'Due Date', 'Pay Period ($)', 'Monthly Payment ($)', 'Yearly Payment ($)', 'Status'],
      ['Mortgage', 'Mortgage', 184500, 1355, 'Monthly', '1st', 625.38, 1355, 16260, 'Active'],
      [],
      ['Credit Cards'],
      ['Account', 'Balance ($)', 'APR', 'Credit Limit', 'Frequency', 'Due Date', 'Status'],
      ['Points Card  x0009', '-', 0.2199, 5000, 'Monthly', '9th', 'Paid Off'],
      ['Rewards Card  x0007', '-', 0.2449, 12000, 'Monthly', `${MON[add(t, -9).getMonth()]} ${add(t, -9).getDate()} (statement)`, 'Current $88.10; last statement minimum due $25.00. Payment not confirmed.'],
      ['Store Card  x0010', 1990, '', 3000, 'Monthly', 'TBD', 'Active'],
      ['DEBT SUMMARY', 'Amount'],
      ['Total Debt', 186900],
      ['Monthly Debt Payments', 1356],
      [],
      [`Mortgage snapshot ${MON[add(t, -36).getMonth()]} ${add(t, -36).getDate()} ${add(t, -36).getFullYear()}: sample lender, 4.25% fixed, payment includes escrow. Payment complete for last month.`],
      [],
      ['PHONE DEVICE INSTALLMENTS'],
      ['Account', 'Type', 'Balance ($)', 'Payment / Occurrence ($)', 'Frequency', 'Due Date', 'Pay Period ($)', 'Monthly Payment ($)', 'Yearly Payment ($)', 'Status', 'Notes / Source'],
      ['Sample Phone', 'Device installment', 24, 1, 'Monthly', 'With phone bill', 0.46, 1, 12, 'Active', 'Device principal tracked here.'],
      ['Sample Watch', 'Device installment', 410, 410, 'One-time', 'Await final bill', '-', '-', '-', 'Active', 'Payoff requested; final amount and due date not shown yet.'],
    ],
    Savings: [
      ['SAVINGS & TRANSFERS'],
      ['SAVINGS / INVESTMENTS', 'Type', 'Counts Toward Savings Goal?', 'Amount / Pay Period ($)', 'Monthly ($)', 'Yearly ($)', 'Status', 'Notes'],
      ['401(k)', 'Retirement', 'Yes', 161.54, 350, 4200, 'Active', 'Sample plan; contribution rate not verified.'],
      ['QUALIFYING SAVINGS TOTAL', NA, NA, 161.54, 350, 4200],
      [],
      ['CASH / SAVINGS ACCOUNTS', 'Purpose', 'Current Balance ($)', 'Deposit / Pay Period ($)', 'Type'],
      ['Bills Reserve  x0001', 'Bills reserve', 3100, 900, 'Household'],
      ['Long-Term Savings  x0002', 'Long-term household savings', 12000, 100, 'Household'],
      ['Rainy Day Savings  x0003', 'Personal reserve savings', 2100, '-', 'Household'],
      ['Short-Term Savings  x0006', 'Short-term savings', 6200, 100, 'Household'],
      ["Kid A's Savings  x0011", 'Child savings', 900, '-', 'Child'],
      ["Kid B's Savings  x0012", 'Child savings', 550, '-', 'Child'],
      [],
      ['BALANCE SUMMARY', 'Amount ($)'],
      ['Household Savings', 23400],
      ["Children's Savings", 1450],
      [],
      [`Balances: connected bank last updated ${words(sync)}. Bank-reported balance dates remain unavailable, so sync time is not balance freshness. Children's accounts are separate and the bills reserve is not spending money.`],
      [],
      ["ALEX'S CASH SNAPSHOT", 'Available ($)', 'Source / balance type'],
      ['Everyday Checking x0013', 140.25, 'Available balance'],
      ['Savings x0014', 95.5, 'Available balance'],
      ['Total available cash', 235.75, 'Separate from card debt'],
      [`Received ${words(add(t, -4))}`, '', 'Screenshots; bank date not shown'],
    ],
    'Occasional Costs': [
      ['OCCASIONAL / IRREGULAR COSTS'], [],
      ['Item', 'Category', '50/30/20', 'Rate / Unit ($)', 'Unit', 'Units / Event', 'Events / Year', 'Cost / Event ($)', 'Annual Budget ($)', 'Monthly Reserve ($)', 'Pay Period Reserve ($)', 'Status', 'Due / Typical Timing', 'Notes / Source'],
      ['Dog Boarding', 'Pets & Travel', 'Want', 35, 'day', '', 3, '-', '-', '-', '-', 'Active', 'When traveling', 'Estimated rate; verify.'],
      ['Annual Vet', 'Pet Healthcare', 'Need', '', 'visit', 1, 1, '-', '-', '-', '-', 'Active', 'Annual', 'PLACEHOLDER: enter typical visit cost'],
      ['Car Repairs', 'Vehicle', 'Need', '', 'event', 1, 2, 300, 600, 50, 23.08, 'Active', 'As needed', 'Sample reserve'],
      ['Vacation', 'Travel', 'Want', '', 'trip', 1, '', '-', '-', '-', '-', 'Optional', 'As planned', 'Optional placeholder'],
      [],
      ['ACTIVE OCCASIONAL COST RESERVE', NA, NA, NA, NA, NA, NA, NA, '-', '-', '-'],
      [], [],
      ['UPCOMING ONE-TIME DENTAL COST (ESTIMATE, NOT PAID)'],
      ['Item', 'Category', '', 'Gross quote', 'Insurance est.', 'Patient est.', 'Appointment', 'Payment status', '', '', '', '', '', 'Notes / source'],
      ['Dental crown', 'Dental / Healthcare', '', 1200, 600, 600, iso(add(t, -12)), 'Proposed / unpaid', '', '', '', '', '', `Sample treatment proposal dated ${iso(add(t, -40))}. Insurance amount is estimated, not approved.`],
    ],
    'Net Worth History': [
      ['ESTIMATED NET WORTH'], ['Dates below are record or reconstruction dates. Scopes differ.'], [],
      ['Current estimate: sample.'],
      ['Reference date', 'Cash (USD)', 'Home (USD)', 'Retirement (USD)', 'Mortgage (USD)', 'Other debt (USD)', 'Net worth (USD)', 'Basis and limitations'],
      [words(new Date(y - 5, 10, 8)), 9000, 280000, '', 190000, 2000, 97000, 'Start-date reconstruction from three statements.'],
      [words(new Date(y - 4, 6, 26)), 30000, 300000, '', 230000, 0, 100000, 'Documented financial-plan inventory.'],
      [words(add(t, -22)), 23700, 330000, 24100, 184500, 2400, 190900, 'Estimated snapshot using sheet balances.'],
      [words(report), 24100, 330000, 24100, 184100, 2400, 191700, 'Latest reported cash and cards; estimated home value.'],
    ],
    'Bill Trends': [
      ['BILL TRENDS | FIVE-YEAR VIEW'], ['Actual bill payments only. Blank means no verified payment, not $0.'], [],
      ['MONTHLY PAYMENTS | 12-MONTH MOVING AVERAGES'], [],
      ['Month', 'Electric actual', 'Electric avg 12M', 'Water actual', 'Water avg 12M', 'Internet actual', 'Internet avg 12M', 'Observed total', 'Services recorded'],
      ...Array.from({ length: 14 }, (_, i) => {
        const d = new Date(y, m - 13 + i, 1);
        const label = `${MON[d.getMonth()]} ${d.getFullYear()}`;
        const current = i === 13;
        const electric = current ? NA : 150 + ((i * 37) % 90);
        const water = i === 4 || current ? NA : 95 + ((i * 23) % 40);
        const internet = current ? NA : i < 8 ? 60 : 95;
        return [label, electric, NA, water, NA, internet, NA, NA, 3];
      }),
    ],
    'Water Payments': [
      ['WATER PAYMENT HISTORY'], ['Customer account', '000000', 'Source', 'Sample app'],
      ['Payment date', 'Provider', 'Amount ($)', 'Payment method', 'Account number', 'Verification', 'Notes'],
      [iso(add(t, -40)), 'Sample Water', 118.2, 'Card', '000000', 'App-confirmed', ''],
      [iso(add(t, -9)), 'Sample Water', 121.4, 'Card', '000000', 'App-confirmed', ''],
    ],
    'Layoff Plan': [
      ['Layoff Plan', `As of ${words(add(t, -4))}`],
      ['What to keep and cancel if job coverage ended.'], [],
      ['1. Keep (essentials, monthly)'],
      ['Item', 'Monthly', 'Basis', 'Notes'],
      ['Mortgage', 1355, 'Observed'],
      ['Essentials total', 4700, 'Estimate', 'Household bills plus replacement insurance'],
    ],
  };
}
