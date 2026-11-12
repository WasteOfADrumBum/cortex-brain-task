# Cortex roadmap

Cortex 1.0 is what is live today: Home, Planner, Vault, the Ops Second Brain checklist and the `/demo` portfolio version. Everything below is planned, not promised, and none of it reopens 1.0. The detailed plan, with acceptance criteria for each item, is in [docs/cortex-v2-spec.md](docs/cortex-v2-spec.md) under "Build phases".

Done in 1.0: spec phases 1 (tabs, routes and cleanup) and 2 (demo mode), plus the Vault list, reader and search from phase 5.

Done since 1.0: spec phase 3, the Ops project cards (see below).

## Next

1. Done 2026-11-12: **Ops project cards** (spec phase 3): `config/ops.json`, `/api/ops`, a card per project with health, last deploy and the last 3 PRs, a totals strip, a 12-week shipping chart and the Home Ops panel. Health comes from the production deployments Vercel reports to GitHub, so no Vercel token is needed. Live data needs `GITHUB_TOKEN` in Vercel (read-only).
2. **Finances** (spec phase 4): the This month and Year views, paste-in import of the ChatGPT Finances JSON saved to Drive, the authenticated ingest endpoint with its schema, account-number guard and rate limit, and the Home Money panel.
3. **News** (spec phase 5): an RSS route, the News tab by category and the Home Headlines panel.
4. **Assistant** (spec phase 6): the daily Claude briefing written to Drive, rule-based Top 3, an approvals inbox for Todoist and Calendar with an allowlist, audit log and undo.

## Open questions for Joshua (needed before the matching item)

- Can the ChatGPT Finances task email its results, so a Claude routine can pick up the JSON? (Finances)
- One-line meanings of digest, profile and retired notes for the Vault legend. (Vault)
- News sources for Enterprise AI and Small Business & SaaS. (News)
- Briefing time and days; weekdays at 6:30 AM is the assumption. (Assistant)
- How Muse's check shows up. Recorded in Joshua's notes as a "Muse check ran" Todoist task, which the Ops checklist already reads; confirm and close.

## Hardening worth doing

- Done 2026-11-11: the `/api` functions compare the dashboard key in constant time (`api/_key.js`).
- Done 2026-11-11: CI runs axe on every `/demo` tab at desktop and phone width (`npm run check:a11y`).
