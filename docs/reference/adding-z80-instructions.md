# Adding Z80 Instructions (Contributor Guide)

Status: contributor workflow for extending the Z80 instruction set in ZAX. This is intentionally
practical and source-driven; it describes the current path through parser, encoder registry, and
tests without proposing new architecture.

## 1. Decide what kind of change you are making

Start by classifying the change. Each category has a different minimum set of updates.

### A. New mnemonic, existing operand shapes

Example: adding another control instruction that uses the same operand patterns already supported.

You typically only need:

- encoder registry entry (`src/z80/encoderRegistry.ts`)
- encoder family logic (`src/z80/encode*.ts`)
- backend tests (`test/backend/`)

### B. Existing mnemonic, new operand form

Example: a new indexed or register form for an existing instruction.

You typically need:

- encoder family updates (operand matching and encoding)
- negative tests for unsupported forms (to preserve diagnostics)

### C. New operand syntax or token

Example: new register token, new port form, or a new EA syntax feature.

You typically need:

- `src/frontend/grammarData.ts` (register lists, matcher types, keyword sets)
- `src/frontend/parseOperands.ts` or `parseAsmInstruction.ts`
- encoder updates (ensure the new AST operand shape is handled)
- parser tests if new grammar was introduced

## 2. Parser and grammar touchpoints

The ASM instruction head is parsed generically; the parser is only special for a few heads:

- `parseAsmInstruction.ts` handles `step`, `in`, and `out` as special cases.
- `parseOperands.ts` defines operand parsing and EA syntax; new operand forms land here.
- `grammarData.ts` owns register lists, matcher kinds, and operand classes used by parsing and
  validation.

If the mnemonic itself is new but operands are already supported, you usually do not need to change
parsing. If the operands are new, add the parser support first so tests can exercise the encoder.

## 3. Encoder registry wiring

`encodeInstruction` in `src/z80/encode.ts` dispatches by mnemonic using the registry in
`src/z80/encoderRegistry.ts`.

Add the mnemonic to one of:

- `ZERO_OPCODE_REGISTRY` if it is fixed bytes and takes no operands.
- `FAMILY_SPECS` if it belongs to an existing encoder family.

If you need a new family:

- add a new family tag in `EncoderFamily`
- add a registry entry in `FAMILY_SPECS`
- implement `encode<Family>Instruction` and wire it into `encodeFamilyInstruction` in `encode.ts`

Pick an appropriate fallback mode:

- `none` when the mnemonic has no fallback or when the family handles all errors.
- `standard` when the family only encodes supported forms and the fallback should emit generic
  operand diagnostics.
- `arity-short-circuit` for families that first validate arity before declaring unsupported forms.

## 4. Encoding logic

Encoder family functions live in `src/z80/encode*.ts`. Extend the existing family if the mnemonic is
similar, or add a new family if operand rules are distinct.

When adding operand forms:

- keep diagnostics consistent (unsupported forms should return `undefined` and add a message)
- maintain `imm8`/`imm16` range checks (`encode.ts` helpers)
- ensure indexed and register forms are encoded consistently across families

## 5. Minimum test expectations

Use existing backend tests as the baseline:

- `test/backend/pr477_encode_*_family.test.ts` for family coverage
- `test/backend/pr694_encoder_registry_dispatch.test.ts` for registry dispatch/fallback behavior
- `test/backend/pr680_asm_golden_contract.test.ts` for byte-level integration checks

At minimum add:

- a positive encoder test for the new mnemonic or operand form
- a negative test to preserve diagnostics for unsupported operand shapes

If the change affects ASM80 compatibility or emitted assembly, update or add coverage in:

- `test/cli/pr990_asm80_emitter_validation.test.ts`

## 6. Common pitfalls

- **Registry wiring**: forgetting to add the mnemonic to the registry yields a generic
  “Unsupported instruction” diagnostic.
- **Operand legality**: the encoder must reject invalid forms with a precise message; do not rely
  on parse errors for encoder-level legality.
- **Fallback diagnostics**: `arity-short-circuit` families skip generic errors when arity is valid.
  Make sure the family emits its own diagnostics in that case.
- **Indexed forms**: IX/IY operand encoding requires the indexed helpers in `encode.ts`.
- **Condition codes**: `grammarData.ts` controls allowed condition names; ensure consistency if you
  add new mnemonic forms that accept `cc`.

## 7. Suggested implementation path

1. Add or extend parsing only if operand syntax is new.
2. Register the mnemonic in `encoderRegistry.ts`.
3. Implement or update the encoder family in `encode*.ts`.
4. Add backend tests first (positive and negative).
5. Update ASM80 verification tests if emitted assembly changes.

## 8. Where to look when something breaks

- Unsupported instruction error: `encode.ts` registry lookup.
- Incorrect opcode: the encoder family file or helper in `encode.ts`.
- Operand parsing mismatch: `parseOperands.ts`.
- Registry or fallback diagnostics: `encoderRegistry.ts` and `encode.ts`.

