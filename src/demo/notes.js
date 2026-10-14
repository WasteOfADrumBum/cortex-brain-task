// Sample Second Brain notes for /demo (Home, Vault and Ops). Made up: no real notes, names or folders.
/** @typedef {import("../types").DriveFile} DriveFile */
/** @typedef {import("../types").DriveStorage} DriveStorage */

const DAY = 86400000;

/** @type {DriveStorage} */
export const storage = { used: 4.2 * 2 ** 30, limit: 15 * 2 ** 30, trash: 0 };

/** @param {string} title @param {string} description @param {string} text */
const note = (title, description, text) => `---\nname: ${title}\ndescription: ${description}\n---\n# ${title}\n\n${text}`;

/**
 * @param {Date} now
 * @returns {DriveFile[]}
 */
export function notes(now) {
  const t = now.getTime();
  /** @param {number} daysAgo @param {number} [hours] */
  const iso = (daysAgo, hours = 0) => new Date(t - daysAgo * DAY - hours * 3600000).toISOString();
  /** @param {string} name @param {string} folder @param {number} created @param {number | null} modified @param {string} body @returns {DriveFile} */
  const mk = (name, folder, created, modified, body) => ({
    id: `demo-${name}`, name, folder, mimeType: "text/markdown",
    createdTime: iso(created), modifiedTime: iso(modified ?? created, 1), webViewLink: "", body,
  });
  const files = [
    mk("00-index.md", "", 30, 3, note("Brain rules (v3)", "How this sample brain is organised and what the weekly sweep does.", "## Folders\n- inbox/ holds new captures\n- notes/ is flat\n\n## Weekly sweep\n- Files everything in the inbox\n- Tags decisions\n- Writes a digest")),
    mk("about-me.md", "", 60, 2, note("About me", "A sample profile for a made-up person, Alex.", "Alex is a made-up person. This profile exists so the demo has something to show.")),
    mk("weekly-digest-latest.md", "notes", 5, 5, note("Weekly digest", "8 notes filed, 2 decisions tagged, inbox down to 4.", "- 8 notes filed\n- 2 decisions tagged\n- Inbox down to 4")),
    mk("weekly-digest-previous.md", "notes", 12, 12, note("Weekly digest, a week earlier", "6 notes filed and one duplicate merged.", "- 6 notes filed\n- 1 duplicate merged")),
    mk("00-index-v2-retired.md", "notes", 40, 20, "Retired index version."),
    mk("00-index-v1-retired.md", "notes", 70, 40, "Retired index version."),
    mk("idea-bike-rack.md", "inbox", 0, 0, "Build a wall rack for two bikes in the shed."),
    mk("book-eye-exam.md", "inbox", 1, 1, "Book the yearly eye exam."),
    mk("talk-notes-habits.md", "inbox", 2, 2, "Notes from a talk about small habits."),
    mk("gift-ideas.md", "inbox", 3, 1, "- Wireless earbuds\n- A puzzle box"),
  ];
  /** @type {[string, string, string][]} */
  const topics = [
    ["decision-new-phone", "Decision: new phone", "Picked the smaller model for battery life over camera upgrades."],
    ["guitar-practice-plan", "Guitar practice plan", "Three short sessions a week on chords and timing."],
    ["budget-plan", "Budget plan", "Spending targets for the next three months, with room for a trip."],
    ["meal-prep-ideas", "Meal prep ideas", "Batch meals that keep for four days."],
    ["reading-list", "Reading list", "Books queued for the rest of the year."],
    ["car-maintenance", "Car maintenance", "Oil change and tire rotation schedule."],
    ["workout-split", "Workout split", "Three strength days and one cardio day."],
    ["home-network", "Home network", "Router settings and which devices use the guest network."],
    ["trip-shortlist", "Trip shortlist", "Three weekend trip options with rough costs."],
    ["side-project-ideas", "Side project ideas", "Small apps worth building, ranked by effort."],
    ["habit-tracker", "Habit tracker", "Daily habits being tried this month."],
    ["learning-go", "Learning Go", "Notes from the first five chapters of a Go book."],
    ["garden-plan", "Garden plan", "What to plant in the raised beds next spring."],
    ["camera-wishlist", "Camera wishlist", "A lens and a tripod, in priority order."],
    ["weekly-review-template", "Weekly review template", "Questions to answer every Sunday evening."],
    ["ai-tools-compare", "AI tools compared", "Which assistant to use for writing, coding and research."],
    ["photo-backup-plan", "Photo backup plan", "Two copies at home, one in the cloud."],
  ];
  topics.forEach(([slug, title, desc], i) => {
    const created = (i * 7) % 29 + (i % 3);
    files.push(mk(`${slug}.md`, "notes", created, Math.max(0, created - (i % 4)), note(title, desc, "Sample note for the demo.\n\n- Point one\n- Point two")));
  });
  return files;
}
