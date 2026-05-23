# AZM Next Finalization Stage 3 Evidence: Visible-Op Selection Diagnostics

Status: complete (2026-05-23)

## Purpose

Stage 3 closes the visible-op selection and cycle diagnostics that still kept
three root fixtures outside the supported differential corpus.

Before this stage:

- `pr16_op_cycle.asm` was still unsupported because the cycle diagnostic only
  showed bare op names without declaration locations.
- `pr267_op_ambiguous_incomparable.asm` and
  `pr268_op_no_match_diagnostics.asm` were still unsupported because AZM Next
  collapsed visible-op overload diagnostics into one-line summaries without
  call-site operands, per-overload location tags, or multiline candidate lists.
- `docs/next/parity-matrix.md` still treated `Op overload matching` as `partial`
  because `pr268_op_no_match_diagnostics.asm` remained outside the supported
  root corpus.

## Changes Made

- Extended `src/core/op-expansion.ts` so every collected `OpDecl` carries its
  declaration source file and line.
- Updated visible-op diagnostics to use legacy-style multiline formatting for:
  - no-match overload selection
  - ambiguous overload selection
  - cyclic expansion chains
- Added focused integration coverage in
  `test/integration/stage-3-visible-op-diagnostics.test.ts`.
- Strengthened the existing Stage 9 checks in
  `test/integration/minimal-assembler.test.ts` to assert the richer message
  structure.
- Removed `pr16_op_cycle.asm`, `pr267_op_ambiguous_incomparable.asm`, and
  `pr268_op_no_match_diagnostics.asm` from
  `test/differential/unsupported-fixtures.ts`.

## Validation

Validated with:

```sh
npx vitest run test/integration/stage-3-visible-op-diagnostics.test.ts
npx vitest run test/integration/minimal-assembler.test.ts -t "reports Stage 9 parameterized op no-match diagnostics|reports ambiguous Stage 9 parameterized op overloads|reports Stage 9 op expansion cycles"
npx vitest run test/differential/root-fixture-corpus.test.ts
```

Observed result after the stage:

- the focused visible-op diagnostic tests pass
- the strengthened Stage 9 message assertions pass
- the root differential corpus accepts the three newly-supported fixtures and
  remains green with the updated roster

## Outcome

The supported root differential corpus grows from 63 fixtures to 66 fixtures,
and the unsupported roster drops from 24 fixtures to 21 fixtures.

`Op overload matching` can now move from `partial` to `compatible` in the live
parity matrix. The remaining visible-op differential gaps are now limited to the
three invalid-expansion fixtures, which still need a deeper encoder-context
bridge.