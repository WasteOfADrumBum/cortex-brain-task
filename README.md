# Cortex

A personal command center for the Second Brain in Google Drive. Plain HTML, CSS and JavaScript with no build step, plus small Vercel functions. The browser only ever asks for read-only Drive access (`drive.readonly`) and nothing depends on a home PC. The server can save Cortex's own files to Drive (`drive.file`) and change Todoist or Calendar, but only for a proposal the owner approves. This is Cortex 2.0; what changed is in [CHANGELOG.md](CHANGELOG.md), what comes next in [ROADMAP.md](ROADMAP.md), and the full build plan in [docs/cortex-v2-spec.md](docs/cortex-v2-spec.md).

## Tabs

Six tabs in the shared top bar, one clean URL each (`vercel.json` turns on `cleanUrls`), so every tab is linkable and the back button works. On screens narrower than 1100px the tabs fold into the menu button.

| Tab | Route | What it does today |
| --- | --- | --- |
| Home | `/` | Today strip (date, time, weather with today's high and low), today's schedule with the largest open block, Top 3 priorities ranked by rules with a short why, the morning briefing with the first two approvals, Second Brain summary, links to every tab and your quick links |
| Planner | `/planner` | Tasks, today, this week and this month (see below) |
| Finances | `/finances` | This month (in, out, net, bills by due date with overdue called out in words, money in), this year (one row per month, expandable), when the numbers were last saved, and **Update finances**: paste the JSON from the ChatGPT Finances report, check it, then save it to Drive |
| News | `/news` | Headlines from the free RSS feeds in `config/news-feeds.json`, one section per category, with a filter bar (All, Work, Life, each category). Broken feeds are skipped and named. Home shows the newest 3 Work headlines |
| Vault | `/vault` | Every note with its title and one-line summary (frontmatter `name` and `description`), type tag, filters, search and an in-app reader |
| Briefing | `/briefing` | Not a tab; linked from Home. Today's briefing in full (summary, needs attention, email) from `/Cortex/briefings/YYYY-MM-DD.md` in Drive, and every proposal from it as a card with **Approve** and **Reject**. Reschedules and moves get a 10-second **Undo**. Actions Cortex doesn't run are shown read-only as "Not supported" |
| Ops | `/ops` | A card per project in `config/ops.json` (live deploy state, last deploy, open PRs, failed deploys in 7 days, last 3 merged PRs, npm version), shipping totals, merged PRs per week for 12 weeks (with a table view), then the Second Brain checklist (sweep and Muse check from Todoist), notes changed over 30 days and Drive storage |

Every Home panel has a plain heading and ends with a link to the place that has the detail. Each source fails on its own: a broken weather or calendar feed shows a message in its own panel.

**Signed out**, Home, Finances, News, Vault and Ops show only a sign-in screen: no panels and no sample data. The Planner keeps its own dashboard key and shows nothing until the key and its routes work.

## Demo (`/demo`)

`/demo` is the portfolio version: every tab (`/demo`, `/demo/planner`, `/demo/finances`, `/demo/news`, `/demo/vault`, `/demo/ops`, plus `/demo/briefing`) runs the real pages with made-up sample data, so the layouts are the same as the real app on desktop and phone.

- A banner on every demo page says "Demo with sample data. Nothing here is real."
- Anything that would change data (Link Drive, weather location, Edit quick links, the music player) shows a "Demo only" message instead. Mark new write controls with `data-write="<what it does>"` and the demo handles them.
- The demo never calls Drive, Todoist, Google Calendar or the weather service, and replaces your name, quick links, routines, weather place and playlist from `config.js`.
- `vercel.json` rewrites the demo routes to the real pages and sends `X-Robots-Tag: noindex`. There is no sitemap. The old `/?demo=1` link redirects to `/demo`.
- Sample data lives in `src/demo/`. It uses the same TypeScript types as the real data (`src/types.d.ts`); `npm test` type-checks the demo data and the `/api` routes against them, so the two can't drift apart. 

## Planner (At a glance)

One screen with your Todoist tasks, today hour by hour (6 AM to 10 PM) with open time blocks, the week Sunday to Saturday on the same hours, and the month with event titles only.

- **Critical this week**: overdue, or P1/P2 due within 7 days
- **Quick pickups**: label `@quick` (under 45 minutes)
- **Big tasks**: label `@deep` (45 minutes or more)
- **Everything else**: collapsed list, so nothing disappears; tasks with no size label are marked "Needs size"

Tasks labeled `@system` (automated, like "Brain sweep ran") are left out of every bucket, count and Home. Label names live in `config/topics.json` (size labels and topic labels); `task-rules.js` holds the shared rules Home and the Planner both use. A label in the config that doesn't exist in Todoist is ignored. Home's Top 3 shows each task's topics as text chips, and tasks with a private topic (`@health`, `@money`) show only as "Health task" or "Money task" there; full titles stay in the Planner. Until the API is set up, the planner says what is missing and shows no tasks; sample data is only on `/demo/planner`.

Set these in Vercel (Project → Settings → Environment Variables); `.env.example` explains each one:

- `TODOIST_TOKEN`: Todoist → Settings → Integrations → Developer → API token
- `GCAL_ICS_URLS`: each Google Calendar's "Secret address in iCal format", comma-separated. Anyone with one of these URLs can read that calendar.
- `DASH_KEY`: any long random string. The planner asks for it once per device and remembers it there.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (for Finances and approvals): an OAuth "Web application" client and a refresh token with two scopes: `drive.file`, so Cortex can see and change only the files it creates, and `calendar.events`, used only when you approve a Calendar proposal. Enable the **Google Calendar API** in the same Google Cloud project. Make the token once, either with `node scripts/get-refresh-token.mjs` on your computer (add `http://localhost:53682` as a redirect URI), or in the [OAuth Playground](https://developers.google.com/oauthplayground) with "Use your own OAuth credentials" ticked and the scopes `https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events` (add `https://developers.google.com/oauthplayground` as a redirect URI). A token made earlier with only `drive.file` still saves finances, but approving a Calendar proposal answers 403 until you make a new one.
- `CORTEX_INGEST_TOKEN` (optional, for automation): a long random string for `/api/ingest/finance`. The paste import doesn't need it.
- `GITHUB_TOKEN` (for Ops): a fine-grained, read-only GitHub token limited to the repos in `config/ops.json`, with Metadata, Contents, Deployments and Pull requests set to read. Without it GitHub allows 60 calls an hour, which Ops can use up.

Google's iCal feed can lag your live calendar by minutes to a few hours.

### Assistant: briefing, Top 3 and approvals

- **Briefing.** A Claude routine writes `/Cortex/briefings/YYYY-MM-DD.md` each weekday morning; the prompt and file format are in [`docs/briefing-routine.md`](docs/briefing-routine.md). Cortex reads it in the browser with the read-only Drive link (the routine's files aren't Cortex-created, so the server token can't read them). Gmail stays inside the routine; Cortex never gets Gmail access.
- **Top 3.** Every open task gets a score from the rules in `config/priorities.json` (overdue, due today, P1 or P2, fits today's largest open block, a quick pickup when there's no big block, untouched over 14 days); Home shows the top 3 with the strongest rule as the why. Tasks without a Todoist duration use the estimate for their `@quick` or `@deep` label.
- **Approvals.** v1 runs five actions: add, reschedule or complete a Todoist task, and add or move a Calendar event. Nothing is ever deleted. On **Approve**, `/api/approvals` checks the proposal against that list again, re-reads the task or event and refuses with "Stale, review again" if it changed since the briefing was written, then makes the change with the server-side tokens. Every decision is stored in `/Cortex/approvals/state.json` (so a card never comes back) and logged in `/Cortex/logs/audit-YYYY-MM.jsonl` (time, proposal id, action, target id, result; no titles or reasons). Recurring Todoist tasks and all-day events are left for you to change yourself.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `home.js` | Home tab |
| `vault.html`, `vault.js` | Vault tab |
| `ops.html`, `ops.js` | Ops tab |
| `finances.html`, `finances.js` | Finances tab (paste import uses `src/finance-lib.js`, the same rules as the save routes) |
| `news.html`, `news.js` | News tab |
| `briefing.html`, `briefing.js`, `home-assistant.js`, `assistant-ui.js` | Briefing page and Home's briefing panel: reading the briefing, approval cards, Undo (rules in `src/briefing-lib.js`, `src/approvals-lib.js`) |
| `config/priorities.json`, `src/priorities-lib.js` | Home's Top 3 rules and weights |
| `planner.html`, `planner.css`, `planner.js` | Planner tab |
| `header.js` | Shared top bar and tab menu |
| `brain.js` | Shared sign-in screen, Drive link, note types, titles and summaries |
| `src/demo/` | `/demo`: `mode.js` (banner, "Demo only" message, demo links and profile) and the sample data |
| `src/types.d.ts`, `tsconfig.json`, `test/` | Shared data types and the checks `npm test` runs (no build step) |
| `styles.css` | Styling for every tab |
| `config/topics.json` | Todoist size and topic labels, and which topics are private on Home |
| `task-rules.js` | Shared task rules: labels, Critical, Planner buckets, Home title privacy |
| `config.js` | **Your settings**: Google client ID, folder ID, weather location, quick links, routines |
| `hud.js` | Ring clock and bar chart |
| `drive.js` | Read-only Google Drive access |
| `weather.js` | Weather from Open-Meteo |
| `api/tasks.js` | Todoist tasks, labels, projects and sections for the Planner and Home (needs `DASH_KEY`) |
| `api/ops.js` | Ops project cards, totals and 12-week chart from GitHub (production deployments Vercel reports, pull requests) and npm; cached 5 minutes (needs `DASH_KEY`; `GITHUB_TOKEN` recommended) |
| `api/news.js` | News headlines from `config/news-feeds.json` (RSS and Atom parsed by `src/news-lib.js`), cached 30 minutes (needs `DASH_KEY`). `npm run check:feeds` lists which feeds work; CI runs it for information only |
| `api/finance.js` | Finances: GET a year of saved months, POST a pasted month (needs `DASH_KEY` and the Drive variables) |
| `api/ingest/finance.js` | Finance ingest for automation: POST one month with `Authorization: Bearer <CORTEX_INGEST_TOKEN>`; 422 names a bad field, 20 calls an hour |
| `api/_drive.js`, `api/_finance-store.js` | Drive access with the `drive.file` scope; months saved as `/Cortex/finance/YYYY-MM.json` with the replaced copy as `.prev.json`, and a counts-only log in `/Cortex/logs/` |
| `api/approvals.js` | Approvals: GET which proposals were decided, POST approve, reject or undo (needs `DASH_KEY`, `TODOIST_TOKEN` and the Google variables). The decision logic is `api/_approvals-run.js`; Todoist and Calendar calls are `api/_todoist.js` and `api/_gcal.js`; state and audit log are `api/_approvals-store.js` |
| `api/checks.js` | Ops checklist health checks: the newest completion of "Brain sweep ran" and "Muse check ran" in the last 7 days, from Todoist's activity log (needs `DASH_KEY`) |
| `api/calendar.js` | Google Calendar events from iCal feeds (needs `DASH_KEY`); also used by Home's schedule |
| `vercel.json` | Clean URLs for the tabs, `/demo` routes and their noindex header |
| `.env.example` | The three planner settings to set in Vercel |

## Setup

1. **Host it.** In Vercel, connect the `cortex-brain` project to this repository (Settings → Git). No build command or output directory is needed; Vercel installs `ical-expander` for the calendar function from `package.json`.
2. **Create a Google OAuth client** at console.cloud.google.com:
   1. Create a project, then enable the **Google Drive API**.
   2. Under Google Auth Platform, set up the consent screen (External), add yourself as a test user, and add the `.../auth/drive.readonly` scope.
   3. Create a **Web application** client. Under Authorized JavaScript origins add the site URL exactly, with no trailing slash (for example `https://cortex-brain-task-forge3.vercel.app`).
3. **Paste the Client ID** (ends in `.apps.googleusercontent.com`) into `googleClientId` in `config.js`. The client secret is not used.
4. Open the site and press **Link Drive**.

## Accessibility

Aiming for WCAG 2.2 AA: one `h1` per tab, landmarks and headings for every panel, a skip link, visible focus outlines, 44px touch targets, status shown with words and icons rather than colour alone, a table view for the activity chart, and animations switched off when the system asks for reduced motion.
