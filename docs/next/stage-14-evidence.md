# AZM Next Stage 14 Evidence: Register-Care Parity Slice A

Status: complete

## Evidence Inspected

- `next/test/unit/register-care/smartComments.test.ts`
- `next/test/unit/register-care/accept-output.test.ts`
- `next/src/register-care/carriers.ts`
- `next/src/register-care/smartComments.ts`
- `next/src/register-care/analyze.ts`
- `next/test/integration/stage-14-compile-api.test.ts`
- `next/test/integration/stage-14-cli.test.ts`

## Proven Current AZM Behavior Used

- Register-care CLI accepts `--register-care`/`--rc` values `off|audit|warn|error|strict`.
- Register-care artifact/request flags exist: `--emit-register-report` (`--reg-report`),
  `--emit-register-interface` (`--reg-interface`), `--contracts` and `--fix`,
  `--accept-register-output` (`--accept-out`), and `--interface`.
- CLI accepts register-care flags even when primary ASM output is disabled, allowing
  care-only workflows.
- `--accept-out` uses `ROUTINE:carriers` and validates:
  - malformed syntax (`MASK`, missing routine name, unknown carriers, missing `:`)
  - missing routine name (`:A`)
  - missing carriers (`MASK:A,`)
  - unknown carriers (`MASK:Q`)
- `.asmi` interfaces are strict:
  - only one declaration per line
  - no comments allowed
  - malformed lines are reported with line numbers and file name
  - only `.asmi` extension is accepted in current CLI path
- Annotation artifact emission (`register-care-annotations`) is implemented:
  - inference results can be emitted as rewritten source text.
  - `--contracts`/`--fix` and `emitRegisterAnnotations` generate source-comment blocks.
  - CLI writes updated files when this artifact is present.
- `--fix` and `fixRegisterContracts` are accepted in both CLI and API compile paths and force
  annotation artifacts to be generated.

## Implemented Slice Boundary

- Added register-care parsing scaffolding to API options (`next/src/api-compile.ts`):
  - register-care options are accepted and passed through.
  - `--accept-out` candidates are syntax-validated.
  - `.asmi` interface files are extension-checked.
  - `.asmi` interface text is parsed and validated; malformed interfaces throw.
- Extended CLI argument parser with register-care flags and value validators
  (`next/src/cli.ts`):
  - `--register-care/--rc`
  - `--accept-register-output/--accept-out`
  - `--interface`
  - `--reg-report/--emit-register-report`
  - `--reg-interface/--emit-register-interface`
  - `--contracts/--annotate-register-contracts`
  - `--fix`
  - `--reg-profile/--register-profile`
- Added parser-level tests under `next/test/unit/register-care` for:
  - contract carrier parsing
  - interface parse/contract errors
  - accept-out validation and dedupe semantics
- Added evidence tests under `next/test/integration` for CLI and compile API outcomes:
  - malformed `--accept-out`
  - invalid `.asmi` contracts
  - non-`.asmi` interface extension handling
  - register-care annotation emission and accepted-output promotion
- Added source-comment generation in `next/src/register-care/analyze.ts`:
  - generate `;! in ...`, `;! out ...`, and `;! preserves ...` lines at routine entry boundaries.
  - emit per-file rewritten text under `RegisterCareAnnotationsArtifact` when enabled.
- Wired annotation artifacts into `next/src/api-compile.ts` and `next/src/cli.ts`.
- Added register-care inference and conflict slice in `next/src/register-care/analyze.ts`:
  - inferred routine `mayRead`/`mayWrite` from conservative Z80 instruction effects.
  - built summary map for routine aliases using `entryLabels`.
  - added interface-backed extern summaries so `.asmi` contracts participate in conflict analysis even for missing bodies.
  - built backward liveness and detected direct-call output conflicts.
  - emitted conflict diagnostics in warn/error/strict modes with message:
    `CALL <target> may modify ... , but the pre-call value is used later.`
  - strict mode emits unknown-boundary warnings:
    `Register-care cannot prove <target>; add a routine body or .asmi extern contract.`
  - report model now includes `unknownCalls`.
- Added `next/test/integration/stage-14-compile-api.test.ts` cases for:
  - warn-mode conflict diagnostics,
  - error-mode conflict diagnostics,
  - strict unknown-boundary diagnostics and unknown-call report section.
- Added `next/test/integration/stage-14-cli.test.ts` cases for:
  - warn-mode conflict exit code and warning text,
  - error-mode conflict exit code and error text,
  - strict unknown-boundary warning text.
- Added mon3 RST profile plumbing in `next/src/register-care/profiles.ts`,
  `next/src/register-care/boundaryHints.ts`, and `next/src/register-care/analyze.ts`:
  - `rst $10` generic and service-aware boundaries are resolved via profile summaries.
  - immediate `ld c, <symbol>` before `rst $10` is treated as a service hint and can
    resolve to `RST_$10:API_SCANKEYS`.
  - profile boundaries participate in liveness, conflicts, and output-candidate detection.
- Updated register-care reporting in `next/src/register-care/report.ts`:
  - report now includes `Profile: <name>`.
  - report now includes `Output candidates:` with call-site/line detail.
- Updated API plumbing in `next/src/api-compile.ts` to pass `registerCareProfile`.
- Added conservative output-hint rewriting in `next/src/register-care/analyze.ts`:
  - computes per-call output-candidate fixability from immediate continuation reads.
  - emits `; expects out ...` when all candidate carriers are read by the next instruction.
  - emits `;!      maybe-out ...` when candidate carriers are not fully confirmed by immediate
    continuation.
  - adjusts insertion positions for annotation insertion shifts caused by routine comment rewrites.
- Added register-care report-summary evidence in next integration coverage:
  - introduced `next/test/integration/stage-14-register-care-summary.test.ts`
  - verified report artifacts enumerate called routines with inferred `reads`, `writes`,
    and `preserves` fields in successful compile flows
  - verified external `.asmi` interface contracts are merged into routine summaries in
    the emitted report text.
- Added Stage-14 tooling API slice:
  - Added `next/src/register-care/tooling.ts` adapter with tooling diagnostics model:
    - `RegisterCareCandidateDiagnostic`, `RegisterCareCodeAction`, and `AnalyzeRegisterCareForToolsResult`.
    - `analyzeRegisterCareForTools()` returning output candidates, candidate diagnostics,
      and quick-fix actions.
  - Re-exported tooling entry points from:
    - `next/src/api-tooling.ts`
    - `next/src/index.ts`
  - Added `autoFixable` to `RegisterCareOutputCandidate` so tooling consumers can
    determine safe auto-fix candidates.
  - Added `next/test/integration/stage-14-tooling-api.test.ts`:
    - confirms `autoFixable: true` is surfaced for direct continuation candidates,
      candidate diagnostics include code-action payloads,
      inferred terminal outputs do not emit candidates.

## Deferred / Out of Scope in this Slice

- full control-flow-aware auto-fix classification remains deferred:
  - this implementation only checks immediate continuation instructions for safe `expects out`.
  - `call-cc` and non-direct flows are not auto-promoted.
- control-flow-sensitive and full-register-effect precision remains intentionally bounded for this slice:
  - liveness remains linear/bounded and does not model multi-path control-flow or value relations.
  - instruction effects are conservative but incomplete for a large portion of the Z80 catalog; unsupported mnemonics may still miss conflicts until later stages.
  - `registerCareProfile` is interpreted for RST boundary names only at this stage.

## New Tests for This Slice Boundary

- `next/test/integration/stage-14-compile-api.test.ts`:
  - asserts `--fix` emits `register-care-annotations` containing `; expects out ...` for direct reads.
  - asserts `--fix` emits `;!      maybe-out ...` when candidate is not a direct continuation.
- `next/test/integration/stage-14-cli.test.ts`:
  - asserts source rewrite under `--fix` inserts direct `; expects out ...` hint.
  - asserts source rewrite under `--fix` inserts `;!      maybe-out ...` when needed.
