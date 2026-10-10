// Cortex settings. This is the only file you should need to edit.
window.CORTEX_CONFIG = {
  // Google OAuth "Web application" client ID (ends in .apps.googleusercontent.com).
  // Its Authorized JavaScript origin must be the exact site URL, e.g. https://cortex-brain-task-forge3.vercel.app
  googleClientId: "",

  // The "Second Brain" folder in Google Drive.
  brainFolderId: "1IztK9-y6uuh6QQEH3y927MlVjYXeMUgo",

  // Default weather location. You can change it on the dashboard; that choice is saved in this browser.
  weather: {
    name: "New York, NY",
    lat: 40.7128,
    lon: -74.006,
    units: "fahrenheit", // "fahrenheit" or "celsius"
  },

  clock24h: false,

  // Launcher panel. Add, remove or reorder freely.
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

  // Recurring brain routines shown in the Schedule panel. day: 0 = Sunday ... 6 = Saturday. time: 24h local time.
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

  // A sweep is "fresh" for this many days, then the health gauge starts dropping.
  sweepIntervalDays: 7,
};
