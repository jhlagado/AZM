# AZM Next Finalization Plan

Status: active referent for feature-complete cutover work

## Purpose

This document is the single working referent for finishing AZM Next to the
point where it can replace the legacy AZM implementation without surprise.

Use it when deciding:

- what must be complete before cutover is attempted
- which remaining gaps are feature-completeness blockers versus cleanup
- which validation steps happen before and after feature completeness
- how to sequence final PR-sized slices

Historical stage delivery remains documented in `implementation-plan.md` and
the stage evidence files. This document is the live completion backlog.

## Source Hierarchy

Read these together, in this order:

1. `source-of-truth.md` for behavior authority
2. `architecture.md` for intended module boundaries and pass products
3. `parity-matrix.md` for observable compatibility status
4. `promotion-criteria.md` for promotion gate wording
5. this document for the remaining work order and cutover definition

## Completion Goal

AZM Next is feature complete for cutover when:

- retained AZM behavior is either implemented and evidence-backed or explicitly
  classified as out of scope
- no compatibility gap remains that could surprise real assembler users at
  cutover time
- package, CLI, and artifact outputs are covered by stable contract tests
- the repo layout and quality gates match the documented design closely enough
  that follow-on maintenance is predictable

Feature complete does not require every cleanup to be perfect. It does require
that known gaps are small, explicit, and not capable of breaking the intended
first real-world validation programs.

## Cutover Blockers

These are blockers until closed or explicitly accepted:

- any remaining partial row in `parity-matrix.md` that affects source loading,
  visible assembly meaning, CLI behavior, or emitted artifact contracts
- the unsupported root fixture roster in `test/differential/unsupported-fixtures.ts`
  unless reduced to an explicitly accepted residue with written rationale
- mismatch between the written quality standard and enforced size gate
- module-boundary drift large enough to make the documented architecture
  misleading to maintainers
- transition duplication that obscures which implementation surface is real

## Remaining Workstreams

### 1. Truth and Gate Alignment

Goal: make the written quality standard and enforced guardrails agree.

Evidence:

- `finalization-stage-1-evidence.md`

Deliverables:

- reconcile the 500-line review trigger in `docs/reference/code-quality-standard.md`
  with the 750/1000 thresholds in `scripts/check-source-file-sizes.mjs`
- document which oversized files are intentionally allowed and why
- ensure the resulting policy is stable enough to enforce on future PRs

Exit condition:

- a contributor can read the standard and predict the behavior of the size gate

### 2. Architecture Map Alignment

Goal: make the physical source tree match `architecture.md`, or update the doc
where the physical layout is intentionally different.

Priority targets:

- move `core/op-expansion.ts` responsibility into `src/expansion/`
- extract layout and validation logic into `src/semantics/`
- move Node host responsibilities into `src/node/`
- split CLI adapter responsibilities into `src/cli/`
- resolve `src/outputs/` versus `src/formats/` duplication

Exit condition:

- the architecture document is a reliable map of the codebase a maintainer will
  actually open

### 3. Unsupported Fixture Burn-Down

Goal: reduce the unsupported differential roster until only consciously accepted
exceptions remain.

Evidence:

- `finalization-stage-2-evidence.md`
- `finalization-stage-3-evidence.md`

Priority order:

1. `visible-op-diagnostic`
2. `diagnostic-wording`

Exit condition:

- the unsupported roster is either empty or reduced to a small, explicitly
  approved remainder with written classification

### 4. CLI Contract Closure

Goal: remove surprise from the cutover CLI surface.

Deliverables:

- complete coverage for the remaining documented flag matrix
- lock down default artifact emission, output path behavior, and register-care
  flag handling
- ensure package-smoke and public-surface tests match the documented CLI/API
  contracts

Exit condition:

- the `CLI flags` row in `parity-matrix.md` can move from `partial` to
  `compatible`

### 5. Listing and D8 Output Parity

Goal: turn listing and D8 from emitted artifacts into evidence-backed artifact
contracts.

Deliverables:

- add golden comparisons or corpus-backed checks for listing output
- add shape and content parity checks for D8 debug metadata

Exit condition:

- `Listing output` and `D8 debug map` move to `compatible`

### 6. Lowered `.z80` Validation

Goal: close the last major emitted-artifact parity gap before real program
validation.

Deliverables:

- compare lowered `.z80` output against the current AZM path
- add validator-backed or corpus-backed checks where available

Exit condition:

- `Lowered .z80 output` moves to `compatible`, or an explicit approved boundary
  is written down

### 7. Large-File Decomposition

Goal: reduce concentrated maintenance risk in oversized coordinator files.

Priority targets:

- `src/core/op-expansion.ts`
- `src/register-care/analyze.ts`
- `src/assembly/assemble-program.ts`
- `src/assembly/expression-evaluation.ts`
- `src/cli.ts`

`src/z80/encode.ts` and `src/z80/parse-instruction.ts` may remain larger than
normal only if they are explicitly justified as dense encoder/parser tables.

Exit condition:

- the remaining large files are either split or deliberately justified in the
  quality policy

## Validation Sequence

Real-program validation comes after feature completeness, not before it.

Use this order:

1. close the feature-completeness blockers in this document
2. rerun guardrails, package smoke, and differential suites
3. validate AZM Next on real programs in this order:
   tetro
   paco
   MON3 monitor ROM software
4. compare the generated binary output against the legacy AZM assembler

If a real-program validation failure reveals a missing retained feature, that
work returns to the feature-completeness backlog before cutover proceeds.

## PR Slicing Rule

Execute finalization in small PR-sized slices.

Each slice should:

- close one clear gap or one tightly related group of gaps
- update parity or design docs when the observable status changes
- run the narrowest relevant validation first, then the broader guardrail lane
- include a review pass focused on regressions, hidden scope growth, and
  evidence coverage

## Definition of Ready for Cutover Attempt

Attempt the repository-root switch only when all of the following are true:

- no unapproved feature-completeness blocker remains in this document
- parity rows that matter for user-visible behavior are `compatible`
- the unsupported differential roster is explicitly accepted or empty
- CLI, package, listing, D8, and lowered `.z80` contracts have evidence-backed
  validation
- quality and architecture docs are trustworthy maps of the live codebase
- the real-program validation order for tetro, paco, and MON3 is queued next

This definition exists to prevent a nominal cutover with hidden compatibility
surprises.