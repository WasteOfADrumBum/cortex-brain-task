# Changelog

All notable changes to Cortex. Versions follow [Semantic Versioning](https://semver.org/); Cortex is a web app, so a major version means new tabs or a new kind of access, not a breaking API.

## [Unreleased]

### Added

- **Ops trends**: live deploys per week (12 weeks, with a table view), build success from each project's newest 15 deploys, pull requests merged per project, and whether each live site answers right now and how fast. Every bar has its number written beside it.
- **Ops card previews**: a screenshot of each live site at the top of its card (`/api/preview`, Microlink's free tier, cached a day on Vercel's CDN), with the project logo in the corner; a logo full size when there is no site. Drop `<project>.png` into `assets/projects/` to replace a placeholder. Each card now has **Open site**, **GitHub repo** and **Pull requests** buttons.
- **News summaries and pictures**: each headline has a summary of one paragraph or less and a small square picture on the left, from the feed or, when the feed has none, the article page's own preview tags; a tile with the source's initials stands in when there is no picture.

- **Connections panel** on the Ops tab: which server connections are set up (Todoist and Calendar, GitHub, Google, finance automation), what each one unlocks, and the Vercel variable names still missing. `/api/setup` reports names and true/false only, never values.

### Changed

- **Finances rebuilt to read the sheet honestly** ([docs/finances.md](docs/finances.md)): an overview of take-home, commitments, **unallocated in recorded plan** (renamed from "left over", with what's missing listed) and emergency coverage; a Needs attention panel that links each gap or conflict to its tab and row; paydays (predicted from the dated paystub) and due dates for the next 31 days, with undated items listed; the monthly plan as recorded and with the sheet's own estimates, against 50/30/20 as a reference; savings in separate buckets (bills reserve, emergency, other, children's, retirement) with runway only when it can be worked out; debt with balance types and missing fields; trends from dated records with gaps left empty. Every figure says whether it is recorded, an estimate, confirmed or unknown. Parent-paid bills, the spending allowance, card repayments and payroll 401(k) are no longer double counted or mixed in. Easier to read: plainer font, bigger text, details folded away. Home's Money panel uses the same rules and no longer shows a green tick for an incomplete plan.

- **Finances reads the J&M P&L Google Sheet directly** (`financeSheetId` in `config.js`), in the browser with the existing read-only Google sign-in: each month (take-home, out, left over), bills and debt payments due in the next 14 days, the 50/30/20 split against its targets, bills by section, debt, and savings against the safety net. The paste-the-JSON dialog is gone; numbers never reach the Cortex server. Home's Money panel and the Ops checklist read the same sheet. `/api/finance` and `/api/ingest/finance` are unchanged but no longer used by the pages.

- **Sign-in goes to Google and back in the same tab** instead of a popup. Google's popup could finish without handing the sign-in back, which left Cortex on the sign-in screen with no message. The Google client now needs the site URL (with a trailing slash) under Authorized redirect URIs. Any sign-in failure now says why on the sign-in screen.
- "Not set up yet" messages in Finances and approvals now name only the Google variables that are actually missing and point to the Connections panel.

## [2.0.0] - unreleased

Cortex 2.0 adds the four tabs that were "coming later" in 1.0 (spec phases 3 to 6) and, for the first time, lets Cortex save data and make changes, always on the owner's approval.

### Added

- **Ops project cards** (spec phase 3, [#39](https://github.com/WasteOfADrumBum/cortex-brain-task/pull/39)): a card per project in `config/ops.json` with live deploy state, last deploy, open PRs, failed deploys in 7 days, the last 3 merged PRs and the npm version; shipping totals; merged PRs per week for 12 weeks with a table view; the Home Ops panel.
- **Finances** (spec phase 4, [#40](https://github.com/WasteOfADrumBum/cortex-brain-task/pull/40)): This month and This year views, the paste-in import of the ChatGPT Finances report, the authenticated ingest endpoint (`/api/ingest/finance`) with its schema, account-number guard and rate limit, and the Home Money panel. Months are saved to Drive as `/Cortex/finance/YYYY-MM.json`, keeping the replaced copy as `.prev.json`.
- **News** (spec phase 5, [#41](https://github.com/WasteOfADrumBum/cortex-brain-task/pull/41)): headlines from the free RSS feeds in `config/news-feeds.json`, one section per category with filters, and Home headlines. Enterprise AI and Small Business & SaaS wait for their sources.
- **Assistant** (spec phase 6, [#42](https://github.com/WasteOfADrumBum/cortex-brain-task/pull/42)): the morning briefing from `/Cortex/briefings/` on Home and the new `/briefing` page; Top 3 ranked by the rules in `config/priorities.json`; an approvals inbox that adds, reschedules or completes Todoist tasks and adds or moves Calendar events only when approved, with an allowlist, a stale check, an audit log in `/Cortex/logs/` and a 10-second Undo; the routine prompt in `docs/briefing-routine.md`.
- `/demo/briefing`, and sample data for every new tab.

### Changed

- The `/api` functions compare the dashboard key in constant time ([#38](https://github.com/WasteOfADrumBum/cortex-brain-task/pull/38)).
- CI runs axe on every `/demo` tab at desktop and phone width and fails on page script errors ([#38](https://github.com/WasteOfADrumBum/cortex-brain-task/pull/38), [#39](https://github.com/WasteOfADrumBum/cortex-brain-task/pull/39)); a Checkpoint contract job checks `.engineering/state.json` ([#43](https://github.com/WasteOfADrumBum/cortex-brain-task/pull/43)).
- Home's Top 3 is ranked by rules with a short reason instead of showing the first three critical tasks.

### Access and security

- The browser still asks only for read-only Drive access (`drive.readonly`).
- New, server side and optional until set in Vercel: a Google refresh token with `drive.file` (Cortex sees and changes only files it creates) and `calendar.events` (used only when an approved proposal changes the calendar), and a read-only `GITHUB_TOKEN` for Ops. Without them those features say they are not set up and change nothing.
- Nothing is ever deleted from Todoist, Calendar or Drive.

## [1.0.0] - 2026-11-11

Home, Planner, Vault, the Ops Second Brain checklist and the `/demo` portfolio version. Approved by Joshua Small; see the hub's [Cortex 1.0 closeout](https://github.com/WasteOfADrumBum/one-small-engineering/blob/main/docs/acceptance/cortex-1.0-closeout.md).
