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

**Preview** shows Home, Vault and Ops with sample data before Drive is linked, and stays on while you move between tabs. `/?demo=1` opens in Preview.

## Planner (At a glance)

One screen with your Todoist tasks, today hour by hour (6 AM to 10 PM) with open time blocks, the week Sunday to Saturday on the same hours, and the month with event titles only.

- **Critical this week**: overdue, or P1/P2 due within 7 days
- **Quick pickups**: Todoist duration 30 min or less, or label `quick`
- **Big tasks**: duration 60 min or more, or label `deep`
- **Everything else**: collapsed list, so nothing disappears

Set a Todoist **duration** on every task (or ask your AI tools to) so the quick/big split is automatic. Until the API is set up, the planner shows sample data.

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
| `brain.js` | Shared Drive link, Preview, note types, titles and summaries |
| `styles.css` | Styling for every tab |
| `config.js` | **Your settings**: Google client ID, folder ID, weather location, quick links, routines |
| `hud.js` | Ring clock and bar chart |
| `drive.js` | Read-only Google Drive access |
| `weather.js` | Weather from Open-Meteo |
| `api/tasks.js` | Todoist tasks for the planner (needs `DASH_KEY`) |
| `api/calendar.js` | Google Calendar events from iCal feeds (needs `DASH_KEY`); also used by Home's schedule |
| `vercel.json` | Clean URLs for the tabs |
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
