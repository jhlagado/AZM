# AZM Next Stage 14 Evidence: Register-Care Parity Slice A

Status: in progress

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

## Deferred / Out of Scope in this Slice

- full output-candidate auto-fix generation and suggestion-edit behavior remains deferred.
- control-flow-sensitive and full-register-effect precision remains intentionally bounded for this slice:
  - conflict checking is currently limited to direct `call` and `call-cc` boundaries where callee target resolves to a symbol.
  - instruction effects are conservative but incomplete for a large portion of the Z80 catalog; unsupported mnemonics may still miss conflicts until later stages.
  - `registerCareProfile` is accepted/preserved but intentionally not interpreted in this stage.
