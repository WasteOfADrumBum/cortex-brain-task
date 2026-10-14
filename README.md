# Cortex

A personal command center for the Second Brain in Google Drive. Plain HTML, CSS and JavaScript with no build step, plus small Vercel functions for the planner. The browser only ever asks for read-only Drive access (`drive.readonly`) and nothing depends on a home PC. The plan for version 2 is in [docs/cortex-v2-spec.md](docs/cortex-v2-spec.md).

## Tabs

Six tabs in the shared top bar, one clean URL each (`vercel.json` turns on `cleanUrls`), so every tab is linkable and the back button works. On screens narrower than 1100px the tabs fold into the menu button.

| Tab | Route | What it does today |
| --- | --- | --- |
| Home | `/` | Today strip (date, time, weather with today's high and low), today's schedule with the largest open block, Second Brain summary, links to every tab and your quick links |
| Planner | `/planner` | Tasks, today, this week and this month (see below) |
| Finances | `/finances` | Placeholder until phase 4 |
| News | `/news` | Placeholder until phase 5 |
| Vault | `/vault` | Every note with its title and one-line summary (frontmatter `name` and `description`), type tag, filters, search and an in-app reader |
| Ops | `/ops` | Second Brain checklist, notes changed over 30 days (with a table view), Drive storage. Project cards arrive in phase 3 |

Every Home panel has a plain heading and ends with a link to the place that has the detail. Each source fails on its own: a broken weather or calendar feed shows a message in its own panel.

**Signed out**, Home, Finances, News, Vault and Ops show only a sign-in screen: no panels and no sample data. The Planner keeps its own dashboard key and shows nothing until the key and its routes work.

## Demo (`/demo`)

`/demo` is the portfolio version: every tab (`/demo`, `/demo/planner`, `/demo/finances`, `/demo/news`, `/demo/vault`, `/demo/ops`) runs the real pages with made-up sample data, so the layouts are the same as the real app on desktop and phone.

- A banner on every demo page says "Demo with sample data. Nothing here is real."
- Anything that would change data (Link Drive, weather location, Edit quick links, the music player) shows a "Demo only" message instead. Mark new write controls with `data-write="<what it does>"` and the demo handles them.
- The demo never calls Drive, Todoist, Google Calendar or the weather service, and replaces your name, quick links, routines, weather place and playlist from `config.js`.
- `vercel.json` rewrites the demo routes to the real pages and sends `X-Robots-Tag: noindex`. There is no sitemap. The old `/?demo=1` link redirects to `/demo`.
- Sample data lives in `src/demo/`. It uses the same TypeScript types as the real data (`src/types.d.ts`); `npm test` type-checks the demo data and the `/api` routes against them, so the two can't drift apart. Finances and News sample data is ready for phases 4 and 5.

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

Google's iCal feed can lag your live calendar by minutes to a few hours.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `home.js` | Home tab |
| `vault.html`, `vault.js` | Vault tab |
| `ops.html`, `ops.js` | Ops tab |
| `finances.html`, `news.html`, `tab.js` | Placeholder tabs |
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
