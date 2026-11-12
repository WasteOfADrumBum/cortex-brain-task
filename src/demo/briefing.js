// Sample morning briefings for /demo (Home's briefing and approvals, and the Assistant page). Made up: no real
// people, mail or tasks. Proposals point at the sample tasks in ./tasks.js and include one action v1 doesn't run.
/** @typedef {import("../types").BriefingFile} BriefingFile */

/** @param {Date} d */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Today's briefing and yesterday's, newest first, as the Drive reader returns them.
 * @param {Date} now
 * @returns {BriefingFile[]}
 */
export function briefing(now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (/** @type {number} */ n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
  const proposals = [
    { id: `p-${ymd(today)}-1`, action: "todoist.reschedule", taskId: "demo-2", title: "Send weekly update to the team",
      from: ymd(day(1)), to: ymd(day(2)), reason: "Tomorrow is full of meetings; the day after has a free morning." },
    { id: `p-${ymd(today)}-2`, action: "todoist.create", content: "Confirm Saturday's photo walk time", due: ymd(day(1)), priority: "p3",
      reason: "The walk organiser asked for a time by Friday." },
    { id: `p-${ymd(today)}-3`, action: "calendar.move", eventId: "demo-standup", title: "Team stand-up",
      from: `${ymd(day(1))}T09:30`, to: `${ymd(day(1))}T10:00`, reason: "Overlaps the dentist call you added." },
    { id: `p-${ymd(today)}-4`, action: "todoist.delete", taskId: "demo-9", reason: "Looks done already." },
  ];
  const text = `---
date: ${ymd(today)}
generated: ${ymd(today)}T06:30:00-04:00
---
## Summary
A steady day with two meetings before noon and a long open afternoon. Protect the afternoon for the login bug; it's overdue and it's the one thing that moves the week.

## Needs attention
- The login redirect bug is a day overdue, and the release waits on it
- The dentist visit is due today; booking takes ten minutes

## Email
- Sample Studio: invoice for October, no reply needed
- Meetup organiser: asks for a talk date, needs a reply

## Proposals
\`\`\`json
${JSON.stringify(proposals, null, 2)}
\`\`\`
`;
  const yesterday = `---
date: ${ymd(day(-1))}
---
## Summary
A light day. Nothing urgent came in overnight.
`;
  return [
    { name: `${ymd(today)}.md`, modifiedTime: new Date(today.getTime() + 6.5 * 3600e3).toISOString(), text },
    { name: `${ymd(day(-1))}.md`, modifiedTime: new Date(day(-1).getTime() + 6.5 * 3600e3).toISOString(), text: yesterday },
  ];
}
