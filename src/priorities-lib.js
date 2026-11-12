// Home's Top 3: scores each open task with the rules and weights in config/priorities.json and shows the
// strongest rule it met as the "why". Works on tasks prepared by TaskRules.prepare (task-rules.js), so it uses the
// same @quick / @deep size labels and @system filtering as the Planner's buckets.

/** @typedef {import('./types').PriorityConfig} PriorityConfig */
/**
 * The parts of a prepared task the rules read.
 * @typedef {{ priority: number, duration: number | null, size: 'quick' | 'deep' | null, dueDay: Date | null, updatedAt?: string | null, system?: boolean }} RankTask
 */

/** @type {PriorityConfig} */
export const DEFAULTS = {
  weights: { overdue: 50, dueToday: 30, p1: 25, p2: 10, fitsBlock: 15, quickPickup: 10, untouched: 5 },
  estimates: { quick: 30, deep: 90 },
  quickMinutes: 15,
  bigBlockMinutes: 60,
  untouchedDays: 14,
};

const WHY = {
  overdue: 'Overdue',
  dueToday: 'Due today',
  p1: 'Priority 1',
  p2: 'Priority 2',
  fitsBlock: "Fits today's largest open block",
  quickPickup: 'Quick pickup while there is no big block',
  untouched: 'Untouched for over 2 weeks',
};

/** Minutes a task should take: its Todoist duration, else the estimate for its size label, else null. */
export function estimate(/** @type {RankTask} */ t, /** @type {PriorityConfig} */ cfg = DEFAULTS) {
  return t.duration || (t.size ? cfg.estimates[t.size] ?? null : null);
}

/**
 * @template {RankTask} T
 * @param {T[]} tasks prepared tasks
 * @param {{ today: Date, now?: Date, openMinutes?: number | null, config?: Partial<PriorityConfig> }} ctx
 *   openMinutes: today's largest open block, or null when there is none (or the calendar didn't load)
 * @returns {{ task: T, score: number, why: string, rules: string[], minutes: number | null }[]}
 */
export function rank(tasks, ctx, limit = 3) {
  const cfg = { ...DEFAULTS, ...(ctx.config || {}), weights: { ...DEFAULTS.weights, ...(ctx.config?.weights || {}) }, estimates: { ...DEFAULTS.estimates, ...(ctx.config?.estimates || {}) } };
  const today = ctx.today.getTime();
  const now = (ctx.now || ctx.today).getTime();
  const open = ctx.openMinutes ?? null;
  const bigBlock = open !== null && open >= cfg.bigBlockMinutes;
  const scored = tasks.filter((t) => !t.system).map((task) => {
    const minutes = estimate(task, cfg);
    const due = task.dueDay ? task.dueDay.getTime() : null;
    const hits = /** @type {(keyof typeof WHY)[]} */ ([]);
    if (due !== null && due < today) hits.push('overdue');
    if (due === today) hits.push('dueToday');
    if (task.priority === 4) hits.push('p1');
    if (task.priority === 3) hits.push('p2');
    if (open !== null && minutes !== null && minutes <= open) hits.push('fitsBlock');
    if (!bigBlock && minutes !== null && minutes <= cfg.quickMinutes) hits.push('quickPickup');
    if (task.updatedAt && now - Date.parse(task.updatedAt) > cfg.untouchedDays * 864e5) hits.push('untouched');
    const rules = hits.sort((a, b) => cfg.weights[b] - cfg.weights[a]);
    const score = rules.reduce((s, r) => s + cfg.weights[r], 0);
    return { task, score, why: rules.length ? WHY[rules[0]] : '', rules: rules.map((r) => WHY[r]), minutes };
  });
  return scored.filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score
      || (a.task.dueDay?.getTime() ?? Infinity) - (b.task.dueDay?.getTime() ?? Infinity)
      || b.task.priority - a.task.priority)
    .slice(0, limit);
}
