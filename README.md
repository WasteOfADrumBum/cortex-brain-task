# Cortex

A heads-up display for the Second Brain in Google Drive. Plain HTML, CSS and JavaScript with no build step, plus two small Vercel functions for the planner. The dashboard only ever asks for read-only Drive access (`drive.readonly`) and nothing depends on a home PC.

Two views, switched from the top bar: **Dashboard** (`index.html`) and **Planner** (`planner.html`).

## What's on the HUD

- **Brain core**: active files in the Second Brain (retired versions are counted separately), with an orbit of area buttons (Inbox, Notes, Digests, Index, Profile, Retired) that filter the file list. The glowing band shows sweep health.
- **Brain telemetry gauges**: inbox load, files created this week, days since the last weekly digest, and overall brain health.
- **Activity**: files changed per day over the last 30 days.
- **Recent files**: search by name as you type, or press Enter to search inside notes. Open any text note or Google Doc in a reader without leaving Cortex.
- **Clock and date**: big digital clock, date tile and ring clock.
- **Weather**: current conditions, feels-like, humidity, wind, pressure, sunrise and sunset, moon phase and a 3-day forecast from [Open-Meteo](https://open-meteo.com) (free, no key). Change the city on the dashboard.
- **Time elapsed**: how far through the day, week, month and year you are.
- **Schedule**: countdowns to the Monday sweep and Saturday health check.
- **Launch**: one-tap links to Drive, the rules index, Gmail, Calendar, Todoist and your AI tools.
- **Systems**: Drive link status, weather feed, network, and battery where the browser reports it.
- **Preview**: shows the whole HUD with sample data, so you can see it before Drive is linked. Add `?demo=1` to the URL to open in Preview.

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

A website can't read a computer's CPU, RAM, disk or Wi-Fi strength, so those desktop-widget gauges are replaced by the brain telemetry above.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page layout |
| `styles.css` | HUD styling |
| `config.js` | **Your settings**: Google client ID, folder ID, weather location, launchers, schedule |
| `app.js` | Wires everything together |
| `hud.js` | Draws the core, gauges, rings and chart |
| `drive.js` | Read-only Google Drive access |
| `weather.js` | Weather from Open-Meteo |
| `favicon.svg` | Tab icon |
| `planner.html`, `planner.css`, `planner.js` | Planner view |
| `api/tasks.js` | Todoist tasks for the planner (needs `DASH_KEY`) |
| `api/calendar.js` | Google Calendar events from iCal feeds (needs `DASH_KEY`) |
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

Landmarks and headings for every panel, a skip link, visible focus outlines, 44px touch targets, text values next to every gauge, colour never used alone to carry meaning, and animations switched off when the system asks for reduced motion.
