# Changelog

All notable changes to Cortex. Versions follow [Semantic Versioning](https://semver.org/); Cortex is a web app, so a major version means new tabs or a new kind of access, not a breaking API.

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
