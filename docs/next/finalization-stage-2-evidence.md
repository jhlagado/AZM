# AZM Next Finalization Stage 2 Evidence: Include Diagnostic Parity

Status: complete (2026-05-23)

## Purpose

Stage 2 closes the last include-provenance item on the unsupported root fixture
roster.

Before this stage:

- `test/differential/unsupported-fixtures.ts` still excluded
  `pr950_bad_include_entry.asm` in an `include-directive` bucket.
- the live include-expansion path already preserved included-file provenance,
  but AZM Next diagnosed the included `LD A, ?` operand as `unknown symbol: ?`
  and then `invalid LD operands: a, ?` instead of matching legacy AZM's
  immediate-parse diagnostics.
- `docs/next/parity-matrix.md` still treated include provenance as `partial`
  because that fixture remained outside the supported root differential corpus.

## Changes Made

- Tightened `src/syntax/parse-expression.ts` so lone `?` no longer tokenizes as
  an expression symbol.
- Extended `src/z80/parse-instruction.ts` to surface the legacy two-diagnostic
  path for `LD` operands that reduce to lone `?`:
  - `Invalid imm expression: ?`
  - `Unsupported operand: ?`
- Updated `src/syntax/parse-line.ts` so instruction parsing can return multiple
  diagnostics for one source line when the legacy oracle does.
- Added a focused compile-facing regression test in
  `test/integration/minimal-assembler.test.ts`.
- Removed `pr950_bad_include_entry.asm` from
  `test/differential/unsupported-fixtures.ts` and updated the live parity and
  finalization docs.

## Validation

Validated with:

```sh
npx vitest run test/unit/syntax/expression.test.ts
npx vitest run test/integration/minimal-assembler.test.ts -t "legacy invalid immediate diagnostics for lone question-mark LD operands"
npx tsx --eval "import { runCurrentAzmFixture } from './test/differential/current-azm-runner.ts'; import { runNextAzmFixture } from './test/differential/next-azm-runner.ts'; void (async () => { const fixture = './test/fixtures/pr950_bad_include_entry.asm'; const includeDirs = ['./test/fixtures/includes']; const [current, next] = await Promise.all([runCurrentAzmFixture(fixture, includeDirs), runNextAzmFixture(fixture, includeDirs)]); console.log(JSON.stringify({ current, next }, null, 2)); })();"
```

Observed result after the stage:

- the focused unit and compile-facing tests pass
- current AZM and AZM Next now match for `pr950_bad_include_entry.asm`
- both runners report the same diagnostics from the included file:
  - `Invalid imm expression: ?`
  - `Unsupported operand: ?`

## Outcome

The unsupported fixture burn-down no longer has an `include-directive` bucket.
Include provenance can now move from `partial` to `compatible` in the live
parity matrix, and the supported root differential corpus grows from 62 to 63
fixtures.

The remaining unsupported fixtures are now concentrated in two deliberate
classes:

- `visible-op-diagnostic`
- `diagnostic-wording`