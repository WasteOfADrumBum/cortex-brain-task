// Sample Todoist tasks for /demo (Planner and Home's Top 3). Made up: no real tasks, people or projects.
// Labels match config/topics.json, so the demo shows every bucket, a task that needs a size, private topics on Home
// and a hidden @system task.
/** @typedef {import("../types").Task} Task */
/** @typedef {import("../types").TasksResponse} TasksResponse */

/** @param {Date} d */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * @param {Date} today Midnight today, local time.
 * @returns {TasksResponse}
 */
export function tasks(today) {
  /** @param {number} n */
  const due = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return ymd(d); };
  /** @type {[string, Task["priority"], string | null, number | null, string[], string][]} */
  const rows = [
    ["Fix the login redirect bug", 4, due(-1), 120, ["deep", "development"], "p-work"],
    ["Send weekly update to the team", 4, due(1), 45, ["quick"], "p-work"],
    ["Review the open pull request", 3, due(2), 30, ["quick", "development"], "p-work"],
    ["Book a dentist visit", 2, due(0), 10, ["quick", "family", "health"], "p-home"],
    ["Renew car registration", 1, due(5), 15, ["quick", "car", "money"], "p-home"],
    ["Reply to the meetup organiser", 1, null, 15, [], "p-inbox"],
    ["Edit the autumn photo set", 2, due(9), 180, ["deep", "photography"], "p-home"],
    ["Write a project case study", 1, null, 90, ["deep", "development"], "p-work"],
    ["Order air filters", 1, due(3), null, ["quick", "house"], "p-home"],
    ["Back up practice recordings", 1, null, null, ["music"], "p-home"],
    ["Brain sweep ran", 1, due(0), null, ["system", "brain"], "p-inbox"],
  ];
  return {
    tasks: rows.map(([content, priority, dueOn, duration, labels, projectId], i) => ({
      id: `demo-${i + 1}`, content, priority, due: dueOn, duration, labels, projectId, sectionId: null,
      // Demo tasks have no Todoist page, so they link to Todoist's home page.
      url: "https://todoist.com/",
    })),
    labels: ["quick", "deep", "system", "development", "photography", "music", "family", "house", "car", "health", "money", "brain"],
    projects: [{ id: "p-inbox", name: "Inbox" }, { id: "p-work", name: "Work" }, { id: "p-home", name: "Home" }],
    sections: [],
    warnings: [],
  };
}
