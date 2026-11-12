<!-- generated from .engineering/state.json (revision 7) -->

# Handoff: cortex

Read this, then **verify against GitHub** (branch head, open PRs, CI) before continuing. Nothing below is independently verified.

- Checkpoint: revision 7, `cp-2026-11-12-phase6`, 2026-11-12T01:51:20Z by Claude Code
- Written by: a local edit that the agent then pushed; confirm the branch head matches
- Uncommitted work outside this checkpoint: **none**

## Continue with

Merge PR for claude/phase-6-assistant once CI is green. Then Cortex is blocked on owner items (tokens, routine setup, two news categories, Vault legend).

## Unfinished

_none recorded_

## Blockers

- Live data needs owner env vars in Vercel: GITHUB_TOKEN (Ops), GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN with drive.file and calendar.events (Finances, approvals)
- Briefing routine must be created by the owner (docs/briefing-routine.md)
- Open questions: Enterprise AI and Small Business & SaaS news sources, Vault legend wording, briefing time

## Decisions

- [human] Ship the live Cortex as 1.0; spec phases 3 to 6 move to ROADMAP.md (Joshua Small, project chat 2026-11-11 05:35 UTC: "Ship as 1.0")

## Constraints

_none recorded_

## Unresolved decisions

_none recorded_
