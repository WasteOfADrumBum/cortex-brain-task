// Cortex settings. This is the only file you should need to edit.
window.CORTEX_CONFIG = {
  // Google OAuth "Web application" client ID (ends in .apps.googleusercontent.com).
  // Its Authorized redirect URIs must list the site URL with a trailing slash, e.g. https://cortex.onesmall.company/
  googleClientId: "1026246530998-ohni0qethq13jor9hreup0v81hlmkptr.apps.googleusercontent.com",

  // The "Second Brain" folder in Google Drive.
  brainFolderId: "1IztK9-y6uuh6QQEH3y927MlVjYXeMUgo",

  // The J&M P&L Google Sheet. Finances and Home read it straight from Drive in this browser (read-only), so the
  // numbers never pass through the Cortex server. The id is the long part of the sheet's address.
  financeSheetId: "17PgdaJg41rDKRJqWLj_GyhIPedyaA_OQZftyqnsR_5Y",
  // Tab ids in that sheet, so Finances can link straight to a tab and range. Only used when the Sheets API can't be
  // reached; tab ids don't change when a tab is edited or renamed, only when it is deleted and made again.
  financeSheetTabs: {
    "Summary": 246036219, "Household Dashboard": 1900326001, "Trends Dashboard": 60102004, "Joshua Income": 1340560512,
    "Joshua Paycheck History": 795551172, "Maggie Income": 1244205992, "Maggie Paycheck History": 925825144,
    "Debt & Loans": 1501708750, "Recurring Expenses": 961971027, "Bill Trends": 60102001, "Subscription Trends": 60102002,
    "Income Trends": 60102003, "Occasional Costs": 789313333, "Savings": 493986483, "Duke Energy": 1822032286,
    "Davidson Water": 1221735853, "Dashboard Data": 1900326002, "Estimate Inputs": 1900326003,
    "Net Worth History": 1900326004, "Layoff Plan": 1800660606,
  },

  // Default weather location. You can change it on the dashboard; that choice is saved in this browser.
  weather: {
    name: "Trinity, NC 27370",
    lat: 35.8929,
    lon: -79.9917,
    units: "fahrenheit", // "fahrenheit" or "celsius"
  },

  clock24h: false,

  // Name in the Home greeting ("Good morning, Joshua").
  userName: "Joshua",

  // Home's Now playing panel embeds this Spotify playlist (any open.spotify.com playlist, album or track link).
  // Leave it empty to show a short "add a playlist" note instead.
  spotifyPlaylistUrl: "https://open.spotify.com/playlist/2E6Qyjz9QtsOr0uteaizsl",

  // Quick links on Home. Add, remove or reorder freely.
  launchers: [
    { label: "Second Brain", code: "SB", url: "https://drive.google.com/drive/folders/1IztK9-y6uuh6QQEH3y927MlVjYXeMUgo" },
    { label: "Rules index", code: "00", url: "https://drive.google.com/file/d/1sTsh5KEZq3QoMdt2De56a5t9k8O1xUc9/view" },
    { label: "About me", code: "AM", url: "https://drive.google.com/file/d/1ImALJi6d3dQLt5I8kaULeOXLrCBeBe9S/view" },
    { label: "Gmail", code: "GM", url: "https://mail.google.com/" },
    { label: "Calendar", code: "CA", url: "https://calendar.google.com/" },
    { label: "Todoist", code: "TD", url: "https://app.todoist.com/" },
    { label: "Claude", code: "CL", url: "https://claude.ai/" },
    { label: "ChatGPT", code: "GP", url: "https://chatgpt.com/" },
    { label: "Gemini", code: "GE", url: "https://gemini.google.com/" },
  ],

  // Recurring brain routines. Home's Second Brain panel uses the Claude sweep and the Muse check. day: 0 = Sunday ... 6 = Saturday. time: 24h local time.
  schedule: [
    { label: "Weekly brain sweep", who: "Claude", day: 1, time: "07:47" },
    { label: "Sweep task due", who: "Todoist", day: 1, time: "09:00" },
    { label: "Sweep health check", who: "Muse", day: 6, time: "13:00" },
  ],

  // How Cortex recognises special notes by file name (case-insensitive).
  patterns: {
    index: "^00-index",
    profile: "about-me",
    digest: "digest",
    retired: "-retired",
  },

  // A sweep counts as "ran this week" for this many days after the newest digest note.
  sweepIntervalDays: 7,

  // Ops checklist: Todoist tasks (labeled @system) that each automation completes when it runs.
  // The checklist shows the newest completion in the last 7 days, or a warning when there is none.
  healthChecks: [
    { name: "Brain sweep", task: "Brain sweep ran" },
    { name: "Muse check", task: "Muse check ran" },
  ],

  // Ops checklist: the brain inbox is healthy while fewer than this many notes are waiting.
  inboxLimit: 7,
};
