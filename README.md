# Cortex

A heads-up display for the Second Brain in Google Drive. Plain HTML, CSS and JavaScript with no build step, so it runs on any static host (Vercel here). It only ever asks for read-only Drive access (`drive.readonly`) and nothing depends on a home PC.

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

## Setup

1. **Host it.** In Vercel, connect the `cortex-brain` project to this repository (Settings → Git). No build command or output directory is needed.
2. **Create a Google OAuth client** at console.cloud.google.com:
   1. Create a project, then enable the **Google Drive API**.
   2. Under Google Auth Platform, set up the consent screen (External), add yourself as a test user, and add the `.../auth/drive.readonly` scope.
   3. Create a **Web application** client. Under Authorized JavaScript origins add the site URL exactly, with no trailing slash (for example `https://cortex-brain-task-forge3.vercel.app`).
3. **Paste the Client ID** (ends in `.apps.googleusercontent.com`) into `googleClientId` in `config.js`. The client secret is not used.
4. Open the site and press **Link Drive**.

## Accessibility

Landmarks and headings for every panel, a skip link, visible focus outlines, 44px touch targets, text values next to every gauge, colour never used alone to carry meaning, and animations switched off when the system asks for reduced motion.
