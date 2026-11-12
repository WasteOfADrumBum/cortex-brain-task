// The morning briefing: a Markdown file the Claude routine writes to Drive as /Cortex/briefings/YYYY-MM-DD.md
// (format in docs/briefing-routine.md). Cortex only reads it. Shared by Home, the Assistant page and the tests.
import { checkProposal } from './approvals-lib.js';

/** @typedef {import('./types').Briefing} Briefing */

const NAME = /^(\d{4}-\d{2}-\d{2})\.md$/;

/** The date a briefing file is for, from its name, or null when the name isn't YYYY-MM-DD.md. */
export const briefingDate = (/** @type {string} */ name) => NAME.exec(name)?.[1] ?? null;

/** YYYY-MM-DD for a local day. */
export const dayKey = (/** @type {Date} */ d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Today's file if there is one, plus the newest earlier file (for "last one was ...").
 * @template {{ name: string }} F
 * @param {F[]} files @param {Date} today
 * @returns {{ today: F | null, latest: F | null }}
 */
export function pickBriefing(files, today) {
  const key = dayKey(today);
  const dated = files.filter((f) => briefingDate(f.name) && /** @type {string} */ (briefingDate(f.name)) <= key)
    .sort((a, b) => b.name.localeCompare(a.name));
  return { today: dated.find((f) => briefingDate(f.name) === key) || null, latest: dated[0] || null };
}

const bullets = (/** @type {string} */ body) => body.split('\n').map((l) => l.match(/^\s*[-*]\s+(.*\S)/)?.[1]).filter(Boolean).slice(0, 20);

/**
 * Reads a briefing. Never throws: what it can't read goes into `problems`, in words safe to show.
 * Proposals are checked with the approvals rules; unknown actions are kept as unsupported so they show read-only.
 * @param {string} text
 * @returns {Briefing}
 */
export function parseBriefing(text) {
  /** @type {Briefing} */
  const out = { date: null, generated: null, summary: '', attention: [], email: [], proposals: [], unsupported: [], problems: [] };
  let body = String(text ?? '').replace(/\r\n/g, '\n');
  const fm = body.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^(date|generated):\s*(.+?)\s*$/);
      if (m) out[/** @type {'date' | 'generated'} */ (m[1])] = m[2].replace(/^["']|["']$/g, '');
    }
    body = body.slice(fm[0].length);
  }
  /** @type {Record<string, string>} */
  const sections = {};
  let current = '';
  for (const line of body.split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { current = h[1].toLowerCase(); sections[current] = ''; continue; }
    if (current) sections[current] += `${line}\n`;
  }
  out.summary = (sections.summary || '').trim().replace(/\s+/g, ' ').slice(0, 800);
  out.attention = bullets(sections['needs attention'] || '');
  out.email = bullets(sections.email || '');
  if (!out.summary) out.problems.push('The briefing has no Summary section.');
  const block = sections.proposals?.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (block) {
    let list = null;
    try { list = JSON.parse(block[1]); } catch { out.problems.push('The Proposals block is not valid JSON, so no proposals are shown.'); }
    if (list && !Array.isArray(list)) out.problems.push('The Proposals block should be a list.');
    for (const raw of Array.isArray(list) ? list.slice(0, 30) : []) {
      const r = checkProposal(raw);
      if (r.ok === true) out.proposals.push(r.value);
      else if (!r.supported) out.unsupported.push({ id: typeof raw?.id === 'string' ? raw.id.slice(0, 80) : '', action: String(raw?.action ?? '').slice(0, 60), reason: typeof raw?.reason === 'string' ? raw.reason.slice(0, 300) : '' });
      else out.problems.push(`A proposal was skipped: ${r.message}.`);
    }
  }
  return out;
}
