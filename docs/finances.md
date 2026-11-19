# Finances: how each number is worked out

The Finances tab reads the J&M P&L Google Sheet in the browser (read-only Drive sign-in, exported as .xlsx) and never
sends the numbers to the Cortex server. `src/finance-sheet.js` reads the tabs; `src/finance-model.js` holds every money
rule; `finances.js` only draws. This page is the map from each figure to its source. It contains no amounts.

## Ground rules

- **Plan versus actual.** The sheet is a budget. Actual figures appear only where Dashboard Data records a complete
  month (take-home, needs, wants and savings for one month). Until then the "Actual" row says unavailable.
- **Status on every figure.** Recorded plan, Estimate, Confirmed, Unknown or Conflict, as a word and a shape.
- **Unknown is not zero.** A blank or "-" amount is unknown and listed as missing. A confirmed zero must be typed as 0.
- **Dates.** A Drive edit time or bank sync time is never shown as a balance date. "Note mentions" dates come from
  the note text (latest date not in the future) and are labelled as such. Estimate Inputs' report date is labelled
  "report date, not a bank balance date".
- **Transfers.** Money moved between owned accounts is not spending. The spending allowance counts once, as wants;
  bills paid from the allowance account are inside it and not counted again.
- **Cards.** Purchases are counted where they're bought; card minimums are required debt. A full card repayment is
  never added on top of the purchases it pays for.
- **Parent-paid bills** (payment account names a parent, or the note says paid by parents) are shown but not counted
  in household commitments.
- **Payroll 401(k)** is shown on its own; it comes out before take-home pay, so it is not in the take-home savings rate.
- **Emergency cash** excludes the bills reserve, children's savings and retirement.
- **Precision.** Calculations keep full precision; only the page rounds.

## Figures

| Figure | Source (tab) | How | Limits |
|---|---|---|---|
| Take-home a month | Joshua Income, rows with "Include in Baseline? Yes" | Net monthly (annual ÷ 12) | Planning estimate; bonuses and partner scenarios excluded and listed |
| Monthly commitments | Recurring Expenses (active rows), Debt & Loans (recurring payments), Occasional Costs (reserves with amounts) | Monthly column, or amount × times a year ÷ 12 | Leaves out parent-paid and inside-allowance bills; blank reserves are unknown |
| Sheet estimates added | Estimate Inputs: central groceries monthly, fuel monthly estimate, estimated additional debt payments | Added only when the plan has nothing for them; a Dashboard Data override replaces the card estimate | Estimates, not measured spending |
| Unallocated in recorded plan | The above | Take-home − needs and required debt − wants − take-home savings | Renamed "Unallocated" only when nothing is missing. Never "safe to spend": there is no dated cash balance or unpaid-bills list |
| Savings from take-home | Joshua Income routing rows marked "Counts as Savings? Yes" | Monthly equivalents | Payroll 401(k) separate (Savings tab) |
| Emergency coverage | Dashboard Data overrides first; else Estimate Inputs: savings available in base scenario, estimated essential costs, job-loss essential cost estimate, bills reserve balance | Cash ÷ essentials; job-loss case uses job-loss essentials (with replacement insurance) | Confirmed only with designated cash, confirmed essentials and an as-of date |
| Savings buckets | Savings tab accounts (purpose and type), Dashboard Data designated emergency cash, Estimate Inputs verified retirement statement and date | Grouped by purpose | Bank balance dates aren't recorded |
| Debt | Debt & Loans; mortgage APR and principal estimate from Estimate Inputs | As recorded | No payoff forecasts while minimums and APRs are missing |
| Timeline | Due dates in Recurring Expenses and Debt & Loans; paydays from the dated paystub on Joshua Paycheck History, every pay period | Next 31 days | Due dates and predictions, not payments; the sheet doesn't record paid status |
| Dated prices | A bill's note, strict form only: `Nov-Dec 2026 $95.00; Jan-Dec 2027 $60.00` | The covering period's price applies in that month; overlapping different prices are a conflict | Anything looser is ignored |
| Trends | Bill Trends monthly actuals, salary rate history, Net Worth History records | Blank months are gaps, not zeros; the current month is partial | Net worth records are separate points with different scopes |
| Needs attention | All of the above | Missing amounts or dates, conflicting sources, undated balances, unresolved one-time costs, missing debt payments, price changes and renewals, open questions on Estimate Inputs | Each item links to its tab and row |

Tab links use the Sheets API for tab ids when it is enabled for the Google project, and `financeSheetTabs` in
`config.js` otherwise. Tab names are in `TAB_NAMES` in `src/finance-sheet.js`.
