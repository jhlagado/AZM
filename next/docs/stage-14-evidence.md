# AZM Next Stage 14 Evidence: Register-Care Parity Slice A

Status: complete

## Evidence Inspected

- `test/cli/register_care_cli.test.ts`
- `test/registerCare/smartComments.test.ts`
- `src/registerCare/smartComments.ts`
- `src/registerCare/analyze.ts`
- `src/registerCare/carriers.ts`

## Proven Current AZM Behavior Used

- Register-care CLI accepts `--register-care`/`--rc` values `off|audit|warn|error|strict`.
- Register-care artifact/request flags exist: `--emit-register-report` (`--reg-report`),
  `--emit-register-interface` (`--reg-interface`), `--contracts` and `--fix`,
  `--accept-register-output` (`--accept-out`), and `--interface`.
- CLI accepts register-care flags even when primary ASM output is disabled, allowing
  care-only workflows.
- `--accept-out` uses `ROUTINE:carriers` and validates:
  - malformed syntax (`MASK:A`, missing `:`)
  - missing routine name (`:A`)
  - missing carriers (`MASK:A,`)
  - unknown carriers (`MASK:Q`)
- `.asmi` interfaces are strict:
  - only one declaration per line
  - no comments allowed
  - malformed lines are reported with line numbers and file name
  - only `.asmi` extension is accepted in current CLI path

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

## Deferred / Out of Scope in this Slice

- register-care summaries, contracts emission, and full conflict/liveness analysis.
- source rewrite/fixup behavior (`--fix`, contract annotations, `--contracts`).
- AZMDoc integration with loaded routines and canonical instruction effects.
