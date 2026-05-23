# AZM Next Stage 15 Evidence: Retained Language Parity Closeout

Status: complete

## Scope and Evidence

- `next/test/integration/stage-15-evidence.test.ts`
- `next/src/outputs/write-asm80.ts`
- `next/src/api-compile.ts` (source expansion + asm80 emission integration)
- `next/src/cli.ts` (artifact output pathing for `.z80`)
- `next/test/integration/minimal-assembler.test.ts` (layout casts + op-local-label fixtures)
- `next/docs/parity-matrix.md` (Stage 15 audit)

## Proven Current AZM Behavior Used

- `--asm80` currently requests `.z80` lowered output from a successful compile.
- ASM80 lowering behavior is file-based and should be emitted for entry + includes
  reachable from include graph expansion.
- Source provenance is useful for diagnosing errors, so file boundaries are kept
  in the emitted lowering output.

## Implemented Slice Boundary

- Added a Stage-15 lowering writer (`next/src/outputs/write-asm80.ts`) that
  emits a headered ASM80 artifact from source text.
- Wired compile API assembly to emit `asm80` artifacts when `emitAsm80` is true
  using expanded source text from the loader's `sourceTexts` map.
- Ensured CLI writes `.z80` output when an `asm80` artifact is present.
- Added integration evidence test:
  - `next/test/integration/stage-15-evidence.test.ts`
  - Asserts successful diagnostics for includes and constants.
  - Verifies emitted `asm80` artifact contains header, source markers, and emitted
    source lines from entry + include files.
  - Verifies output is no longer the previous empty-header stub text.

## Parity matrix closeout (Stage 15)

- Audited all rows in `next/docs/parity-matrix.md`.
- Classified retained language and output surfaces backed by Stages 4–14 evidence
  and the 56-fixture root differential gate as `compatible` where integration tests
  and corpus comparisons agree with current AZM.
- Left `partial` only for lowered `.z80` golden parity, listing/D8 golden parity,
  and exhaustive CLI contract mirroring (documented with reasons).

## Deferred / Out of Scope

- Canonical instruction-level lowering transformations and normalization passes.
- `--asm80` golden comparisons against current assembler lowered-text fixtures.
- Any lowered-text rewriting beyond expanded source passthrough.

## Additional parity items closed in earlier slices

- Layout casts are proven compatible for constant folding and runtime-rejected paths:
  - `next/test/integration/minimal-assembler.test.ts`
- Op expansion local labels are proven compatible:
  - `next/test/integration/minimal-assembler.test.ts` (`renames Stage 9 op-local labels per invocation`)
