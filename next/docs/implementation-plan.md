# AZM Next Greenfield Implementation Plan

Status: active implementation plan

## Goal

Build `next/` into a complete AZM workalike that can replace the current
implementation after differential verification against current AZM tests,
fixtures, and corpus comparisons.

## Architecture

AZM Next is a flat assembler pipeline:

```text
source text
  -> logical lines
  -> parsed source items
  -> semantic symbols/constants/layouts
  -> canonical visible assembly
  -> assembly image
  -> serialized outputs
```

The current AZM implementation is the behavioral oracle. Its internal module
structure is not copied.

## Replacement Scope

AZM Next keeps:

- ASM80-class flat Z80 assembly
- directive aliases
- AZMDoc metadata
- register-care contracts
- visible `op` expansion
- enums
- compile-time layout constants
- BIN, HEX, listing, D8, and lowered Z80 output

AZM Next does not keep high-level ZAX source behavior: functions, modules,
imports, generated stack frames, typed assignment, structured control, or
runtime typed effective-address lowering.

## Stage 1: Compatibility Harness

Status: implemented skeleton. The current-AZM runner is an explicit placeholder
and the first differential test is skipped until the runner invokes current AZM.

Purpose: make current AZM usable as the oracle for AZM Next.

Files:

- `next/test/differential/compare-results.ts`
- `next/test/differential/current-azm-runner.ts`
- `next/test/differential/next-azm-runner.ts`
- `next/test/differential/minimal.fixture.test.ts`
- `next/scripts/diff-against-current.mjs`

Completed:

- [x] Defined a comparison result shape.
- [x] Added the AZM Next runner wrapper.
- [x] Added the current AZM runner interface.
- [x] Added the first skipped differential fixture.
- [x] Verified with `npm run next:check`.

Next work:

- [ ] Implement the current AZM runner by invoking the current CLI or package
      API in an isolated temp directory.
- [ ] Unskip the first differential fixture once current output is captured.

## Stage 2: Source and Logical Lines

Status: implemented initial scanner for in-memory source text.

Purpose: convert source text into logical lines with stable source names and
line numbers.

Files:

- `next/src/source/source-file.ts`
- `next/src/source/source-span.ts`
- `next/src/source/logical-lines.ts`
- `next/test/unit/source/logical-lines.test.ts`

Completed:

- [x] Added the source file model.
- [x] Added the source span model.
- [x] Added logical-line scanning with CRLF/CR normalization.
- [x] Added unit coverage for line numbers and trailing newline handling.
- [x] Verified with `npm run next:check`.

Next work:

- [ ] Add include expansion with provenance.
- [ ] Add richer source spans for parsed tokens.

## Stage 3: Minimal Flat Assembler

Status: implemented initial slice.

Purpose: prove the replacement architecture with a small real assembler path.

Files:

- `next/src/model/expression.ts`
- `next/src/model/source-item.ts`
- `next/src/model/symbol.ts`
- `next/src/model/section.ts`
- `next/src/syntax/parse-expression.ts`
- `next/src/syntax/parse-line.ts`
- `next/src/assembly/assemble-program.ts`
- `next/src/outputs/hex.ts`
- `next/src/core/compile.ts`
- `next/test/integration/minimal-assembler.test.ts`

Completed:

- [x] Added parser support for blank lines, comments, labels, canonical `.org`,
      `.equ`, `.db`, `.dw`, `.ds`, `NOP`, `RET`, and `LD A,n`.
- [x] Added built-in alias normalization for `ORG`, `EQU`, `DB`, `DW`, and
      `DS` before canonical directive parsing.
- [x] Preserved strict case sensitivity for programmer-defined symbols while
      accepting mixed-case directive aliases and instruction mnemonics.
- [x] Added expression support for decimal, trailing-`H` hex, `0x` hex, and
      symbol references.
- [x] Added assembly support for symbols, emitted bytes, and the first HEX
      writer.
- [x] Added diagnostics for unsupported source lines and unknown symbols.
- [x] Verified the first milestone fixture:

```asm
        .org 0100H
VALUE   .equ 42
START:
        LD A,VALUE
        RET
```

Expected bytes:

```text
3E 2A C9
```

Expected symbols:

```text
VALUE = 42
START = 0100H
```

Next work:

- [ ] Add forward references through explicit fixups.
- [ ] Add range diagnostics for byte values and storage sizes.
- [ ] Split parser responsibilities further as the surface grows.

## Stage 4: Expressions, Symbols, and Fixups

Status: explicit fixup slice implemented for the minimal Stage 4 surface.

Purpose: make expression evaluation and symbol resolution robust enough for real
assembler source.

Evidence:

- `next/docs/stage-4-evidence.md`

Completed:

- [x] Inspected current AZM tests, fixtures, docs, and AZM book examples for
      expression, symbol, forward-reference, and fixup behavior.
- [x] Documented proven behavior and the staged implementation plan.
- [x] Added expression parsing for decimal, `$` hex, `%` binary, `0x`, `0b`,
      trailing `H`/`B`, one-character quoted literals, unary operators, binary
      operators, parentheses, and current location `$`.
- [x] Added expression evaluation for the existing minimal assembler path.
- [x] Added deferred resolution for forward equates and labels in `.db`, `.dw`,
      `.equ`, `.ds`, `.org`, and `LD A,n`.
- [x] Added diagnostics for unknown symbols, recursive symbols, divide by zero,
      and modulo by zero.
- [x] Added `next/src/model/fixup.ts` with explicit ABS16 and REL8 records.
- [x] Added forward-reference patching for `.dw`, `JP`, `CALL`, `JR`,
      conditional `JR`, and `DJNZ`.
- [x] Added unresolved-symbol fixup diagnostics and REL8 `-128..127` range
      diagnostics.
- [x] Verified with `npm run next:check`.

Planned work:

- Add byte-value and storage-size range diagnostics for directives.
- Add sparse image/range handling before supporting multiple `.org` regions.
- Extend fixups only as each additional instruction family is proven by current
  AZM tests or corpus fixtures.

## Stage 5: Z80 Instruction Parser and Encoder

Status: pure parser/encoder foundation started.

Purpose: build the Z80 subsystem as a pure instruction library.

Planned work:

- Add instruction and operand models under `next/src/z80/`.
- Add instruction-family encoders for LD, ALU, control, bit, I/O, and core ops.
- Add parser coverage for Z80 operand forms.
- Keep encoder API pure: instruction in, bytes/fixups/diagnostics out.
- Port behavior through tests rather than copying current modules directly.

Completed first slice:

- [x] Inspected current AZM tests, fixtures, docs, and AZM book examples for the
      retained Z80 instruction surface.
- [x] Documented the proven surface and first implementation boundary in
      `next/docs/stage-5-evidence.md`.
- [x] Added a pure `next/src/z80` instruction model, parser, and byte-template
      encoder for `NOP`, `RET`, `LD A,n`, `JP`, `CALL`, `JR`, conditional `JR`,
      and `DJNZ`.
- [x] Wired the minimal assembler through the pure Z80 encoder while leaving
      expression evaluation and fixup patching in the assembly layer.
- [x] Added the first LD parser/encoder slice for `ld r,n`, `ld r,r`,
      `ld rr,nn`, `ld r,(hl)`, `ld (hl),r`, and accumulator-only `(BC)/(DE)`
      forms.
- [x] Added the first ALU parser/encoder slice for `SUB`, `AND`, `OR`, `XOR`,
      and `CP` with register, immediate, and `(HL)` operands.
- [x] Added the explicit accumulator parser/encoder slice for `ADD`, `ADC`,
      and `SBC` with register, immediate, and `(HL)` source operands.
- [x] Added the 16-bit `HL` arithmetic parser/encoder slice for `ADD HL,ss`,
      `ADC HL,ss`, and `SBC HL,ss`.
- [x] Added the first core-ops parser/encoder slice for `DI`, `EI`, `SCF`,
      `CCF`, `CPL`, `EX DE,HL`, `EX (SP),HL`, `EXX`, and `HALT`.
- [x] Added the IM/RST interrupt-state parser/encoder slice for `IM 0/1/2`,
      numeric constant `RST` vectors, `RETI`, and `RETN`.
- [x] Added the conditional control-flow and indirect `JP` parser/encoder slice
      for `RET cc`, `JP cc,nn`, `CALL cc,nn`, and `JP (HL/IX/IY)`.
- [x] Added the non-displacement `INC`/`DEC`/`PUSH`/`POP` core-ops
      parser/encoder slice, including half-index registers and `IX`/`IY`
      stack pairs.
- [x] Added the indexed addressing foundation slice for `(IX+d)` / `(IY+d)`
      memory operands across the first `LD`, ALU, `INC`, and `DEC` forms.
- [x] Added the indexed `LD` half-register and direct-register slice for
      `IXH`/`IXL`/`IYH`/`IYL`, `LD IX/IY,nn`, and `LD SP,HL/IX/IY`.
- [x] Added the absolute-memory `LD` and `I`/`R` transfer slice for
      `A`/`HL`/`BC`/`DE`/`SP`/`IX`/`IY` absolute loads and stores plus
      `LD I,A`, `LD A,I`, `LD R,A`, and `LD A,R`.

## Stage 6: Directives, Storage, Strings, Ranges, and Image

Status: not started.

Purpose: support real ASM80-style source files and stable output images.

Planned work:

- Extend directive-head aliases beyond the initial built-in Stage 3 set.
- Implement `.align`, `.cstr`, `.pstr`, `.istr`, `.end`, and binary range
  controls.
- Add output image and byte-range models.
- Add BIN writer coverage.
- Start differential checks for simple ASM80 programs.

## Stage 7: Enums and Layout Constants

Status: not started.

Purpose: add retained AZM compile-time metadata without recreating a type
system.

Planned work:

- Implement enum constants and qualified enum members.
- Implement `.type`, `.union`, `.field`, `.byte`, `.word`, and `.addr` in layout
  blocks.
- Implement `sizeof(...)`, `offset(...)`, and layout casts as constant folding
  only.
- Reject runtime typed memory behavior.

## Stage 8: Visible `op` Expansion

Status: not started.

Purpose: expand retained `op` declarations into canonical visible assembly.

Planned work:

- Parse op declarations and matcher parameters.
- Select overloads deterministically.
- Substitute operands into op bodies.
- Rename local labels to prevent collisions.
- Feed expanded items into the same canonical stream used by assembly and
  register-care.

## Stage 9: Outputs, CLI, and Public API Parity

Status: not started.

Purpose: make AZM Next usable through the same user-facing surfaces as current
AZM.

Planned work:

- Implement lowered `.z80`, listing, and D8 output.
- Implement Node filesystem host and CLI argument parsing.
- Mirror package API smoke tests for AZM Next.
- Compare public output contracts against current AZM.

## Stage 10: Register-Care, Burn-In, and Promotion

Status: not started.

Purpose: finish retained AZM analysis behavior and prove replacement readiness.

Planned work:

- Parse AZMDoc register-care contracts.
- Detect routine boundaries from canonical visible assembly.
- Share Z80 effects with encoder metadata.
- Analyze expanded op bodies through the canonical stream.
- Match retained register-care audit behavior.
- Run corpus comparisons where local corpora are available.
- Update `next/docs/parity-matrix.md` after each compatibility class is
  verified.
- Check `next/docs/promotion-criteria.md` before proposing promotion.

## Verification Baseline

Run after each stage:

```sh
npm run next:check
npx prettier -c "next/**/*.{md,json,ts,mjs}"
git diff --check -- next
```

When a stage touches compatibility behavior, also run the stage's differential
tests and update `next/docs/parity-matrix.md`.
