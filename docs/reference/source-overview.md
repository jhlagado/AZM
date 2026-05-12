# ZAX Source Code Overview

Status: non-normative developer reference. Describes the current source structure for
developers working on the codebase. Maintain this as a version-neutral architecture map of the
live codebase.

---

## 1. What ZAX Is

ZAX is a structured assembler for Z80-family targets. It compiles `.zax` source files directly
to binary output (`.bin`, Intel HEX `.hex`, D8 debug map `.d8.json`, listing `.lst`, and
ASM80 lowered output `.z80`). There is no external linker. The compiler
is a single-pass whole-program tool
written in TypeScript and runs on Node.js ≥ 20.

The compiler accepts one entry file plus transitive imports, resolves them into a single program
in topological order, runs a sequential pipeline (parse → semantics → lowering), and writes
in-memory artifacts through injected format writers.

---

## 2. Repository Layout

```
src/
  cli.ts                  CLI entry point (argument parsing, file I/O, format wiring)
  compile.ts              Top-level compile orchestrator (phase sequencing + artifact emission)
  moduleLoader.ts         Import/include expansion, module graph walk, topo ordering, source capture
  pipeline.ts             Type contracts only: CompilerOptions, CompileResult, PipelineDeps

  diagnostics/
    types.ts              Diagnostic type + stable ID registry (ZAX000–ZAX501)

  formats/
    types.ts              Output artifact and format-writer contracts
    index.ts              Format writer factory
    writeAsm80.ts         ASM80 lowered source writer (.z80)
    writeBin.ts           Binary writer (.bin)
    writeD8m.ts           D8 debug map writer (.d8.json)
    writeHex.ts           Intel HEX writer (.hex)
    writeListing.ts       Listing writer (.lst)
    range.ts              Byte-range utilities

  frontend/
    ast.ts                Pure AST type definitions (no parsing logic)
    source.ts             SourceFile: line-start index for span construction
    parser.ts             Top-level dispatch: line loop, defers module items to dispatch helpers
    parseModuleItemDispatch.ts Module-scope item parser: func/op/enum/type/data/globals/extern/simple directives
    parseModuleCommon.ts  Shared parse helpers: keyword prefix matching, error messages
    parseAsmStatements.ts ASM block body parser (instruction + control nodes)
    parseData.ts          Data block parser
    parseEnum.ts          Enum declaration parser
    parseExtern.ts        Extern function binding parser (single extern func line)
    parseExternBlock.ts   Extern block parser (extern…end)
    parseFunc.ts          Function declaration parser (header + locals + asm body)
    parseGlobals.ts       Legacy module-scope storage-block parser
    parseImm.ts           Immediate expression parser (literals, names, sizeof, binary)
    parseOp.ts            Op declaration parser (header + asm body)
    parseOperands.ts      Operand parser (Reg, Imm, Ea, Mem, PortC, PortImm8)
    parseParams.ts        Parameter list parser (typed params and op matcher params)
    parseTopLevelSimple.ts Simple single-line parsers: import, const, section, align, bin, hex
    parseTypes.ts         Type and union declaration parsers (multi-line blocks)

  lint/
    case_style.ts         Case-style lint pass (optional; warns on mixed reg/keyword casing)

  lowering/
    emit.ts               emitProgram orchestrator: wires workspace state (section byte maps, fixup queues, visibility, resolution helpers, createEmitProgramContext); invokes emitPipeline phases
    emitPipeline.ts       Emit phase seams: prescan → lowering → placement & artifacts; typed EmitProgramOptions / EmitProgramResult; delegates to programLowering + emitFinalization
    emitContextBuilder.ts Shared wiring for function/program lowering contexts used by emit.ts
    steps.ts              Step-pipeline primitives (EA builders, load/store templates); section comments + see docs/reference/addressing-steps-overview.md
    ldLowering.ts         Typed LD lowering facade: form selection + encoding composition
    ldEncoding.ts         LD encoding core: context wiring, assignment plans, scalar/aggregate paths
    ldEncodingRegMemHelpers.ts Register/memory LD templates and EA pipelines for ldEncoding
    programLowering.ts    Program item dispatch: pre-scan, DataBlock/VarBlock, finalization
    programLoweringDeclarations.ts Bin/raw data and declaration lowering helpers for programLowering
    functionLowering.ts   FuncDecl coordinator: frame setup, prologue, epilogue, body
    functionCallLowering.ts  Typed-call argument dispatch (byte/word/ea/mem variants)
    loweringDiagnostics.ts  Shared diagnostic helpers: diag, diagAt, warnAt, etc.
    eaResolution.ts       EA address resolution: name → {abs, stack} + addend
    eaMaterialization.ts  EA address materialization to HL register
    addressingPipelines.ts Build byte/word step pipelines from EA expressions
    typeResolution.ts     Scalar kind and aggregate type resolution from TypeExprNode
    asmRangeLowering.ts   Structured control flow lowering (if/while/repeat/select)
    asmBodyOrchestration.ts  lowerAndFinalizeFunctionBody: fallthrough/balance checks
    asmInstructionLdHelpers.ts LD-shaped asm instruction helpers used by asmInstructionLowering
    asmInstructionLowering.ts lowerAsmInstructionDispatcher: ret/call/jp/jr/djnz dispatch
    functionBodySetup.ts  Flow state, labels, joinFlows, select helpers, sourceTagForSpan
    valueMaterialization.ts  pushEaAddress, pushMemValue, runtime linear expression analysis
    valueMaterializationContext.ts  Lowering context for value materialization helpers
    opMatching.ts         Op overload matching, specificity, diagnostic formatting
    opExpansionOrchestration.ts  Op expansion: arity/overload check, stack-policy enforcement
    opExpansionExecution.ts     Op expansion: substitution + re-lowering
    opSubstitution.ts     Op parameter substitution (replace matcher params with args)
    emissionCore.ts       Core byte emission: emitCodeBytes, emitRawCodeBytes, emitStepPipeline
    emitStepImports.ts    Step-instruction import collection for emit path
    fixupEmission.ts      Fixup emission: ABS16, REL8, condition opcode maps, symbolicTarget
    asmUtils.ts           ASM clone utilities (cloneImmExpr, cloneEaExpr), flattenEaDottedName
    runtimeAtomBudget.ts  Runtime-atom budget enforcement for indexed EA
    runtimeImmediates.ts  Runtime immediate helpers (loadImm16ToHL/DE, negateHL)
    scalarWordAccessors.ts Scalar word load/store helpers
    sectionLayout.ts      Section layout: alignTo, writeSection, computeWrittenRange
    traceFormat.ts        Trace/ASM output formatting helpers
    inputAssets.ts        BIN/HEX file ingestion

  semantics/
    env.ts                Build CompileEnv: resolve consts, enums, type declarations
    layout.ts             Type size (sizeof) and field offset (offsetof) computation

  z80/
    encode.ts             Main Z80 instruction encoder dispatch
    encodeAlu.ts          ALU instruction encoding (add, sub, adc, sbc, and, or, xor, cp)
    encodeBitOps.ts       Bit operation encoding (bit, set, res, rl, rr, rlc, rrc, sla, sra, srl)
    encodeControl.ts      Control flow encoding (jp, jr, call, ret, djnz)
    encodeCoreOps.ts      Core operations encoding (push, pop, inc, dec, ex, exx, nop, halt)
    encodeIo.ts           I/O instruction encoding (in, out)
    encodeLd.ts           LD instruction direct encoding (handled before EA lowering)
```

---

## 3. Compilation Pipeline

```
CLI / test harness
  │
  ▼
compile(entryFile, options, deps)           [compile.ts]
  │
  ├─ loadProgram()                          [moduleLoader.ts]
  │    ├─ readFile + parseModuleFile()      [frontend/parser.ts]
  │    ├─ expand includes + capture source comments
  │    ├─ resolve imports (BFS + topo sort)
  │    └─ cycle detection, ID collision check
  │
  ├─ lintCaseStyle()                        [lintCaseStyle.ts]
  │
  ├─ buildEnv()                             [semantics/env.ts]
  │    ├─ collect types, unions
  │    ├─ collect func/extern names (for collision)
  │    ├─ resolve enum members (qualified names)
  │    └─ evaluate const expressions
  │
  ├─ emitProgram()                          [lowering/emit.ts; invoked from compile.ts]
  │    ├─ workspace wiring (mutable section maps, fixup queues, helpers, createEmitProgramContext) [emit.ts]
  │    ├─ prescan: runEmitPrescanPhase → PrescanResult
  │    │    (callables, ops, storage aliases, raw-address names)            [emitPipeline.ts → programLowering]
  │    ├─ lowering: runEmitLoweringPhase → LoweringResult
  │    │    (emit module items: FuncDecl, DataBlock, VarBlock, sections, bin/hex, fixup enqueue)
  │    │                                                                  [emitPipeline.ts → programLowering]
  │    └─ placement & artifacts: mergeEmitFinalizationContext
  │         + runEmitPlacementAndArtifactPhase → map, symbols, placed lowered ASM
  │         (named-section placement, ABS16/REL8/extern fixups, merged EmittedByteMap)
  │                                                                  [emitPipeline.ts → emitFinalization]
  │
  └─ format writers                         [formats/*.ts via compile PipelineDeps]
       ├─ writeBin → .bin
       ├─ writeHex → .hex
       ├─ writeD8m → .d8.json
       ├─ writeListing → .lst
       └─ writeAsm80 → .z80
```

### 3.1 Phase Contracts and Invariants

The compiler is intentionally staged. Each phase should preserve a narrow contract so tests can
pin the right seam and refactors do not blur responsibilities.

- **Frontend parse**: builds AST plus recoverable diagnostics only. It should preserve source spans,
  continue after malformed lines where practical, and avoid semantic or encoding decisions.
- **Semantics**: builds the compile environment for names, const values, enum members, type sizes,
  and field offsets. It should not emit bytes, place sections, or perform backend-specific opcode
  legality checks.
- **Lowering**: consumes AST plus `CompileEnv` and makes all section-placement, frame, call,
  fixup, and encoding decisions needed to produce deterministic artifacts. This is where callable
  discovery, named-section routing, stack-frame cleanup, and final byte emission become stable
  contracts. Emit-time work is further staged via `emitPipeline.ts` (prescan → lowering →
  placement and artifacts) so tests and refactors can target the right seam within lowering.
- **Format writers**: serialize already-lowered artifacts. Writers may change representation
  (`.bin`, `.hex`, `.lst`, `.d8.json`, `.z80`) but should not change compilation semantics.
- **CLI wiring**: selects inputs, options, and requested output artifacts. The CLI should not add
  language behavior that differs from direct `compile(...)` use.

When a change crosses one of these boundaries, prefer an integration test. When the contract is
entirely inside one phase helper, prefer a focused helper test. When checked-in bytes or text are
the user-facing guarantee, prefer a corpus or golden test.

---

## 4. Key Subsystems

### 4.1 AST

`frontend/ast.ts` defines pure TypeScript interfaces for all AST nodes. There is **no code** in
this file — only types. The key node families are:

- **Module structure**: `ProgramNode → ModuleFileNode → ModuleItemNode[]`
- **Declarations**: `FuncDeclNode`, `OpDeclNode`, `ExternDeclNode`, `DataBlockNode`,
  `VarBlockNode`, `EnumDeclNode`, `ConstDeclNode`, `TypeDeclNode`, `UnionDeclNode`
- **ASM body**: `AsmBlockNode → AsmItemNode[]` where items are
  `AsmInstructionNode | AsmControlNode | AsmLabelNode`
- **Expressions**: `ImmExprNode` (compile-time), `EaExprNode` (effective address), `TypeExprNode`
- **Operands**: `AsmOperandNode` variants: `Reg | Imm | Ea | Mem | PortC | PortImm8`
- **Op matchers**: `OpMatcherNode` variants for overload dispatch

`AsmInstructionNode` stores the mnemonic in canonical lower-case (`head`) and operands as
`AsmOperandNode[]`. All register names in `Reg` nodes are canonical upper-case.

### 4.2 Frontend Parser

The parser is line-oriented and recursive-but-manual (not a grammar-driven parser). It:

1. Splits source text into lines using pre-computed `lineStarts` (from `source.ts`).
2. Strips semicolon comments from each line.
3. Tries each keyword prefix in order (a cascade of `consumeTopKeyword` / `consumeKeywordPrefix`
   calls) to dispatch to the appropriate sub-parser.
4. Multi-line constructs (func, op, type, union, extern, var, data blocks) advance the line
   counter `i` through the block body looking for terminating keywords.
5. Each sub-parser returns `{ node, nextIndex }` so the top-level loop can skip the consumed
   lines.

Error handling is best-effort: malformed lines emit a diagnostic and parsing continues at the
next line where possible.

**Characteristic weakness**: Operand parsing (`parseOperands.ts`) and ASM statement parsing
(`parseAsmStatements.ts`) use manual string tokenization. The boundary between a ZAX identifier
and a Z80 register/mnemonic token is resolved by priority matching (registers checked first,
then ZAX bindings), mirroring the spec but implemented ad hoc.

### 4.3 Semantics

`semantics/env.ts` builds the `CompileEnv` in one pass over the program:

- Registers all type/union declarations (name → node map)
- Registers func/extern names (for duplicate detection only — not used in lowering)
- Assigns sequential ordinal values to enum members (`EnumName.MemberName → index`)
- Evaluates `const` expressions using `evalImmExpr`

`semantics/layout.ts` implements:

- `sizeOfTypeExpr` — returns the exact semantic size
- `offsetOfPathInTypeExpr` — resolves `offsetof(T, a.b[2])` paths to byte offsets

Type resolution is recursive with cycle detection via `visiting` sets.

### 4.4 Lowering: The Frame Model

Every `func` declaration with parameters, locals, or preserved registers gets an
IX-anchored stack frame:

```asm
; prologue
push ix
ld ix, 0
add ix, sp         ; IX = frame pointer

; local initializers (for each local with initializer, in declaration order):
;   if HL is preserved (not in return set):
push hl            ; save incoming HL
ld hl, <init>
ex (sp), hl        ; init on stack, incoming HL restored
;   if HL is volatile (in return set):
ld hl, <init>
push hl            ; init on stack

; preserved registers (per preservation matrix):
push AF / BC / DE / HL (as applicable)

; === user ASM body ===

; epilogue (at __zax_epilogue_N label):
pop HL / DE / BC / AF (reverse order)
ld sp, ix
pop ix
ret
```

The preservation matrix is: `Preserve = {AF, BC, DE, HL} \ ReturnSet`. IX is always preserved
via the frame mechanism. All `ret` / `ret cc` within the body are rewritten to `jp` / `jp cc
__zax_epilogue_N` when any cleanup is needed.

Stack slot layout (relative to IX):

- Locals: `IX-2`, `IX-4`, `IX-6`, … (in declaration order; all word-sized slots)
- Parameters: `IX+4`, `IX+6`, `IX+8`, … (first param at IX+4; two words above return address)

### 4.5 Lowering: EA Resolution

Effective-address expressions (`EaExprNode`) are resolved to one of:

```typescript
type EaResolution =
  | { kind: 'abs'; baseLower: string; addend: number; typeExpr?: TypeExprNode }
  | { kind: 'stack'; ixDisp: number; typeExpr?: TypeExprNode };
```

`'abs'` means a module-scope global symbol (emitted as a fixup). `'stack'` means an IX-relative
displacement. The `typeExpr` carries the declared type for scalar-kind and width checks.

Field access (`.field`) and constant index (`[n]`) are folded into the addend/ixDisp at
resolution time. Runtime-indexed access (reg8/reg16 index) falls back to address materialization
into HL.

### 4.6 Lowering: LD Instruction

`ldLowering.ts` handles the core complexity of the `ld` instruction, which must cover:

- `ld r8, (ea)` — load byte from EA into reg8
- `ld r16, (ea)` — load word from EA into reg16 pair
- `ld (ea), r8` — store reg8 to byte EA
- `ld (ea), r16` — store reg16 to word EA
- `ld (ea), (ea)` — memory-to-memory copy (byte or word)
- `ld (ea), imm` — store immediate to EA

Each case tries multiple paths in priority order:

1. Direct IX+d form (for stack slots within ±128 byte range)
2. Step-pipeline template (for EAs that can be resolved to a step sequence)
3. Absolute fixup (for global symbols with zero addend)
4. EA address materialization to HL as fallback

The H/L register special case: `LD H,(IX+d)` and `LD L,(IX+d)` are illegal on Z80. The code
uses a DE shuttle (`ex de,hl` / `ld d/e,(ix+d)` / `ex de,hl`) for these cases.

### 4.7 Lowering: Step Pipelines

`lowering/steps.ts` defines a step-pipeline abstraction. A `StepPipeline` is an ordered list
of `StepInstr` values. Steps are combined by templates (e.g., `TEMPLATE_L_ABC`,
`TEMPLATE_LW_HL`) and then executed by `emitStepPipeline` in `emissionCore.ts`.

For a **family-level map** of EA builders, load/store templates, and EA-combine helpers (without
reading the whole source linearly), see [`addressing-steps-overview.md`](addressing-steps-overview.md).
The module itself uses `// --- Section: … ---` comments grouping exports the same way.

Steps encode operations like:

- `LOAD_BASE_GLOB` / `LOAD_BASE_FVAR` — load base address into DE
- `LOAD_RP_EA` / `LOAD_RP_GLOB` / `LOAD_RP_FVAR` — load register pair from EA
- `STORE_RP_EA` / `STORE_RP_GLOB` / `STORE_RP_FVAR` — store register pair to EA
- `CALC_EA` / `CALC_EA_2` — compute effective address (HL = HL + DE)
- `TEMPLATE_L_ABC` / `TEMPLATE_L_HL` / `TEMPLATE_L_DE` — load byte via EA builder
- `TEMPLATE_LW_HL` / `TEMPLATE_LW_DE` / etc. — load word via EA builder

Steps are executed by `emitStepPipeline` in `emissionCore.ts`. This abstraction insulates
the lowering code from the register-allocation details of the addressing model
(DE = base, HL = index/EA).

### 4.8 Lowering: Structured Control Flow

`asmRangeLowering.ts` handles `if/else/end`, `while/end`, `repeat/until`, and
`select/case/selectelse/end`. It:

1. Scans forward from a control keyword to its matching terminator using a `stopKinds` set.
2. Generates hidden labels (`__zax_if_else_N`, `__zax_if_end_N`, etc.).
3. Emits conditional jumps to the hidden labels.
4. Tracks flow reachability and SP delta state through branches.

The SP tracking is conservative: if two branches diverge in SP state, the joined state is
marked invalid.

### 4.9 Lowering: Op Expansion

Op expansion (`opExpansionOrchestration.ts`, `opExpansionExecution.ts`, `opSubstitution.ts`)
handles inline macro-instruction expansion:

1. An ASM instruction whose `head` matches a declared `op` name triggers op dispatch.
2. Arity is checked first; then each overload is pattern-matched via `opMatching.ts`.
3. The best-matching (most specific) overload is selected.
4. The op body is recursively lowered with parameter substitution applied.
5. Cycle detection prevents infinite recursion.

### 4.10 Z80 Encoder

`z80/encode.ts` dispatches to encoder subfamilies by mnemonic. The encoder handles only
**concrete** instructions (no EA lowering — that happens upstream in lowering). It returns
a `Uint8Array` of bytes or `undefined` on error.

Encoding is table-driven for register codes (e.g., `reg8Code` maps `A/B/C/D/E/H/L` to
opcode bits) and conditional codes (`conditionOpcode` maps `NZ/Z/NC/C/PO/PE/P/M` to bits).

---

## 5. Helper Module Injection Pattern

After the refactor splitting `emit.ts`, the lowering helpers use a dependency-injection pattern.
Each helper module exports a `createXxxHelpers(ctx)` factory that takes a context object and
returns a set of closures. The closures close over the context properties they need.

**Typed context** (correct pattern):

```typescript
// eaResolution.ts
type EaResolutionContext = { env, diagnostics, diagAt, stackSlotOffsets, ... };
export function createEaResolutionHelpers(ctx: EaResolutionContext) { ... }
```

**Untyped context** (problem area):

```typescript
// ldLowering.ts
export function createLdLoweringHelpers(ctx: LdLoweringContext) {
  const { emitInstr, resolveEa, buildEaBytePipeline, ... } = ctx;
  ...
}
```

As of the current codebase:

- All extracted helper modules have properly typed context interfaces.
- `ldLowering.ts` now uses the explicit `LdLoweringContext` intersection type (QR-2 resolved).
- `functionBodySetup.ts` no longer uses `AsmOperandNode extends never ? never : any`
  linting workarounds — all context types are explicit (QR-18 resolved).

The v0.4 type-safety track is complete.

---

## 6. State Lifetime in emitProgram

`emitProgram` maintains state at two lifetimes:

**Program lifetime** (allocated once, lives for entire compilation):

- `bytes`, `codeBytes`, `dataBytes`, `hexBytes` — section byte maps
- `codeSourceSegments`, `codeAsmTrace` — source mapping / trace data
- `symbols`, `pending`, `taken` — symbol table
- `fixups`, `rel8Fixups`, `deferredExterns` — forward-reference fixup queues
- `callables`, `opsByName` — callable and op registries
- `storageTypes`, `moduleAliasTargets`, `rawAddressSymbols` — module-scope type/alias state
- `generatedLabelCounter` — global hidden label counter (must not reset between functions)
- `opStackSummaryCache` — memoized op stack-effect analysis

**Function lifetime** (reset at the start of each `FuncDecl`):

- `stackSlotOffsets`, `stackSlotTypes` — local/param IX-displacement maps
- `localAliasTargets` — function-local alias bindings
- `spDeltaTracked`, `spTrackingValid`, `spTrackingInvalidatedByMutation` — SP tracking state

Function-lifetime state is now managed inside `lowerFunctionDecl` in `functionLowering.ts`
(PR #547). The `FunctionLoweringContext` interface is an exported type that documents
which state is function-scoped. The `trackedSpRef` proxy (getter/setter bridge for the three
SP tracking scalars) still exists in the `programLoweringContext` wiring in `emit.ts`, but
it is now confined to the wiring section only.

**Remaining risk (QR-4)**: `stackSlotOffsets`, `stackSlotTypes`, and `localAliasTargets`
are still declared as closures in `emitProgram` and passed by reference to both modules.
Full resolution (Phase 4) requires moving these allocations into `lowerFunctionDecl` and
eliminating the `trackedSpRef` proxy.

---

## 7. Diagnostic Architecture

All diagnostics use a shared `Diagnostic` interface with a stable `id` (e.g., `ZAX300`).
The IDs are defined as constants in `diagnosticTypes.ts`. There are roughly 20 named IDs
plus the catch-all `ZAX000` (Unknown).

Within `emit.ts`, there are five diagnostic helper functions at file scope:

- `diag(diagnostics, file, message)` — generic file-level error
- `diagAt(diagnostics, span, message)` — span-precise error
- `diagAtWithId(diagnostics, span, id, message)` — span-precise with specific ID
- `diagAtWithSeverityAndId(diagnostics, span, id, severity, message)` — flexible
- `warnAt(diagnostics, span, message)` — warning

Inside the `emitProgram` function body, there are closure-bound curried versions of some of
these (particularly `diagAt`, which is passed into helper modules) that shadow the file-scope
names within the closure scope.

---

## 8. Testing Infrastructure

Tests are in `test/` and run with Vitest.

- Use [../../test/README.md](../../test/README.md) to find representative tests by feature area and
  to decide whether a change belongs in a helper, integration, CLI, or corpus/golden test.
- Use [testing-verification-guide.md](testing-verification-guide.md) for local verification flow,
  fixture regeneration commands, and CI expectations.
- Reusable end-to-end helpers live in `test/helpers/` and shared artifact assertions live in
  `test/test-helpers.ts`.

The broad test layers are:

- **Helper and unit tests** for parser, encoder, and extracted lowering seams
- **Integration tests** for parser dispatch, lowering/frame behavior, section routing, and emitted artifacts
- **CLI tests** for argument parsing, output selection, and artifact contracts
- **Corpus/golden tests** for stable checked-in bytes or textual outputs
- **Smoke and example tests** for broad compile coverage across shipped examples and generated tours
