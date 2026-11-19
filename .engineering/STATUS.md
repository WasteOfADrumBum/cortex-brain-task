<!-- generated from .engineering/state.json (revision 9); edit state.json through a checkpoint, not this file -->

# cortex: development status

All values are **agent-reported**, not independently verified. Check GitHub before relying on them.

- Milestone: Cortex v2 (after 1.0)
- Active task: finances-honest-dashboard: Rebuild the Finances tab to read the J&M P&L sheet honestly
- Branch: `feat/finances-honest-dashboard` · PR #50
- Recorded commit: `354330b` on `feat/finances-honest-dashboard`
- Last checkpoint: 2026-11-19T22:39:51Z by Claude Code

## Next action

Joshua Small checks /finances signed in with the real sheet on the Vercel preview or after merge, then decides whether to merge PR #50.

## Completed

- Finances rebuild: src/finance-model.js (money rules), wider sheet reader, seven views, docs/finances.md; PR #50 open, CI green (tests, axe, checkpoint).

## In progress

_none recorded_

## Tests (agent-reported)

- `npm test`: pass at `354330b`, 2026-11-19T22:39:51Z

## Unverified changes

- Finances with the real sheet (needs the owner's Google sign-in); tab links depend on the Sheets API or config tab ids
