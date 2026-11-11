<!-- generated from .engineering/state.json (revision 3); edit state.json through a checkpoint, not this file -->

# cortex: development status

All values are **agent-reported**, not independently verified. Check GitHub before relying on them.

- Milestone: Cortex 1.0 (maintenance)
- Active task: none recorded
- Branch: `claude/hardening-axe`
- Recorded commit: `842d1e4` on `claude/hardening-axe`
- Last checkpoint: 2026-11-11T13:08:00Z by Claude Code

## Next action

Merge the hardening PR once CI gate is green; then record the axe evidence in the hub registry (clears missing evidence).

## Completed

- Cortex 1.0 approved by Joshua Small (hub PRs #187, #188)
- Constant-time dashboard key check (api/_key.js) with a test
- axe scan of every /demo tab in CI (npm run check:a11y), part of CI gate

## In progress

_none recorded_

## Tests (agent-reported)

- `npm test`: pass at `59c2b29`, 2026-11-11T05:38:16Z

## Unverified changes

_none recorded_
