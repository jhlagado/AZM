# GitHub Backlog Workflow (Jira-Style)

This document defines how ZAX uses GitHub Issues as the single backlog system.

## Goal

Use only GitHub-native features to get Jira-like execution discipline:

- one prioritized backlog
- explicit status
- dependency handling
- acceptance-driven closure
- clear PR-to-issue evidence

## Canonical Work Queue

The canonical queue is:

- Milestone: `v0.2 Codegen Verification Gate`
- Issues: `#261` through `#266`
- Labels:
  - `priority:p0`, `priority:p1`, `priority:p2`
  - `workflow:ready`, `workflow:active`, `workflow:blocked`
  - existing scope labels (`v0.2`, `closeout-gate`, etc.)

Bootstrap note:

- If any of these labels are missing, create them before using this workflow.

## Status Model

Use labels as workflow states:

- `workflow:ready`: unblocked and queued
- `workflow:active`: currently in implementation
- `workflow:blocked`: waiting on dependency/decision

Execution rule:

- Only one implementation issue may be `workflow:active` at a time.
- Tracker/meta issues can remain `workflow:ready`.

## Priority Model

- `priority:p0`: current critical path
- `priority:p1`: next-up critical work
- `priority:p2`: important but deferred until p0/p1 completion

Sort order for execution:

1. `workflow:active` (single implementation issue)
2. `workflow:ready` by priority (`p0` -> `p1` -> `p2`)
3. issue number (oldest first)

## Issue Requirements

All implementation issues must use `.github/ISSUE_TEMPLATE/v02-change-task.yml` and contain:

- summary/problem statement
- normative references
- acceptance checklist
- test plan
- diagnostics contract
- out-of-scope list

No implementation work should begin without an issue in this shape.

## PR Requirements

Every PR must:

1. name one primary issue
2. copy that issue's acceptance criteria into PR checklist form
3. include evidence links (tests/docs/diagnostics) before merge

Issue close rule:

- close only after merged PR evidence satisfies all acceptance checklist items.

## CI Change Classification Rule

Testing-path and CI verification expectations are maintained in:

- `docs/reference/testing-verification-guide.md`

## Dependency Handling Without Project Views

If GitHub Project access is unavailable (token scope limits), use:

- tracker issue comments for sequencing and blockers
- `workflow:blocked` label for blocked work
- explicit "blocked by #N" lines in issue body/comments

This keeps process fully functional without external tools.

## Suggested Optional Upgrade

If `read:project`/`project` scopes are added later, mirror this model into a GitHub Project board with:

- custom fields: `Status`, `Priority`, `Track`, `Target`
- saved views: `Now`, `Next`, `Blocked`, `Done`

The issue/milestone/label model in this doc remains authoritative even without Projects.
