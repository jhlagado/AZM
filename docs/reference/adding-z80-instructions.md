# Adding Z80 Instructions (Contributor Guide)

Status: current contributor workflow for extending the Z80 instruction set in
AZM. This is intentionally practical and source-driven; it describes the
current path through parser, encoder, effects, and tests without proposing new
architecture.

## 1. Decide what kind of change you are making

Start by classifying the change. Each category has a different minimum set of updates.

### A. New mnemonic, existing operand shapes

Example: adding another control instruction that uses the same operand patterns already supported.

You typically only need:

- parser acceptance if the mnemonic is not already recognized
- encoder logic (`src/z80/encode.ts`)
- unit or integration tests under `test/`

### B. Existing mnemonic, new operand form

Example: a new indexed or register form for an existing instruction.

You typically need:

- encoder family updates (operand matching and encoding)
- negative tests for unsupported forms (to preserve diagnostics)

### C. New operand syntax or token

Example: new register token, new port form, or a new EA syntax feature.

You typically need:

- `src/z80/parse-instruction.ts` for operand parsing
- `src/z80/instruction.ts` if the instruction model needs a new operand shape
- `src/z80/encode.ts` so the new operand shape is handled
- parser tests if new grammar was introduced

## 2. Parser and grammar touchpoints

The ASM instruction head is parsed generically. Operand parsing and instruction
shape construction live in `src/z80/parse-instruction.ts`; operand and
instruction types live in `src/z80/instruction.ts`.

If the mnemonic itself is new but operands are already supported, you usually do not need to change
parsing. If the operands are new, add the parser support first so tests can exercise the encoder.

## 3. Encoder wiring

`encodeInstruction` in `src/z80/encode.ts` dispatches by mnemonic and operand
shape. Add fixed-byte and family-specific behavior there, keeping unsupported
forms diagnostic rather than silently accepted.

## 4. Encoding logic

Encoder behavior lives in `src/z80/encode.ts`. Extend the nearest existing
family-style branch if the mnemonic is similar, or add a narrow helper if the
operand rules are distinct.

When adding operand forms:

- keep diagnostics consistent (unsupported forms should return `undefined` and add a message)
- maintain `imm8`/`imm16` range checks (`encode.ts` helpers)
- ensure indexed and register forms are encoded consistently across families

## 5. Minimum test expectations

Use existing Z80 and assembler tests as the baseline. At minimum add:

- a positive encoder test for the new mnemonic or operand form
- a negative test to preserve diagnostics for unsupported operand shapes

If the change affects the ASM80 baseline or emitted assembly, update or add coverage in:

- `test/cli/pr990_asm80_emitter_validation.test.ts`

## 6. Common pitfalls

- **Parser acceptance**: forgetting to accept a mnemonic or operand shape yields
  a parse diagnostic before encoding can run.
- **Operand legality**: the encoder must reject invalid forms with a precise message; do not rely
  on parse errors for encoder-level legality.
- **Diagnostics**: make sure unsupported but parseable forms produce precise
  encoder diagnostics.
- **Indexed forms**: IX/IY operand encoding requires the indexed helpers in `encode.ts`.
- **Condition codes**: condition parsing lives in `src/z80/parse-instruction.ts`;
  ensure consistency if you add new mnemonic forms that accept `cc`.

## 7. Suggested implementation path

1. Add or extend parsing only if operand syntax is new.
2. Add or update the encoder branch in `src/z80/encode.ts`.
3. Update register/flag effects in `src/z80/effects.ts` when register contracts need
   to understand the instruction.
4. Add backend tests first (positive and negative).
5. Update ASM80 verification tests if emitted assembly changes.

## 8. Where to look when something breaks

- Unsupported instruction error: `src/z80/encode.ts`.
- Incorrect opcode: the encoder family file or helper in `encode.ts`.
- Operand parsing mismatch: `src/z80/parse-instruction.ts`.
- Register contracts effect mismatch: `src/z80/effects.ts`.
