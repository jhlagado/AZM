# Lowered-Assembly Pipeline Plan (ASM80 Valid)

Status: historical plan — implementation complete. The `.asm` trace backend has been fully removed; `.z80` is now the only textual lowered-output artifact.

## Scope and fixed decisions

This note plans the implementation of a new assembler-valid backend product based on the agreed decisions:

- Introduce a new lowered-assembly product as the primary internal backend product.
- Keep the current trace `.asm` output as-is (separate, not assembler-valid).
- First real assembler backend target: ASM80.
- First ASM80-valid slice supports only:
  - labels
  - constants
  - `ORG`
  - `DB` / `DW` / `DS`
  - lowered instructions
- Preserved user comments are deferred.
- New assembler-valid output gets a distinct temporary artifact name initially.
- First implementation includes ASM80-based validation in tests/harnesses, not CLI invocation.
- First emitter may flatten to ordered `ORG`-anchored blocks.
- Synthetic names should be deterministic, readable, clearly ZAX-generated.
- First implementation uses a concrete ASM80 emitter with a clean seam (no generalized dialect framework).

## Current pipeline (where bytes and trace are formed)

### Pipeline entry

- `compile(...)` in `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/compile.ts` drives the pipeline.
- After parsing and env validation, it calls:
  - `emitProgram(...)` in `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/lowering/emit.ts`.
- `compile(...)` then passes the resulting `EmittedByteMap` + symbols to format writers:
  - `writeBin`, `writeHex`, `writeD8m`, `writeListing`, `writeAsm` in `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/formats/types.ts`.

### Byte map formation

- `emitProgram(...)` in `emit.ts` creates the primary byte maps:
  - `codeBytes`, `dataBytes`, `bytes` maps.
- It emits machine code directly during lowering via `encodeInstruction(...)` (see `emitInstr(...)` around `traceInstruction`).
- It accumulates fixups and per-section contribution buffers.
- Final merging happens in `finalizeEmitProgram(...)` in `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/lowering/emitFinalization.ts`, which calls:
  - `finalizeProgramEmission(...)` in `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/lowering/programLoweringFinalize.ts`.
- Base addresses, fixups, and `writeSection(...)` in `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/lowering/sectionLayout.ts` produce the final `EmittedByteMap.bytes`.

### Trace accumulation

- Trace is accumulated in `emit.ts`:
  - `traceInstruction(...)`, `traceLabel(...)`, `traceComment(...)` build `codeAsmTrace`.
- This `asmTrace` is a lowering trace only, not valid assembly.
- `writeAsm(...)` in `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/formats/writeAsm.ts` formats `asmTrace` into the current `.asm` artifact.

### Why current writer inputs are too lossy

- `EmittedByteMap` is a byte-address map with optional `asmTrace` text; it has no preserved directive ordering.
- `asmTrace` entries store only text, no original directive structure or re-emittable AST.
- `writeAsm(...)` emits a human-readable trace, not an assembler-valid stream (no `ORG`, `DB`, `DW`, `DS`, or constant declarations in the proper order).
- Fixups and symbol intent are resolved before formatting, so an assembler-valid output cannot be reconstructed from `EmittedByteMap` alone.

## New lowered-assembly product

### Proposed insertion point

We need two closely related lowered products because placement happens after the first lowering pass.

**Pre-placement lowered stream** (no ORG yet):

- Built inside `emitProgram(...)` after lowering decisions but before byte encoding.
- Captures ordered lowered items per section/key with unresolved bases.
- This is the earliest stable boundary where frontend AST is gone and semantic lowering is complete.

**Placed/anchored lowered program** (ORG-anchored):

- Built after placement/finalization, when bases and named-section placement are known.
- This is the assembler-valid product used by the ASM80 emitter.
- Compiler-owned startup init (from `finalizeEmitProgram(...)` via `buildStartupInitRegion(...)` / `buildStartupInitRoutine(...)`) must be injected here so ASM80 output matches the final emitted program.

Suggested flow:

1. Lowering constructs a new `LoweredAsmStream` (pre-placement structure).
2. A **placement pass** (after `finalizeProgramEmission(...)` and named-section placement) converts the stream into `LoweredAsmProgram` with ORG-anchored blocks.
3. Inject compiler-owned startup init into the placed program (same point it is currently appended in `finalizeEmitProgram(...)`).
4. A **byte-emission consumer** walks the placed `LoweredAsmProgram` to produce `EmittedByteMap` (same outputs as today).
5. A new **ASM80 emitter** walks the same placed `LoweredAsmProgram` to produce assembler-valid output.

This keeps the current binary/hex/d8m path stable while placing the assembler-valid product at the correct post-placement boundary.

### Minimum data shape (v1)

Proposed minimal structure (placed form):

```
LoweredAsmProgram {
  blocks: LoweredAsmBlock[]
  symbols: LoweredAsmSymbol[]   // optional for convenience in ASM80 emitter
}

LoweredAsmBlock {
  origin: number               // ORG address
  items: LoweredAsmItem[]
}

LoweredAsmItem =
  | { kind: 'label', name: string }
  | { kind: 'const', name: string, value: ImmExpr }
  | { kind: 'org', value: number }            // optional if origin is per-block
  | { kind: 'db', values: ImmExpr[] }
  | { kind: 'dw', values: ImmExpr[] }
  | { kind: 'ds', size: ImmExpr, fill?: ImmExpr }
  | { kind: 'instr', head: string, operands: LoweredOperand[] }
```

Notes:
- In v1, `org` can be implicit via `LoweredAsmBlock.origin` and omitted in item stream.
- `ImmExpr` and `LoweredOperand` should be a normalized lowered form, not frontend AST nodes. The goal is a stable backend contract.
- Deterministic synthetic labels should be generated in `emit.ts` where `traceLabel(...)` and `generatedLabelCounter` are already managed.

### Reuse candidates

- Existing section placement/layout logic (`sectionLayout.ts`, `sectionContributions.ts`) can still drive the final ORG ordering used to form blocks.
- The lowered operand and imm shapes should be small and purpose-built; reuse only the minimal imm-expression evaluator logic, not the full frontend AST surface.

## Consumer arrangement

### Direct object emission (existing path)

- Add a `loweredAsmToByteMap(...)` step (or equivalent) that walks placed `LoweredAsmProgram` and:
  - produces `codeBytes`, `dataBytes`, fixups, rel8 fixups
  - fills `EmittedByteMap` the same way `emitProgram(...)` currently does
- This becomes the new primary path for `writeBin`, `writeHex`, `writeD8m`, `writeListing`.

### Existing trace path

- Keep `asmTrace` as a side-channel for now.
- The current `.asm` trace writer in `writeAsm.ts` remains unchanged and separate.
- Trace stays intentionally non-assembler-valid.

### ASM80 emitter path (new)

- Add `writeAsm80(...)` (new writer, or new path inside `formats/`) that consumes `LoweredAsmProgram`.
- The output artifact should use a distinct name (currently `.z80`) until the trace `.asm` can be retired.
- Tests/harnesses should run ASM80 parsing/validation on this artifact only (no CLI invocation in v1).

## Migration sequence (smallest safe first patch)

### Phase 0: Planning + data model

- Add new types in a minimal location (likely `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/formats/types.ts` or a new `loweredAsmTypes.ts`).
- No behavior changes yet.

### Phase 1: Produce lowered-assembly in `emitProgram(...)`

- Construct `LoweredAsmStream` alongside existing byte emission.
- Still emit bytes directly (no consumer yet).
- Keep byte map and trace intact.

### Phase 2: Byte-map consumer

- Introduce a placement pass that converts `LoweredAsmStream` -> placed `LoweredAsmProgram`.
- Inject startup-init into the placed program (mirrors current `finalizeEmitProgram(...)` behavior).
- Introduce a consumer that converts placed `LoweredAsmProgram` -> `EmittedByteMap`.
- Switch `emitProgram(...)` to use the consumer for byte emission.
- Keep output artifacts unchanged.

### Phase 3: ASM80 emitter + tests

- Add an ASM80 emitter that consumes the placed lowered assembly product.
- Add ASM80 validation in tests/harnesses (no CLI invocation).
- Keep trace `.asm` unchanged and separate.

### Phase 4: Optional cleanup

- Once ASM80 is stable, decide on the permanent artifact name.
- Only then consider changes to trace `.asm` or CLI options.

## Deferred items

- Preserved user comments in lowered-assembly output.
- Generalized dialect abstraction across assemblers.
- CLI assembler invocation or toolchain integration.
- Richer section modeling beyond ordered ORG blocks.

## Specific file/function touchpoints (for later implementation)

- `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/compile.ts`
  - `emitProgram(...)` call site and artifact wiring.
- `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/lowering/emit.ts`
  - `emitProgram(...)` and `traceInstruction(...)` / `traceLabel(...)` / `traceComment(...)`.
- `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/lowering/emitFinalization.ts`
  - `finalizeEmitProgram(...)` where fixups and placement are resolved.
- `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/lowering/programLoweringFinalize.ts`
  - `finalizeProgramEmission(...)` where base addresses and fixups are applied.
- `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/lowering/sectionLayout.ts`
  - `writeSection(...)` and `computeWrittenRange(...)`.
- `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/lowering/sectionContributions.ts`
  - named section contribution sinks.
- `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/formats/writeAsm.ts`
  - trace `.asm` generation remains separate.
- `/Users/johnhardy/.codex/worktrees/7e4e/ZAX/src/formats/types.ts`
  - `EmittedByteMap` and format writer interfaces.

## Proposed insertion point (summary)

- Primary: pre-placement `LoweredAsmStream` built in `emitProgram(...)` in `emit.ts`.
- Placed `LoweredAsmProgram` constructed after placement/finalization.
- Consumers: one for byte emission (existing behavior), one for ASM80 output (new).

## Minimal data model (summary)

- `LoweredAsmProgram` consisting of ordered ORG blocks with:
  - labels, constants, `DB`/`DW`/`DS`, and lowered instructions.
- Use normalized lowered operand/imm shapes, not frontend AST nodes.

## Migration sequence (summary)

1. Add data model types.
2. Emit lowered-assembly alongside current byte emission.
3. Add placement pass and switch byte emission to consume placed lowered-assembly.
4. Add ASM80 emitter + validation in tests.
5. Defer trace `.asm` changes and CLI until later.
