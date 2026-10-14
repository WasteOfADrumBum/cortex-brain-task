// Shared data shapes for Cortex. Real data (the /api routes, Drive, Open-Meteo) and the /demo sample data in
// src/demo/ are both checked against these types (`npm test` runs tsc over them), so the two can't drift apart.
// Plain JavaScript files use them through JSDoc, e.g. /** @type {import("../types").Task} */. No build step.

// ---------- Planner and Home: Todoist (GET /api/tasks) ----------
export interface Task {
  id: string;
  content: string;
  /** 4 = P1 ... 1 = P4 (Todoist's numbering). */
  priority: 1 | 2 | 3 | 4;
  /** "YYYY-MM-DD" for a date, an ISO date-time for a time, or null for no date. */
  due: string | null;
  /** Minutes, or null when the task has no duration. */
  duration: number | null;
  /** Label names without the @. Size and topic labels are listed in config/topics.json. */
  labels: string[];
  projectId: string | null;
  sectionId: string | null;
  url: string;
}
export interface TodoistProject { id: string; name: string }
export interface TodoistSection { id: string; name: string; projectId: string }
export interface TasksResponse {
  tasks: Task[];
  /** null when Todoist couldn't list them (a warning says why). */
  labels: string[] | null;
  projects: TodoistProject[] | null;
  sections: TodoistSection[] | null;
  warnings: string[];
}

// ---------- Ops checklist: health-check tasks (GET /api/checks) ----------
export interface TodoistCheck {
  /** The task title asked for, e.g. "Muse check ran". */
  title: string;
  /** ISO date-time of the newest completion in the window, or null when none. */
  completedAt: string | null;
  /** The task's description at that completion ("" when it has none). */
  description: string;
}
export interface ChecksResponse {
  /** Start of the 7-day window. */
  since: string;
  checks: TodoistCheck[];
}

// ---------- Planner and Home: Google Calendar (GET /api/calendar) ----------
export interface CalendarEvent {
  title: string;
  allDay: boolean;
  /** "YYYY-MM-DD" when allDay, otherwise an ISO date-time. */
  start: string;
  end: string;
  /** Which feed it came from (0-based position in GCAL_ICS_URLS). */
  calendar?: number;
}
export interface CalendarResponse {
  events: CalendarEvent[];
  /** 1-based feed numbers that were skipped. */
  failed: number[];
  errors: string[];
}

// ---------- Home, Vault and Ops: Second Brain notes in Drive ----------
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink: string;
  /** Folder path below the brain root ("" for the root, "inbox", "notes"). */
  folder: string;
  parents?: string[];
  /** Demo only: the note's text, which the real app reads from Drive on demand. */
  body?: string;
}
export interface DriveStorage {
  used: number;
  /** null when the account has no limit. */
  limit: number | null;
  trash: number;
}

// ---------- Home: weather (Open-Meteo forecast, the fields Cortex asks for) ----------
export interface WeatherLocation { name: string; lat: number; lon: number; /** Town found for "My location" */ place?: string }
export interface WeatherData {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    surface_pressure: number;
  };
  daily: {
    /** "YYYY-MM-DD", five days starting today. */
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
    precipitation_probability_max: number[];
  };
}
export interface WeatherResult { data: WeatherData; units: "fahrenheit" | "celsius" }

// ---------- Finances (phase 4): Drive finance/YYYY-MM.json ----------
export interface FinanceItem {
  name: string;
  amount: number;
  /** "YYYY-MM-DD". */
  due?: string;
  paid?: boolean;
}
export interface FinanceMonth {
  /** "YYYY-MM". */
  month: string;
  currency: string;
  income: FinanceItem[];
  bills: FinanceItem[];
  updatedAt: string;
  source: string;
}

// ---------- News (phase 5): RSS headlines ----------
export interface NewsItem {
  title: string;
  url: string;
  source: string;
  category: string;
  group: "Work" | "Life";
  publishedAt: string;
}

// ---------- Config values the demo replaces (config.js) ----------
export interface Launcher { label: string; code?: string; url: string }
export interface Routine { label: string; who: string; day: number; time: string }
export interface DemoProfile {
  userName: string;
  spotifyPlaylistUrl: string;
  weather: WeatherLocation & { units: "fahrenheit" | "celsius" };
  launchers: Launcher[];
  schedule: Routine[];
}
/** What the demo shows in Home's Now playing panel instead of a real Spotify embed. */
export interface DemoTrack { title: string; artist: string; length: string }

// ---------- Everything src/demo/index.js exports ----------
export interface DemoData {
  notes(now: Date): DriveFile[];
  storage: DriveStorage;
  tasks(today: Date): TasksResponse;
  checks(now: Date, titles: string[]): ChecksResponse;
  calendar(from: Date, to: Date): CalendarResponse;
  weather(today: Date): WeatherResult;
  finances(today: Date): FinanceMonth;
  news(now: Date): NewsItem[];
  playlist: DemoTrack[];
}
