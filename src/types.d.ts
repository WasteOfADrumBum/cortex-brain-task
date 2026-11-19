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
  /** When the task last changed (ISO), for the "untouched" priority rule. Missing in older responses. */
  updatedAt?: string | null;
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

// ---------- Ops (phase 3): GET /api/ops ----------
/** Production deploy state, shown as a word and an icon, never colour alone. */
export type DeployState = "healthy" | "building" | "failed" | "unknown";
export interface OpsPr {
  title: string;
  mergedAt: string;
  /** First line of the PR description ("" when it has none). */
  summary: string;
  url: string;
}
export interface OpsDeploy {
  state: DeployState;
  /** ISO date-time of the newest status. */
  at: string | null;
  /** First line of the deployed commit's message. */
  message: string;
  url: string | null;
}
export interface OpsProject {
  name: string;
  /** "owner/name" on GitHub. */
  repo: string;
  /** The live site, or null when the project has none. */
  url: string | null;
  /** null when the repo has no production deploys. */
  deploy: OpsDeploy | null;
  /** Newest first, at most 3. */
  mergedPrs: OpsPr[];
  openPrs: number | null;
  failedLast7Days: number | null;
  /** Present when the project ships an npm package; version is null when the registry can't be read. */
  npm: { name: string; version: string | null } | null;
  /** Why the card has no GitHub data. */
  error?: string;
  /** Logo file name in /assets/projects, without the extension. */
  slug: string;
  /** The newest production deploys (at most 15, last 12 weeks) that finished, and how many failed. */
  builds: { total: number; failed: number } | null;
  /** The live site answered right now: up (status under 400), status code and time to answer in ms. */
  check: { up: boolean; status: number | null; ms: number | null } | null;
}
export interface OpsWeek {
  /** Monday of the week, "YYYY-MM-DD" (UTC). */
  start: string;
  /** Merged PRs that week per project name. */
  counts: Record<string, number>;
}
export interface OpsTotals {
  /** Since Monday (UTC). */
  mergedWeek: number;
  /** Since the 1st of this month (UTC). */
  mergedMonth: number;
  /** Production deploys since Monday. */
  deploysWeek: number;
  /** Failed production deploys in the last 7 days; null when a project couldn't be read. */
  failedWeek: number | null;
}
export interface OpsResponse {
  generatedAt: string;
  projects: OpsProject[];
  totals: OpsTotals;
  /** The last 12 weeks, oldest first. */
  weeks: OpsWeek[];
  /** Production deploys per week over the same 12 weeks, per project name. */
  deployWeeks: OpsWeek[];
  warnings: string[];
}

// ---------- Finances (phase 4): Drive /Cortex/finance/YYYY-MM.json, saved by /api/finance and /api/ingest/finance ----------
/** One month as the ChatGPT Finances report outputs it (docs/cortex-v2-spec.md). Checked by src/finance-lib.js. */
export interface FinanceIncome { name: string; amount: number; /** "YYYY-MM-DD" */ date: string }
export interface FinanceBill { name: string; amount: number; /** "YYYY-MM-DD" */ due: string; paid: boolean; category?: string }
export interface FinanceCoverage {
  /** Nickname plus last 4 digits at most, e.g. "Checking ...4417". */
  account: string;
  status: "complete" | "delayed" | "unavailable";
}
export interface FinanceMonth {
  /** "YYYY-MM". */
  month: string;
  periodStart: string;
  periodEnd: string;
  source: string;
  generatedAt: string;
  totals: { in: number; out: number };
  coverage: FinanceCoverage[];
  income: FinanceIncome[];
  bills: FinanceBill[];
  notes?: string;
}
/** A saved month as /api/finance returns it: the month plus when Cortex saved it. */
export interface SavedFinanceMonth extends FinanceMonth { savedAt: string }
/** GET /api/finance?year=YYYY: every saved month of the year, oldest first. */
export interface FinanceYear { year: number; months: SavedFinanceMonth[] }

// ---------- Finances from the J&M P&L Google Sheet (read in the browser; src/finance-sheet.js, src/finance-model.js) ----------
/** Where a value lives in the workbook, for links: tab name and A1 range. */
export interface SheetRef { tab: string; range: string }
export interface SheetNote { text: string; /** Latest full date written in the note, "YYYY-MM-DD". Not a balance date. */ date: string | null; ref: SheetRef }
export interface SheetAmountRow { label: string; amount: number | null; /** The unlabelled total row. */ total: boolean; ref?: SheetRef }
export interface SheetSnapshotRow { label: string; payPeriod: number | null; monthly: number | null; yearly: number | null; kind: "income" | "out" | "left"; ref?: SheetRef }
export interface SheetAllocation { category: string; actual: number | null; actualShare: number | null; target: number | null; targetShare: number | null }
export interface SheetBill {
  name: string;
  /** The Recurring Expenses table it came from, e.g. "Home & Utilities". */
  section: string;
  subcategory: string;
  owner: string;
  kind: "Need" | "Want" | "";
  /** Each time it's paid. */
  amount: number | null;
  frequency: string;
  /** As written: "6" (a day each month), "Jan 31" (each year) or "". */
  due: string;
  monthly: number | null;
  yearly: number | null;
  status: string;
  renewal: string;
  /** Payment account, account digits removed. */
  account: string;
  /** Notes / Source, with account digits, links and long numbers removed. */
  note: string;
  /** A formula error in the amount or monthly cell. */
  error: boolean;
  ref: SheetRef;
}
export interface SheetLoan { name: string; group: string; type: string; balance: number | null; payment: number | null; frequency: string; monthly: number | null; due: string; status: string; note: string; ref: SheetRef }
export interface SheetCard { name: string; group: string; /** null = unknown; 0 only when the card is marked paid off. */ balance: number | null; /** Fraction, 0.2374 for 23.74%. */ apr: number | null; limit: number | null; due: string; status: string; note: string; ref: SheetRef }
export interface SheetAccount { name: string; purpose: string; balance: number | null; deposit: number | null; group: string; ref: SheetRef }
export interface SheetLabelled { section: string; label: string; value: string | number | boolean | null; b: string; c: string; d: string; e: string; ref: SheetRef }
export interface SheetFinance {
  snapshot: SheetSnapshotRow[];
  debt: SheetAmountRow[];
  savings: SheetAmountRow[];
  safetyNet: SheetAmountRow[];
  allocation: SheetAllocation[];
  /** Net income the Summary 50/30/20 shares are measured against. */
  allocationBase: number | null;
  allocationRef: SheetRef | null;
  bills: SheetBill[];
  planned: SheetBill[];
  loans: SheetLoan[];
  cards: SheetCard[];
  debtSummary: { label: string; amount: number | null; ref: SheetRef }[];
  debtNotes: SheetNote[];
  accounts: SheetAccount[];
  investments: { name: string; type: string; perPeriod: number | null; monthly: number | null; status: string; note: string; ref: SheetRef }[];
  separateCash: { name: string; balance: number | null; kind: string; ref: SheetRef }[];
  separateCashDate: string | null;
  savingsNotes: SheetNote[];
  dashboard: SheetLabelled[];
  estimates: SheetLabelled[];
  incomeSources: { name: string; type: string; include: boolean; netPerPeriod: number | null; grossPerPeriod: number | null; netMonthly: number | null; grossMonthly: number | null; netYearly: number | null; grossYearly: number | null; ref: SheetRef }[];
  routing: { account: string; purpose: string; perPeriod: number | null; monthly: number | null; savings: boolean; ref: SheetRef }[];
  incomeNotes: SheetNote[];
  scenarios: { name: string; include: boolean; grossMonthly: number | null; ref: SheetRef }[];
  paychecks: {
    /** Pay date of the dated paystub, "YYYY-MM-DD". */ anchor: string | null; anchorRef: SheetRef | null;
    periodDays: number | null; netPerCheck: number | null;
    salaryHistory: { date: string | null; reason: string; annual: number | null; ref: SheetRef }[];
    deposits: { account: string; current: number | null; pending: number | null; ref: SheetRef }[];
  };
  reserves: { name: string; category: string; kind: "Need" | "Want" | ""; annual: number | null; monthly: number | null; status: string; timing: string; note: string; ref: SheetRef }[];
  oneTime: { name: string; group: string; category: string; estimate: number | null; date: string | null; payment: string; note: string; noteDate: string | null; ref: SheetRef }[];
  netWorth: { date: string | null; cash: number | null; home: number | null; retirement: number | null; mortgage: number | null; otherDebt: number | null; netWorth: number | null; basis: string; ref: SheetRef }[];
  billTrends: { service: string; points: { month: string; amount: number | null; ref: SheetRef }[] }[];
  water: { date: string | null; amount: number | null; ref: SheetRef }[];
  layoff: { asOf: string | null; essentials: number | null; ref: SheetRef | null };
  errors: { tab: string; range: string; value: string }[];
  /** Tabs Cortex looked for and didn't find. */
  missing: string[];
}
export type FinStatus = "confirmed" | "recorded" | "estimate" | "unknown" | "conflict" | "computed";
export interface FinAttention { id: string; level: "high" | "medium" | "low"; kind: "missing" | "conflict" | "undated" | "unresolved" | "change"; title: string; text: string; ref: SheetRef | null }
/** What the Finances tab and Home get: the model plus where it came from. */
export interface SheetFinanceResult { finance: SheetFinance; modifiedTime: string | null; url: string; name: string; /** Tab name -> sheet gid, for links to a tab and range. */ gids?: Record<string, number> }

// ---------- News (phase 5): RSS headlines ----------
export interface NewsItem {
  title: string;
  url: string;
  source: string;
  category: string;
  group: "Work" | "Life";
  publishedAt: string;
  /** One paragraph or less from the feed or the article's own preview ("" when neither has one). */
  summary: string;
  /** An https picture from the feed or the article's og:image ("" when there is none). */
  image: string;
}
export interface NewsCategory { name: string; group: "Work" | "Life" }
export interface NewsResponse {
  generatedAt: string;
  /** In config order: one section per category. */
  categories: NewsCategory[];
  /** Newest first, duplicates removed, at most perCategory per category. */
  items: NewsItem[];
  /** Feeds that were skipped, by category and host. */
  failed: { category: string; feed: string }[];
  /** Groups Home's headlines come from. */
  homeGroups: ("Work" | "Life")[];
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
  finances(today: Date): SheetFinanceResult;
  news(now: Date): NewsResponse;
  ops(now: Date): OpsResponse;
  briefing(now: Date): BriefingFile[];
  setup(): Connection[];
  playlist: DemoTrack[];
}

// ---------- Connections (src/setup-lib.js, /api/setup) ----------

export interface Connection {
  id: string;
  label: string;
  unlocks: string;
  optional: boolean;
  ready: boolean;
  /** Names of the Vercel variables still missing; never their values. */
  missing: string[];
}

// ---------- Assistant: briefing, priorities, approvals (src/briefing-lib.js, src/priorities-lib.js, src/approvals-lib.js) ----------

interface ProposalBase {
  /** Unique per proposal, e.g. "p-2026-10-13-1"; decisions are stored by it so a card never comes back. */
  id: string;
  /** Why the routine proposes it, shown on the card. */
  reason: string;
  /** The task or event name, for the card only. */
  title: string;
}
export type Proposal =
  | (ProposalBase & { action: "todoist.reschedule"; taskId: string; from: string; to: string })
  | (ProposalBase & { action: "todoist.complete"; taskId: string })
  | (ProposalBase & { action: "todoist.create"; content: string; due: string | null; priority: "p1" | "p2" | "p3" | "p4" })
  | (ProposalBase & { action: "calendar.create"; calendarId: string; start: string; end: string })
  | (ProposalBase & { action: "calendar.move"; calendarId: string; eventId: string; from: string; to: string });

export interface Briefing {
  date: string | null;
  generated: string | null;
  summary: string;
  attention: string[];
  email: string[];
  proposals: Proposal[];
  /** Proposals with an action v1 doesn't run; shown read-only as "Not supported". */
  unsupported: { id: string; action: string; reason: string }[];
  /** What couldn't be read, in words safe to show. */
  problems: string[];
}

/** A briefing file as Drive lists it, with its text once read. */
export interface BriefingFile {
  name: string;
  modifiedTime: string;
  text?: string;
}

export interface PriorityConfig {
  weights: Record<"overdue" | "dueToday" | "p1" | "p2" | "fitsBlock" | "quickPickup" | "untouched", number>;
  estimates: { quick: number; deep: number };
  quickMinutes: number;
  bigBlockMinutes: number;
  untouchedDays: number;
}

export type ApprovalStatus = "approved" | "rejected" | "stale" | "failed" | "undone";

/** One decision in /Cortex/approvals/state.json. */
export interface ApprovalRecord {
  status: ApprovalStatus;
  at: string;
  action: string;
  targetId: string | null;
  /** In words safe to show: why it was stale or failed. */
  note?: string;
  /** Until when Undo is allowed (approved reschedules and moves only). */
  undoUntil?: string;
  /** The checked proposal that ran, kept so Undo reverses exactly what ran. */
  proposal?: Proposal;
}

/** GET /api/approvals */
export interface ApprovalsResponse {
  /** False until the Google variables are set in Vercel; approving can't work before then. */
  configured: boolean;
  decisions: Record<string, { status: ApprovalStatus; at: string; note?: string }>;
}
