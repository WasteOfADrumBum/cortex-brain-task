// Shared Todoist task rules for Home and the Planner: size and topic labels from config/topics.json,
// the Critical rule, the Planner buckets, and what Home may show of a task's title.
// Label names live only in config/topics.json; nothing here names a label.
const TaskRules = (() => {
  const lc = (s) => String(s ?? "").trim().replace(/^@/, "").toLowerCase();
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const localDate = (s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };

  let config = null, loading = null;
  // Resolves once config/topics.json has loaded; rejects with a sentence safe to show if it can't.
  function ready() {
    loading ||= fetch("/config/topics.json")
      .then((r) => { if (!r.ok) throw new Error(`error ${r.status}`); return r.json(); })
      .then((c) => {
        const size = {};
        for (const [k, v] of Object.entries(c.size || {})) if (v?.label) size[k] = { ...v, label: lc(v.label) };
        config = { size, topics: (c.topics || []).filter((t) => t?.label).map((t) => ({ ...t, label: lc(t.label), name: t.name || t.label })) };
        return config;
      })
      .catch((e) => { loading = null; throw new Error(`Task settings (config/topics.json) didn't load: ${e.message}.`); });
    return loading;
  }

  // Keeps only the config labels that exist in Todoist. A label counts as existing when the labels list has it
  // or a task carries it (shared labels are not in the personal list). Missing ones are ignored, never an error.
  function active(todoistLabels, tasks) {
    if (!config) throw new Error("TaskRules.ready() has not finished.");
    if (!Array.isArray(todoistLabels)) return { ...config, missing: [] }; // list unavailable: use the config as written
    const have = new Set([...todoistLabels.map(lc), ...tasks.flatMap((t) => (t.labels || []).map(lc))]);
    const missing = [];
    const keep = (label) => (have.has(label) ? true : (missing.push(label), false));
    const size = Object.fromEntries(Object.entries(config.size).filter(([, v]) => keep(v.label)));
    return { size, topics: config.topics.filter((t) => keep(t.label)), missing };
  }

  // body: the /api/tasks response (or sample data with the same shape).
  // Returns { tasks, all, config } where tasks has @system removed and each task carries
  // size ("quick" | "deep" | null), topics [{ label, name, private }], project and section names, dueAt and dueDay.
  function prepare(body) {
    const raw = body.tasks || [];
    const cfg = active(body.labels, raw);
    const projects = new Map((body.projects || []).map((p) => [p.id, p.name]));
    const sections = new Map((body.sections || []).map((s) => [s.id, s.name]));
    const all = raw.map((t) => {
      const labels = new Set((t.labels || []).map(lc));
      const has = (key) => cfg.size[key] && labels.has(cfg.size[key].label);
      const dueAt = t.due ? (t.due.length > 10 ? new Date(t.due) : localDate(t.due)) : null;
      return {
        ...t,
        system: !!has("system"),
        // One size label per task; if both are set, quick wins (config order).
        size: has("quick") ? "quick" : has("deep") ? "deep" : null,
        topics: cfg.topics.filter((x) => labels.has(x.label)),
        project: projects.get(t.projectId) || null,
        section: sections.get(t.sectionId) || null,
        dueAt,
        dueDay: dueAt ? sod(dueAt) : null,
      };
    }).sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || b.priority - a.priority);
    return { tasks: all.filter((t) => !t.system), all, config: cfg };
  }

  // Critical this week: overdue, or P1/P2 due in the next 7 days (unchanged from the original Planner rule).
  function isCritical(t, today) {
    const wk = new Date(today); wk.setDate(wk.getDate() + 7);
    return !!t.dueDay && (t.dueDay < today || (t.dueDay < wk && t.priority >= 3));
  }

  // Planner buckets from prepared tasks. Critical first; then @quick, @deep; anything without a size goes to other.
  function buckets(tasks, today) {
    const live = tasks.filter((t) => !t.system);
    const crit = live.filter((t) => isCritical(t, today)), rest = live.filter((t) => !isCritical(t, today));
    return {
      crit,
      quick: rest.filter((t) => t.size === "quick"),
      big: rest.filter((t) => t.size === "deep"),
      other: rest.filter((t) => !t.size),
      count: live.length,
    };
  }

  // Home never shows the title of a task with a private topic, only "<Topic> task".
  function homeTitle(t) {
    const p = (t.topics || []).find((x) => x.private);
    return p ? `${p.name} task` : t.content;
  }

  // For pages that still show tasks when the settings fail to load: no sizes or topics, so every task is unsized.
  function fallback() { config ||= { size: {}, topics: [] }; return config; }

  return { ready, fallback, prepare, buckets, isCritical, homeTitle, get config() { return config; } };
})();
