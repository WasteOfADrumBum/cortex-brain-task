# Cortex v2 Build Spec

Oct 13, 2026 · @Joshua Small

## Goals and design rules

Cortex v2 merges the Life Dashboard, Knowledge Vault, Executive Assistant and Agent Operations ideas into the existing cortex-brain-task app (cortex.onesmall.company) as six tabs, with Home as the summary of the other five.

Design rules (apply to every task):

1. **Keep what works.** The Planner tab stays functionally as-is. Google sign-in, Drive link and Todoist/Calendar routes stay.
2. **No database.** Google Drive is the data store: Markdown for notes and briefings, JSON for structured data. Live APIs (GitHub, Vercel, RSS) are read on request, not stored.
3. **Zero maintenance.** No servers to babysit, no paid services, no migrations. Everything runs on Vercel functions plus Drive.
4. **Every panel leads to an action.** If a panel can't answer "what do I do with this?", remove it.
5. **Plain language.** No unexplained metrics. Every number has a label a non-developer understands and a link to its detail.
6. **Rules decide, AI explains.** Priorities use deterministic rules. AI text (written by the daily Claude routine) explains; it never decides or acts on its own.
7. **Human approval for every write** to Todoist or Calendar that the user didn't make directly.
8. **WCAG 2.2 AA** on every screen, including full screen reader and keyboard support.

## Architecture: Drive is the database

Every producer (ChatGPT, the Claude routine, Cortex itself) writes files into one Drive folder; Cortex reads them. Nothing else persists data.

```
/Cortex/
  finance/
    2026-10.json          month: income, bills, paid status
    2026.json             optional yearly rollup (Cortex can compute it)
  briefings/
    2026-10-13.md         daily briefing from the Claude routine
  approvals/
    pending.json          proposed Todoist/Calendar changes
  logs/
    audit-2026-10.jsonl   one line per approved/rejected/executed action
    ingest-2026-10.jsonl  one line per API ingest call
  config/
    news-feeds.json       RSS feeds by category
    ops.json              repos and Vercel projects to show
    priorities.json       rule weights for the priority engine
```

**Data sources by tab**

| Tab | Reads from | Writes to |
| --- | --- | --- |
| Home | All tabs' loaders | Nothing |
| Planner | Todoist API, Google Calendar API | Nothing (unchanged) |
| Finances | Drive `finance/` | Drive `finance/` via ingest endpoint only |
| News | RSS feeds listed in `config/news-feeds.json` | Nothing |
| Vault | Existing Drive Markdown notes | Nothing |
| Ops | GitHub API, Vercel API, Drive `briefings/` and sweep notes | Nothing |
| Assistant (on Home) | Drive `briefings/`, `approvals/` | `approvals/`, `logs/audit`, Todoist, Calendar |

**Drive access**

- Browser: keep the existing read-only token for reading notes.
- Server: one Google OAuth refresh token in a Vercel env var with the `drive.file` scope (only files Cortex creates). Used by the ingest endpoint and approvals. Generate it once with a small setup script in `scripts/get-refresh-token.ts`.
- `/Cortex/` is created by Cortex on first server write so `drive.file` covers it. The Claude routine writes `briefings/` through its own Drive connector.

## Tabs and routes

Six tabs in the existing shared top bar, one route each, so every tab is linkable and the back button works.

| Tab | Route | One-line job |
| --- | --- | --- |
| Home | `/` | What matters today, at a glance |
| Planner | `/planner` | Schedule, open hours, task buckets (unchanged) |
| Finances | `/finances` | This month in detail, plus the year |
| News | `/news` | Headlines by category |
| Vault | `/vault` | Notes I can understand and find |
| Ops | `/ops` | Is everything I build healthy, and what shipped |

- Tabs use a `nav` landmark with `aria-current="page"` on the active link, not ARIA tab widgets (they're pages, not panels).
- On phones, tabs collapse into the existing compact header menu.
- Each tab loads its own data; Home calls lightweight summary loaders, never the full tab payloads.
- Each data source fails alone: one broken source shows an inline error in its panel, matching the existing calendar "skip a bad feed" behavior.

## Home tab

Home is the Executive Assistant: one screen that summarizes every other tab and links into each one.

**Panels, in reading order**

| Panel | Shows | Links to |
| --- | --- | --- |
| Today strip | Date, time, current weather + high/low (keep existing weather, 27370 default) | None |
| Briefing | Today's briefing from `briefings/YYYY-MM-DD.md`; if missing, "No briefing yet today" + time of last one | Full briefing |
| Top 3 priorities | Rule-ranked tasks with a short "why" and time estimate | Planner |
| Today's schedule | Today's events + largest open block | Planner |
| Approvals | Count + the first 2 pending items with Approve/Reject | Approvals list |
| Money this month | In, out, bills due next 7 days, bills paid | Finances |
| Ops health | Green/amber/red per project, last deploy time, PRs merged this week | Ops |
| Headlines | Top 3 across all news categories | News |
| Brain | "N notes, N new this week", last sweep and Muse check in plain words | Vault |

**Panel cleanup (current dashboard)**

| Current panel | Change |
| --- | --- |
| Core gauge ("14 active files") | Replace with Brain panel text above |
| Recent files (digest/profile/retired labels) | Move to Vault; show note title + one-line summary from frontmatter `description`, file type as a small tag |
| Days since sweep | "Last sweep: Sun 9:00 PM · next: Sun" |
| Brain health % / sweep freshness | Remove. Replace with a 3-item checklist in Ops: sweep ran this week, Muse check ran, Todoist inbox under N items |
| Inbox load | Remove from Home; show in Ops checklist only |
| Activity feed | Move to Ops as "Recent activity" or remove if it duplicates Recent files |
| Separate date and clock tiles | Already merged; fold into Today strip |
| Launcher / quick links | Keep, as the tab links plus a short user-editable list in `config/` |

Acceptance: a first-time viewer can say what each Home panel means and what to click next without explanation.

## Finances tab and ingest endpoint

ChatGPT's Finances scheduled task can't POST to a URL, so v1 is a paste import: the task outputs JSON in a fixed schema, the user pastes it into Cortex, and Cortex validates and saves it to Drive. The ingest endpoint is built now with the same validation so automation can plug in later without changes.

**v2 automation (to verify):** if the ChatGPT task can email its result, the daily Claude routine reads that email, extracts the JSON block and writes `finance/YYYY-MM.json` to Drive. Cortex then reads it in the browser with the read-only token. Fully automatic, no new services.

**Tab layout**

- **This month:** income in, money out, net; bills due (name, amount, due date, paid/unpaid), sorted by due date; overdue bills flagged with text, not color alone.
- **Year:** one row per month (in, out, net, bills paid of total), current month highlighted; expand a month to see its bills.
- **Last updated:** time of the latest ingest + source, so stale data is obvious.
- **Paste import:** an "Update finances" button opens a dialog with a labeled textarea; paste the JSON, preview parsed totals and bills, then Save. Errors name the exact field. This is the v1 primary input.

**Endpoint:** `POST /api/ingest/finance`

- Auth: `Authorization: Bearer <CORTEX_INGEST_TOKEN>` (long random string in Vercel env). Wrong or missing token → 401, logged.
- Body (one full month per paste or call; the ChatGPT task always outputs the whole month so far, and saving replaces that month's file, so no merge or dedupe logic is needed):

```json
{
  "month": "2026-10",
  "periodStart": "2026-10-01",
  "periodEnd": "2026-10-13",
  "source": "chatgpt",
  "generatedAt": "2026-10-13T07:00:00-04:00",
  "totals": { "in": 0.00, "out": 0.00 },
  "coverage": [{ "account": "Checking ...4417", "status": "complete" }],
  "income": [{ "name": "Paycheck", "amount": 0.00, "date": "2026-10-15" }],
  "bills": [{ "name": "Electric", "amount": 0.00, "due": "2026-10-20", "paid": false, "category": "utilities" }],
  "notes": "optional one-paragraph summary"
}
```

- `coverage.status`: `complete`, `delayed` or `unavailable`. Accounts are labeled by nickname plus last 4 digits at most.
- No transaction IDs or account identifiers beyond last 4 (they trip the 8-digit rule and add risk for no dashboard value).
- **Safe replace:** validate the whole payload first; write to a temp file, then swap; keep the previous version as `finance/YYYY-MM.prev.json`.
- **Shrink warning:** if the new payload has fewer bills or income items than the current file, or any account is not `complete`, show a confirm dialog listing the differences before saving.

* Validate with a schema (zod): amounts are numbers, dates are ISO, names under 60 characters, max 100 bills.
* **Reject any string containing a run of 8 or more digits** (blocks account and card numbers). Return 422 with the field name.
* Write to `/Cortex/finance/YYYY-MM.json` via the server Drive token; append a line to `logs/ingest-YYYY-MM.jsonl` (time, source, month, counts, never amounts).
* Rate limit: 20 calls per hour per token.
* Return `{ "ok": true, "month": "2026-10", "bills": 12 }`.

**Prompt line to add to the ChatGPT Finances task:** "End every report with a fenced JSON block for the current month matching the schema above exactly. Cover the full month to date (1st through today), all available items, as a complete replacement snapshot. Mark each account's coverage as complete, delayed or unavailable. Never invent data. Label accounts by nickname plus last 4 digits at most; no account or transaction IDs."

## News tab

News comes from free RSS feeds listed in `config/news-feeds.json`; no API keys, no AI.

**Categories and starter feeds** (verify each URL loads before shipping; drop any that 404)

| Group | Category | Starter feeds |
| --- | --- | --- |
| Work | AI Tools & Agents | simonwillison.net/atom/everything/, openai.com/news/rss.xml |
| Work | Full-Stack Development | react.dev/rss.xml, smashingmagazine.com/feed/ |
| Work | Cloud & DevOps | github.blog/feed/, vercel.com/atom, aws.amazon.com/blogs/aws/feed/ |
| Work | Software Careers | newsletter.pragmaticengineer.com/feed |
| Work | Enterprise AI | Open: pick 1 to 2 public-sector tech sources |
| Life | Gaming & Technology | news.xbox.com/en-us/feed/, theverge.com/rss/index.xml, feeds.arstechnica.com/arstechnica/index |
| Life | Photography | petapixel.com/feed/, nikonrumors.com/feed/ |
| Life | Music & Audio | musicradar.com/rss |
| Life | Small Business & SaaS | Open: pick 1 to 2 sources |

```json
{
  "groups": ["Work", "Life"],
  "categories": [
    { "name": "AI Tools & Agents", "group": "Work", "feeds": ["https://simonwillison.net/atom/everything/"] }
  ],
  "perCategory": 8,
  "homeGroups": ["Work"]
}
```

- Server route `GET /api/news` fetches feeds in parallel, dedupes by URL, sorts newest first, caches 30 minutes (Vercel cache headers, no storage).
- One section per category: headline, source, relative time, link opening in a new tab with a visible "opens in new tab" hint for screen readers.
- A failing feed is skipped and named in a small "1 feed unavailable" note.
- Home shows the newest 3 across all categories.
- Layout: a filter bar with All, Work, Life and one chip per category (\`aria-pressed\` toggle buttons), so nine categories don't become one long scroll. Home headlines pull from Work only (\`homeGroups\`).

## Vault tab

Vault turns the current file panels into notes a person can understand, using only the Drive Markdown that already exists.

- **List:** title (frontmatter `name` or first heading), one-line summary (frontmatter `description`, else first sentence), type tag (note, digest, profile), updated date. Retired notes hidden behind a "Show retired" toggle.
- **Type legend:** one sentence per type at the top, for example "Digest: the weekly sweep's summary of what changed." Pull the wording from the sweep's own conventions; if unknown, leave a TODO for the user to fill.
- **Note view:** render the Markdown in the app (sanitized) instead of sending the user to Drive.
- **Search:** client-side full-text search over titles, descriptions and bodies (Fuse.js or MiniSearch). No embeddings, no server.
- **Filters:** keep existing tag filters.
- **Later (not v1):** Ask the Brain Q&A with source links, and action-item extraction. Both fit better as part of the Claude routine writing to Drive than as AI calls in the app.

## Ops tab

Ops answers two questions: is everything I run healthy, and how much shipped. It reads GitHub and Vercel live and stores nothing.

**Config:** `config/ops.json`

```json
{
  "projects": [
    { "name": "Cortex", "repo": "WasteOfADrumBum/cortex-brain-task", "vercel": "cortex-brain" },
    { "name": "OneSmallUI", "repo": "WasteOfADrumBum/one-small-ui", "vercel": "one-small-ui", "npm": "@onesmall/ui" },
    { "name": "Portfolio", "repo": "WasteOfADrumBum/joshsmall-site", "vercel": "joshsmall-portfolio" }
  ]
}
```

Personal repos only. Never add work repos.

**Per project card**

| Field | Source |
| --- | --- |
| Status: Healthy / Building / Failed (text + icon, not color alone) | Latest Vercel production deployment state |
| Last deploy: relative time + commit message first line | Vercel deployments API |
| Last 3 merged PRs: title, date, first line of PR body | GitHub pulls API (state=closed, merged) |
| Open PRs count | GitHub |
| Failed builds, last 7 days | Vercel deployments with state ERROR |
| Latest npm version (if `npm` set) | Public npm registry, no key |

**Totals strip:** PRs merged this week / this month, production deploys this week, failed builds this week.

**Shipping chart:** merged PRs per week for the last 12 weeks, one bar per week, stacked by project.

**Second brain checklist** (replaces brain health %):

- [ ] Weekly sweep ran in the last 7 days (date of newest digest note in Drive)
- [ ] Muse check ran in the last 7 days (open question: how Cortex can see Muse's run; likely a Todoist task or note it leaves)
- [ ] Daily briefing exists for today
- [ ] Finance data updated in the last 35 days

**Server routes:** `GET /api/ops/summary` (Home) and `GET /api/ops` (tab). Cache 5 minutes.

**Tokens:** GitHub fine-grained PAT, read-only (Metadata, Pull requests, Actions), limited to the listed repos. Vercel access token for the task-forge3 scope; only GET calls in code.

## Assistant: briefing, priorities, approvals

The Assistant lives on Home. A daily Claude routine writes the briefing and proposals to Drive; Cortex ranks tasks with rules and executes only what the user approves.

### Daily briefing (Claude routine, no API cost)

Routine runs each weekday morning, reads Calendar, Todoist and Gmail through Claude's connectors, and writes `/Cortex/briefings/YYYY-MM-DD.md`:

````markdown
---
date: 2026-10-13
generated: 2026-10-13T06:30:00-04:00
---
## Summary
Two to four plain sentences: what today looks like and the one thing to protect.

## Needs attention
- Item, with why it matters

## Email
- Sender: subject, and whether it needs a reply

## Proposals
```json
[{ "id": "p-2026-10-13-1", "action": "todoist.reschedule", "taskId": "123",
   "from": "2026-10-14T18:00", "to": "2026-10-15T20:30",
   "reason": "Conflicts with a personal commitment" }]
```
````

- Cortex reads it in the browser with the existing read-only Drive token (the routine's files aren't Cortex-created, so the server token can't read them).
- Gmail stays inside the routine: Cortex never gets Gmail access. That keeps the email panel zero-cost and adds no new scope.
- No file today → Home says so and shows the last briefing's date.

### Priorities (rules, in Cortex)

Score each open Todoist task; show the top 3 with the rule that ranked it as the "why". Weights live in `config/priorities.json`.

| Signal | Example weight |
| --- | --- |
| Overdue | +50 |
| Due today | +30 |
| Todoist priority p1 / p2 | +25 / +10 |
| Fits today's largest open block | +15 |
| Quick pickup (under 15 min) when no big block exists | +10 |
| Untouched over 14 days | +5 |

Reuse the Planner's existing Critical / Quick / Big bucketing logic rather than writing a second one.

### Approvals inbox (v1: Todoist and Calendar only)

**Allowed actions:** `todoist.create`, `todoist.reschedule`, `todoist.complete`, `calendar.create`, `calendar.move`. Anything else is shown read-only as "Not supported". **No deletes.**

**Flow**

1. Proposals come from the briefing's `## Proposals` block (later also from Cortex's own rules).
2. Each card shows the action in plain words, the target (task or event name), before and after, the reason, and Approve and Reject buttons.
3. Approve → `POST /api/approvals/:id` with the proposal. Server re-validates the action against the allowlist.
4. Stale check: server re-fetches the target. If it changed since the proposal was written, refuse and mark it "Stale, review again".
5. Execute with the server-side Todoist or Calendar token.
6. Append to `logs/audit-YYYY-MM.jsonl`: time, proposal id, action, target id, result. Store decision state in `approvals/state.json` so cards don't reappear.
7. Reject → logged the same way, nothing executed.

**Requirements:** focus returns to a sensible place after each action, results are announced through an `aria-live="polite"` region, and reschedule and move get a 10-second Undo (reverse call, also logged).

## Demo mode

Demo mode moves from "anyone signed out" to one portfolio URL, `/demo`, so real visitors to the root only see sign-in.

- `/` signed out → sign-in screen only, no sample data.
- `/demo` → every tab with realistic sample data (no real names, amounts, repos or notes), all writes disabled, Approve/Reject show a "Demo only" toast.
- Persistent banner: "Demo with sample data. Nothing here is real." as a `role="status"` region.
- `/demo` sends `X-Robots-Tag: noindex` and is excluded from the sitemap.
- Sample data lives in `src/demo/*.ts`, typed with the same schemas as real data so demo and real views can't drift.
- Portfolio project card links to `https://cortex.onesmall.company/demo`.
- Remove the old "Preview" mode once `/demo` ships.

## Security, accessibility, env vars

**Env vars (Vercel, server only, never `NEXT_PUBLIC_`)**

| Name | Purpose |
| --- | --- |
| `CORTEX_INGEST_TOKEN` | Bearer token for the finance ingest endpoint |
| `GOOGLE_REFRESH_TOKEN` | Server Drive (`drive.file`) and Calendar writes |
| `TODOIST_API_TOKEN` | Existing; now also used for approvals |
| `GITHUB_TOKEN` | Fine-grained, read-only, listed repos only |
| `VERCEL_TOKEN` | Ops reads |
| `ALLOWED_EMAIL` | Only this Google account may use non-demo routes |

**Security**

- Every `/api/*` route except ingest requires a signed-in session matching `ALLOWED_EMAIL`.
- Ingest compares tokens in constant time and never echoes request bodies in errors.
- No account or card numbers anywhere: the 8-digit rule on ingest plus no such fields in any schema.
- Logs record actions and counts, never amounts or email content.
- Markdown from Drive is sanitized before render.

**Accessibility (WCAG 2.2 AA)**

- Landmarks per page, one `h1` per tab, logical heading order.
- Status never by color alone: text label plus icon.
- All interactive elements keyboard reachable with visible focus; target size at least 24 by 24 px.
- Charts get a text summary and a data table toggle.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Run axe on every tab in CI; zero serious or critical issues to merge.

## Build phases and acceptance criteria

Six phases, one PR each, in order; each phase ships on its own and leaves the app working.

1. **Tabs, routes and cleanup**
   - Six routes in the shared top bar; Planner untouched.
   - Panel cleanup table applied; Recent files moved to Vault with titles and summaries.
   - Done when: every Home panel has a plain label and a link; axe clean.
2. **Demo mode**
   - `/demo` with typed sample data for all tabs, banner, noindex; signed-out `/` shows sign-in only; old Preview removed.
   - Done when: signed-out root shows no data; `/demo` shows every tab.
3. **Ops tab**
   - `config/ops.json`, project cards, totals strip, 12-week shipping chart, second brain checklist; Home Ops panel.
   - Done when: Cortex, OneSmallUI and Portfolio cards show live status and last 3 PRs.
4. **Finances tab and ingest**
   - Endpoint with auth, schema, 8-digit rule, rate limit, Drive write, ingest log; This month and Year views; paste import as the main input; Home Money panel.
   - Done when: pasting sample JSON and a curl POST both appear on the tab; a body with an account-like number returns 422.
5. **News and Vault**
   - RSS route and tab; Vault list, legend, note view, client search; Home Headlines and Brain panels.
   - Done when: search finds a note by a word in its body.
6. **Assistant**
   - Briefing reader, rule-based Top 3, approvals inbox with allowlist, stale check, audit log, undo.
   - Routine prompt for the daily Claude briefing written to `docs/briefing-routine.md`.
   - Done when: approving a sample reschedule moves the Todoist task, logs it, and Undo reverts it.

**Open questions for Joshua**

- [ ] Can the ChatGPT Finances task email its results, so the Claude routine can pick up the JSON (v2 automation)?
- [ ] How does Muse's check show up (Todoist task, note, nothing yet)?
- [ ] One-line meanings for digest, profile and retired notes for the Vault legend.
- [ ] Sources for Enterprise AI and Small Business & SaaS.
- [ ] Briefing time and days (weekdays at 6:30 AM assumed).
