# ZAX Developer Playbook (Non-normative)

For a short branch → PR → checks checklist, see [`CONTRIBUTING.md`](../../CONTRIBUTING.md) at the repo root. This playbook goes deeper (authority, refactors, review norms).

This document is the contributor workflow guide.

It is intentionally narrow. It does not own roadmap history, version closeout status,
or language semantics.

Normative language behavior is defined only by `docs/spec/zax-spec.md`.

## Scope

This playbook covers:

- document authority and conflict rules
- the expected implementation workflow
- refactor discipline for core compiler files
- review and merge hygiene

This playbook does not track:

- historical PR-by-PR progress
- version-specific planning history
- completion percentage estimates
- semantic policy that belongs in the spec or dedicated references

For current planning, use:

- `docs/archive/versioned/v04-planning-track.md`
- `docs/archive/versioned/v04-priority-queue.md`

## Document Authority

Decision hierarchy:

1. `docs/spec/zax-spec.md`
   - canonical language authority
2. topic-specific supporting references
   - codegen, addressing, calling convention, corpus workflow, and similar guidance
3. this playbook
   - contributor workflow only

Conflict rule:

- If this playbook conflicts with `docs/spec/zax-spec.md`, the spec wins.
- If this playbook conflicts with a narrower topic reference, the narrower topic reference wins.

## Contributor Workflow

### 1. Work From Issues

- Every non-trivial change starts from an issue.
- Keep one primary issue per PR.
- Use narrow, reviewable slices.
- If a large refactor needs multiple slices, create ordered sub-issues and work them in sequence.

### 2. Keep PRs Narrow

A PR should be one of these:

- pure extraction / move, no behavior change
- behavior-preserving internal representation cleanup
- targeted test hardening
- focused docs-only cleanup

Do not mix:

- feature work
- refactor work
- wide docs churn
- unrelated test refreshes

unless the link is unavoidable and explicit.

### 3. Preserve Semantics First

For refactors:

- extract responsibilities before rewriting behavior
- keep existing diagnostics stable unless the issue explicitly targets diagnostics
- prove no drift with focused tests plus smoke coverage
- avoid broad renaming unless it improves clarity at the extracted boundary

### 4. Review Discipline

Each reviewable slice should include:

- the exact issue it advances
- a short scope statement
- a clear list of what moved vs what stayed in place
- the verification commands that were run

Required review standard:

- no merge while required CI jobs are pending
- no merge on partial green when a required platform job is still running
- if a refactor introduces weaker typing (`any`, looser interfaces), tighten that before merge

### 5. Merge Hygiene

When a PR lands:

- close the related issue if the slice fully satisfies it
- leave a short factual closeout note for umbrella or sequence issues
- delete the feature branch locally and remotely
- update the next-in-order issue if the queue has shifted

## Refactor Discipline

v0.4 is a code-quality cycle. The active standard is:

- hard cap: no source file over 1000 lines
- soft target: keep source files under 750 lines where practical

Rules:

- split by responsibility, not by arbitrary line count
- keep extracted modules cohesive
- if an extracted replacement file exceeds 1000 lines, split it again before merge
- treat `src/lowering/emit.ts` as the highest-risk file until it is reduced to orchestration only

Preferred extraction order for oversized modules:

1. pure helpers and formatting
2. side-effect-free decision logic
3. policy helpers
4. execution helpers
5. outer orchestration last

## Testing Expectations

Canonical command reference:

- `docs/reference/testing-verification-guide.md`

This playbook keeps workflow principles only. Keep concrete command lists and CI testing-path details in the testing guide.

Use targeted tests to support refactors.

Preferred order:

1. direct helper tests for extracted modules
2. focused integration tests for the seam that changed
3. smoke compile / end-to-end sanity coverage

Do not rely only on broad smoke coverage when a new extracted helper can be tested directly.

Coverage work should be evidence-driven:

- fill real blind spots
- replace or supplement skipped historical suites with active current-behavior tests
- avoid vanity coverage growth with no risk reduction

Legacy-syntax guardrail:

- `scripts/ci/legacy-syntax-guardrail.js` is the CI gate for forbidden legacy syntax forms.
- New legacy syntax is blocked in `examples/` and `test/fixtures/` unless the fixture path is in the script allowlist.
- Keep that allowlist limited to intentional parser/recovery coverage fixtures.

## Docs Discipline

One topic should have one clear owner.

- `docs/spec/zax-spec.md` owns normative language rules
- topic references own narrow technical guidance
- this playbook owns contributor workflow only

Do not add new planning or status content here.
If a roadmap, closeout note, or queue changes, update the dedicated planning docs instead.

Historical material should either:

- live in the version closeout / planning docs, or
- be removed rather than copied forward into active workflow guides

### Docs formatting workflow

- CI `docs (fast)` checks only docs paths changed by the PR/push (`*.md`, `docs/**`, `.github/ISSUE_TEMPLATE/**`).
- This keeps docs-only CI strict for touched content while avoiding unrelated baseline drift failures.
- If baseline drift appears, run one-time normalization in a dedicated docs PR:
  - `npx prettier -w "**/*.md" ".github/ISSUE_TEMPLATE/*.yml"`
- After normalization, keep strict changed-path docs checks enabled in CI.

## Current Focus

The current active workstream is defined in:

- `docs/archive/versioned/v04-planning-track.md`
- `docs/archive/versioned/v04-priority-queue.md`

Use those files for execution order.
Use this playbook for how to execute the work cleanly.
