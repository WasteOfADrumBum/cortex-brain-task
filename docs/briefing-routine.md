# Morning briefing routine

Cortex's Home panel and `/briefing` page read one Markdown file a day from Google Drive: `/Cortex/briefings/YYYY-MM-DD.md`. A scheduled Claude routine writes it. The routine reads Calendar, Todoist and Gmail through Claude's own connectors, so Cortex never gets Gmail access and the briefing costs nothing in API calls.

The routine only **proposes** changes. Nothing in Todoist or Calendar changes until you press **Approve** in Cortex, and Cortex checks every proposal again before it runs (see "Approvals" in the README).

## Set it up

1. In Claude, create a routine (a scheduled task) that runs **weekdays at 6:30 AM** your time. That time is an assumption; change it to suit you.
2. Give it the Google Calendar, Todoist, Gmail and Google Drive connectors.
3. Paste the prompt below as its instructions.
4. Make sure `/Cortex/briefings/` exists in your Drive. Cortex creates `/Cortex/` the first time it saves finances or an approval; you can also create both folders yourself. The routine writes into the `briefings` folder whose parent is named `Cortex`.

## Routine prompt

~~~~text
You write my morning briefing for Cortex. You only read and propose; never change my calendar, tasks or email.

1. Read today's and tomorrow's events from Google Calendar (all my calendars), my open Todoist tasks (overdue,
   due today, due in the next 7 days, and P1/P2 tasks), and Gmail messages from the last 24 hours in my inbox.
2. Write one Markdown file named YYYY-MM-DD.md (today's date in my time zone) into the Google Drive folder
   Cortex/briefings. If a file with that name exists, replace its content. Use exactly this layout:

---
date: YYYY-MM-DD
generated: <now, ISO 8601 with my UTC offset, e.g. 2026-10-13T06:30:00-04:00>
---
## Summary
Two to four plain sentences: what today looks like and the one thing to protect.

## Needs attention
- One line per item, with why it matters. At most 6.

## Email
- Sender name: subject, and whether it needs a reply. Only mail that matters; at most 8. No message bodies.

## Proposals
```json
[ ...zero or more proposals... ]
```

3. Proposals are optional and few (at most 5). Propose only these actions, with these fields:
   - {"id", "action": "todoist.reschedule", "taskId", "title", "from", "to", "reason"}
   - {"id", "action": "todoist.complete", "taskId", "title", "reason"}
   - {"id", "action": "todoist.create", "content", "due" (optional), "priority": "p1" | "p2" | "p3" | "p4", "reason"}
   - {"id", "action": "calendar.move", "calendarId" (optional, default primary), "eventId", "title", "from", "to", "reason"}
   - {"id", "action": "calendar.create", "calendarId" (optional), "title", "start", "end", "reason"}
   Rules:
   - id: "p-YYYY-MM-DD-N", unique, N counting from 1.
   - taskId and eventId: the exact ids the Todoist and Calendar connectors return.
   - from: the task's or event's CURRENT due date or start, exactly as it is now. Cortex refuses a proposal
     whose from no longer matches, so copy it carefully.
   - Dates are YYYY-MM-DD. Times are YYYY-MM-DDTHH:MM with my UTC offset (e.g. 2026-10-15T20:30-04:00).
   - Never propose deleting anything, and never propose changes to recurring tasks or all-day events.
   - reason: one short sentence a person would accept.
4. Privacy: never write account numbers, card numbers, codes, passwords, amounts of money, or anything from a
   message body beyond its subject. Health or money items go in as "Health item" or "Money item" only.
5. If a connector fails, still write the file and say in the Summary which source was missing.
~~~~

## What Cortex does with it

- **No file today:** Home says "No briefing yet today" and names the date of the last one. The Ops checklist item "Daily briefing exists for today" shows Not yet.
- **A section it can't read** (for example broken JSON in Proposals): the rest still shows, with a note saying what was skipped.
- **An action outside the five above:** shown read-only as "Not supported". Nothing runs.
- **Approve:** the server re-checks the proposal, re-reads the task or event, and refuses with "Stale, review again" if it changed. Otherwise it makes the change, stores the decision in `/Cortex/approvals/state.json` and logs it in `/Cortex/logs/audit-YYYY-MM.jsonl`. Reschedules and moves can be undone for 10 seconds.
- **Reject:** logged the same way; nothing changes.
