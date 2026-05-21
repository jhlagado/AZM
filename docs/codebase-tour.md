# A Guided Tour of the AZM Assembler Codebase

> **Audience:** Someone reading the AZM source code for the first time and wanting a coherent mental model before diving in.
> **Goal:** By the end of this document you should be able to open any file in `src/`, understand which phase of the assembler it belongs to, why it exists, and how it connects to its neighbours.
>
> **Policy:** AZM is not ZAX 0.4. AZM has zero users to preserve old experiment compatibility for. The product compatibility target is ASM80 baseline compatibility plus retained AZM features: register-care, AZMDoc, visible `op` expansion, directive aliases, and layout constants. Inherited ZAX functions, modules/imports, locals, arguments, named sections, typed assignment, structured control, and hidden typed lowering are quarantine or deletion work, not AZM language promises.

---

## Table of Contents

1. [What AZM Is](#1-what-azm-is)
2. [Repository Layout at a Glance](#2-repository-layout-at-a-glance)
3. [The Compilation Pipeline — Overview](#3-the-compilation-pipeline--overview)
4. [A Running Example](#4-a-running-example)
5. [Entry Points: `cli.ts` and `compile.ts`](#5-entry-points-clits-and-compilets)
6. [Source Loading (`sourceLoader.ts` and friends)](#6-source-loading-sourceloaderts-and-friends)
7. [The Frontend: Turning Text into an AST](#7-the-frontend-turning-text-into-an-ast)
   - 7.1 [Logical Lines (`parseLogicalLines.ts`)](#71-logical-lines-parselogicallinests)
   - 7.2 [Grammar Data (`grammarData.ts`)](#72-grammar-data-grammardatats)
   - 7.3 [The Parser Entry Point (`parser.ts`)](#73-the-parser-entry-point-parserts)
   - 7.4 [Dispatch and Item Handlers](#74-dispatch-and-item-handlers)
   - 7.5 [Parsing Ops](#75-parsing-ops)
   - 7.6 [Parsing ASM Bodies](#76-parsing-asm-bodies)
   - 7.7 [Parsing Expressions: Immediates and Effective Addresses](#77-parsing-expressions-immediates-and-effective-addresses)
8. [The AST Contract (`frontend/ast.ts`)](#8-the-ast-contract-frontendasttts)
9. [Semantics: Building the Compilation Environment](#9-semantics-building-the-compilation-environment)
   - 9.1 [The Compile Environment (`semantics/env.ts`)](#91-the-compile-environment-semanticsenvts)
   - 9.2 [Type Layout (`semantics/layout.ts`)](#92-type-layout-semanticslayoutts)
   - 9.3 [Semantic Validation Passes](#93-semantic-validation-passes)
10. [Lowering: From AST to Bytes](#10-lowering-from-ast-to-bytes)
    - 10.1 [The Four Phases (`lowering/emit.ts` and `emitPipeline.ts`)](#101-the-four-phases-loweringemitts-and-emitpipelinets)
    - 10.2 [Phase 1 — Workspace Setup](#102-phase-1--workspace-setup)
    - 10.3 [Phase 2 — Prescan](#103-phase-2--prescan)
    - 10.4 [Phase 3 — Lowering Declarations](#104-phase-3--lowering-declarations)
    - 10.5 [Removed ZAX Lowering Boundary](#105-removed-zax-lowering-boundary)
    - 10.6 [Instruction Lowering](#106-instruction-lowering)
    - 10.7 [The `ld` Sub-Pipeline](#107-the-ld-sub-pipeline)
    - 10.8 [Op Expansion (Macro-Instructions)](#108-op-expansion-macro-instructions)
    - 10.9 [Removed Typed EA Materialization Boundary](#109-removed-typed-ea-materialization-boundary)
    - 10.10 [Phase 4 — Finalization, Fixups, and Placement](#1010-phase-4--finalization-fixups-and-placement)
11. [Z80 Machine-Code Encoding (`src/z80/`)](#11-z80-machine-code-encoding-srcz80)
12. [The Lowered-ASM Intermediate Representation](#12-the-lowered-asm-intermediate-representation)
13. [Output Format Writers (`src/formats/`)](#13-output-format-writers-srcformats)
14. [Diagnostics System](#14-diagnostics-system)
15. [The Test Suite](#15-the-test-suite)
16. [Cross-Cutting Concerns and Design Patterns](#16-cross-cutting-concerns-and-design-patterns)
17. [Quick Reference: File → Responsibility](#17-quick-reference-file--responsibility)

---

## 1. What AZM Is

AZM is an ASM80-class assembler for the Z80 processor. AZM `.asm` source is
flat assembly: labels, Z80 instructions, placement with `org` / `.org`, raw data
directives, includes, constants, retained `op` declarations, AZMDoc
register-care metadata, and layout constants.

AZM keeps only the ASM80 compatibility baseline plus chosen assembly-first
features:

- **ASM80-style source** in `.asm` / `.z80` where it fits the documented baseline.
- **AZM `.asm` source** for stricter flat assembler programs.
- **Register-care and AZMDoc** for machine-checkable comments and contracts.
- **Op declarations** as visible AST-level instruction expansion at call sites.
- **Directive aliases** as directive-head normalization, not a macro system.
- **Layout constants**: `type`, `union`, `sizeof`, `offset`, and explicit
  layout-cast address constants.

The inherited codebase still contains old ZAX machinery. Treat these as retired
or quarantined unless you are explicitly working on removal: `func`, formal
arguments, locals, ZAX `import` modules, named `section` blocks, `:=` typed
assignment, structured control-flow syntax, typed storage, typed externs,
generated function frames, and runtime typed effective-address lowering.

The compiler turns accepted source into standard Z80 machine code, producing flat binary, Intel HEX, a listing file, a debug-map JSON (`.d8.json`), and optionally a lowered plain-Z80 source file (`.z80`).

---

## 2. Repository Layout at a Glance

```
src/
├── cli.ts                     # Command-line entry point
├── compile.ts                 # Main compile() function — pipeline orchestration
├── compileShared.ts           # Tiny shared helpers (hasErrors, normalizePath)
├── diagnosticTypes.ts         # Diagnostic ID constants and Diagnostic interface
├── pipeline.ts                # CompilerOptions and PipelineDeps interfaces
├── sourceLoader.ts            # Source-file loading and textual includes
├── sourceIncludeExpansion.ts  # Textual include expansion with provenance
├── sourceIncludePaths.ts      # Textual include candidate resolution
├── lintCaseStyle.ts           # Case-style linting (keywords/registers)
│
├── frontend/                  # Parsing: text → AST
│   ├── ast.ts                 # AST type contracts (no logic)
│   ├── parser.ts              # parseSourceFile() — top-level parser
│   ├── source.ts              # SourceFile, line offsets, span()
│   ├── grammarData.ts         # Register names, keywords, operator precedence tables
│   ├── parseLogicalLines.ts   # Line-continuation (backslash) handling
│   ├── parseParserShared.ts   # Shared helpers: stripLineComment, isReservedName, etc.
│   ├── parseDiagnostics.ts    # parseDiag() helper
│   ├── parseParserRecovery.ts # Error-recovery helpers
│   ├── parseTopLevelCommon.ts   # topLevelStartKeyword(), diagInvalidHeaderLine()
│   ├── parseSourceItemDispatch.ts # Shared line coordinator
│   ├── parseSourceItemTable.ts # Retained AZM top-level declaration table
│   ├── parseOp.ts             # op declaration
│   ├── parseOpHeader.ts      # op header parsing
│   ├── parseEnum.ts           # enum declaration
│   ├── parseTypes.ts          # type and union declarations
│   ├── parseParams.ts         # Parameter list parsing
│   ├── parseImm.ts            # Immediate expression parser
│   ├── parseOperands.ts       # ASM operand parser
│   ├── parseAsmStatements.ts  # ASM statement dispatcher (labels, instructions)
│   ├── parseAsmInstruction.ts # Individual instruction line parser
│   ├── parseRawDataDirectives.ts # db/dw/ds directives
│   └── parseRawDataDirectiveStart.ts # db/dw/ds start detection
│
├── semantics/                 # Semantic analysis
│   ├── env.ts                 # CompileEnv, buildEnv(), evalImmExpr()
│   ├── layout.ts              # sizeOfTypeExpr(), offsetPathInTypeExpr()
│   ├── typeQueries.ts         # Type resolution helpers, typeDisplay()
│   └── declVisitor.ts         # Declaration tree visitor
│
├── lowering/                  # Code generation: AST + env → bytes
│   │
│   │  ── Orchestration ──
│   ├── emit.ts                # emitProgram(): phases 1-4 glued together
│   ├── emitPipeline.ts        # Phase 2/3/4 runners + result types
│   ├── emitContextBuilder.ts  # Program lowering context assembly
│   ├── emitPhase1Workspace.ts # Placement byte maps and mutable state
│   ├── emitPhase1Helpers.ts   # Phase-1 helper construction
│   ├── emitProgramContext.ts  # ProgramLoweringContext wiring
│   ├── emitState.ts           # Mutable emission state
│   ├── opCandidateRegistry.ts # Op candidate lookup
│   ├── emitFinalization.ts    # Phase 4: fixup resolution + placement
│   ├── emitFinalizationSetup.ts # Finalization env setup
│   │
│   │  ── Program-level lowering ──
│   ├── programLowering.ts     # preScanProgramDeclarations() + lowerProgramDeclarations()
│   ├── programLoweringDeclarations.ts # Declaration dispatch helpers
│   ├── programLoweringFinalize.ts # Placement base computation
│   │
│   │  ── ASM body / instruction lowering ──
│   ├── asmInstructionLowering.ts # Instruction dispatch
│   ├── asmInstructionLdHelpers.ts # ld-instruction helpers
│   ├── asmLoweringLd.ts       # ld lowering
│   ├── asmLoweringBranchCall.ts # Branch/call lowering
│   ├── asmLoweringHost.ts     # Host-instruction helpers
│   ├── asmUtils.ts            # ASM utility functions
│   │
│   │  ── ld encoding sub-pipeline ──
│   ├── ldEncoding.ts          # Top-level ld encoding
│   ├── ldEncodingRegMemHelpers.ts # reg-mem encoding
│   ├── ldFormSelection.ts     # Load form selection
│   ├── ldLowering.ts          # ld lowering integration
│   │
│   │  ── Op (macro) expansion ──
│   ├── opMatching.ts          # Op overload matching
│   ├── opExpansionOrchestration.ts # Expansion orchestration
│   ├── opExpansionExecution.ts # Expansion execution
│   ├── opSubstitution.ts      # Parameter substitution
│   │
│   │  ── Supporting infrastructure ──
│   ├── loweredAsmTypes.ts     # Lowered-ASM IR types
│   ├── loweredAsmByteEmission.ts # Lowered-ASM → bytes
│   ├── loweredAsmPlacement.ts # Lowered-ASM placement
│   ├── loweredAsmStreamRecording.ts # Stream recording
│   ├── loweringTypes.ts       # Shared lowering types (PendingSymbol, ranges, …)
│   ├── loweringDiagnostics.ts # Lowering diag helpers
│   ├── fixupEmission.ts       # Fixup queue management
│   ├── emissionCore.ts        # Core emission helpers
│   ├── capabilities.ts        # Capability checking
│   ├── inputAssets.ts         # bin/hex asset loading
│   ├── bytePlacement.ts       # Byte placement helpers
│   └── traceFormat.ts         # Debug trace formatting
│
├── z80/                       # Z80 instruction encoding
│   ├── encode.ts              # Top-level encoder dispatcher
│   ├── encoderRegistry.ts     # Encoder family registry
│   ├── encodeCoreOps.ts       # Core instructions (nop, halt, …)
│   ├── encodeAlu.ts           # ALU family (add, sub, …)
│   ├── encodeBitOps.ts        # Bit operations (bit, set, res, rl, rr, …)
│   ├── encodeControl.ts       # Control flow (jp, jr, call, ret, djnz)
│   ├── encodeIo.ts            # I/O (in, out, im, rst)
│   └── encodeLd.ts            # Load instruction encoding (complex)
│
└── formats/                   # Output artifact writers
    ├── index.ts               # Re-exports
    ├── types.ts               # EmittedByteMap, SymbolEntry, Artifact types
    ├── range.ts               # Address range utilities
    ├── writeHex.ts            # Intel HEX writer
    ├── writeBin.ts            # Flat binary writer
    ├── writeD8m.ts            # D8 Debug Map JSON writer
    ├── writeListing.ts        # Listing file writer
    └── writeAsm80.ts          # Lowered ASM source writer

test/
├── frontend/                  # Parser unit tests
├── lowering/                  # Lowering unit/integration tests
├── backend/                   # Encoding tests
├── helpers/                   # Shared test utilities
└── pr<NNN>_*.test.ts          # Feature regression tests (one per PR)
```

---

## 3. The Compilation Pipeline — Overview

Compiling an AZM source file happens in a clearly phased pipeline. Before looking at any individual file, it pays to have the whole sequence in your head:

```
 Source text(s)
       │
       ▼
┌─────────────────┐
│  Source Loading │  Read entry file and expand textual includes
└────────┬────────┘
         │  ProgramNode (single expanded source unit)
         ▼
┌─────────────────┐
│    Parsing      │  Text → AST (frontend/)
└────────┬────────┘
         │  ProgramNode (fully populated AST)
         ▼
┌─────────────────┐
│   Semantics     │  Build CompileEnv, validate accepted instructions/steps
└────────┬────────┘
         │  CompileEnv (equates, enums, types, ASM equ expressions)
         ▼
┌──────────────────────────────────────────────────────────┐
│  Lowering (lowering/)                                    │
│                                                          │
│  Phase 1: Workspace setup (placement maps, fixup queues) │
│  Phase 2: Prescan (build symbols/ops/alias maps)         │
│  Phase 3: Lower declarations (emit bytes + fixups)       │
│  Phase 4: Finalize (place byte ranges, resolve fixups)   │
└────────┬─────────────────────────────────────────────────┘
         │  EmittedByteMap + SymbolEntry[] + LoweredAsmProgram
         ▼
┌─────────────────┐
│  Format Writers │  Produce .bin, .hex, .d8.json, .lst, .z80
└─────────────────┘
```

Each phase can emit diagnostics. The pipeline performs a `hasErrors()` check after each major phase and short-circuits early on fatal errors. This means diagnostics accumulate up to the point of the first fatal error set, and you always see errors from the _highest_ phase that successfully ran.

---

## 4. A Running Example

To make the tour concrete, we will follow this small AZM program through the assembler. It defines a visible helper `op`, a layout constant, a data region, and a `main` label:

```asm
; File: example.asm

.type Sprite
x     .byte
y     .byte
flags .byte
.endtype

SPRITE_FLAGS .equ offset(Sprite, flags)

op clear_a()
  xor a
end

.org $2000
SPRITES:
  .ds sizeof(Sprite[16])

.org $0100
main:
  clear_a
  ld hl,<Sprite[16]>SPRITES[0].flags
  ret
```

By the end of the tour you will be able to trace how this source is loaded,
parsed, checked, lowered to visible Z80 instructions, fixed up, and written to
artifacts.

---

## 5. Entry Points: `cli.ts` and `compile.ts`

### `cli.ts`

The command-line interface. It parses `process.argv`, constructs a `CompilerOptions` object, and calls the `compile()` function with a `PipelineDeps` object that wires in the real format writers (`writeHex`, `writeBin`, `writeD8m`, `writeListing`, `writeAsm80`). After compilation it writes artifacts to disk and prints diagnostics to `stderr`.

`PipelineDeps` (defined in `pipeline.ts`) is an interface that declares the format writers as a bundle. This indirection makes the compiler core fully testable without touching the filesystem — tests supply mock writers that capture the output in memory.

### `compile.ts`

This is the heart of the pipeline coordinator. `compile()` is an `async` function (because source loading reads from disk). It:

1. Calls `loadProgram()` to load the entry source file and expand textual includes into a flat `ProgramNode`.
2. Checks for errors. If any, returns early.
3. Validates that the program contains accepted top-level/source items.
4. Runs `lintCaseStyle()` to warn about inconsistent register/keyword casing.
5. Builds the `CompileEnv` with `buildEnv()`.
6. Runs retained semantic validation, including instruction checks.
7. Calls `emitProgram()` which returns `{ map, symbols, placedLoweredAsmProgram }`.
8. Passes those products to the format writers to produce `Artifact[]`.
9. Returns `{ diagnostics, artifacts }`.

Notice the `withDefaults()` helper at the top of `compile.ts`. If the caller specifies _any_ primary emit flag (`emitBin`, `emitHex`, `emitD8m`) then only those are written. If none is specified, all three default to `true`. `emitListing` defaults to `true` independently; `emitAsm80` defaults to `false`.

---

## 6. Source Loading (`sourceLoader.ts` and friends)

### What it does

`loadProgram()` in `sourceLoader.ts` is responsible for turning an entry-file path into a `LoadedProgram`. AZM `.asm` and `.z80` source is loaded with textual includes expanded before parsing. The result also carries auxiliary maps:

- `sourceTexts` — the raw text of each file (for the listing writer and debug map).
- `sourceLineComments` — a per-file, per-line index of inline comments (used in listings).

### Include expansion

AZM and ASM80-compatible source use textual includes. `expandTextIncludesForFile()` is an internal async helper that reads a source file, scans it line by line for `.include` / `include` directives after directive-alias normalization, and splices the included file's lines in-place. The included file extension does not switch parser mode; included text is parsed as part of the including source unit. The result is a flat expanded-source object with parallel `lineFiles[]` and `lineBaseLines[]` arrays so that diagnostics can always point to the original file and line number, even after inclusion. This expanded source is what actually gets parsed.

### `sourceIncludePaths.ts`

Contains `resolveIncludeCandidates()` for textual includes. AZM source organization should stay on this include path.

### `sourceIncludeExpansion.ts`

Expands textual `.include` / `include` directives before parsing and preserves
per-line source provenance for diagnostics and register-care comments.

### Compile-Time Scope

Textual includes are parsed as part of the including source unit. Constants,
enums, types, unions, ops, and labels therefore use ordinary source-order and
symbol-table rules instead of a source import/export graph.

---

## 7. The Frontend: Turning Text into an AST

All parsing lives in `src/frontend/`. There is **no separate lexer**. Instead, parsing is done on logical lines, using regex and character-by-character scanning, guided by keyword lookups in the tables from `grammarData.ts`.

### 7.1 Logical Lines (`parseLogicalLines.ts`)

The very first transformation takes the raw source text (a flat string) and breaks it into **logical lines**. A logical line is almost always a physical line, but a backslash (`\`) followed immediately by a non-whitespace character splits a line into two logical statements. So:

```asm
ld de,(InputWord) \ inc de
```

… produces two logical lines: `ld de,(InputWord)` and `inc de`.

`buildLogicalLines()` also correctly handles backslashes inside string and character literals (so `'\\'` is not treated as a line-continuation). Each logical line is a `LogicalLine` record containing:

- `raw` — the text of the logical line (no trailing newline, no comment).
- `startOffset` / `endOffset` — byte offsets in the original source for source-span tracking.
- `lineNo` — 1-based line number in the original file (important after include expansion).
- `filePath` — the original file this line came from.

Comments are **not** stripped here; `stripLineComment()` is called on each line just before parsing in `parseSourceItem()`.

### 7.2 Grammar Data (`grammarData.ts`)

This file is a single flat module of exported constants — think of it as the grammar's vocabulary:

- `TOP_LEVEL_KEYWORDS` — the `Set` of keywords that can start a retained top-level declaration: `enum`, `.type`, `.union`, and `op`.
- `REGISTERS_8`, `REGISTERS_16`, `REGISTERS_16_SHADOW` — the Z80 register names (always in upper-case canonical form, e.g. `"HL"`, `"AF'"`).
- `CONDITION_CODES` — `z`, `nz`, `c`, `nc`, `pe`, `po`, `m`, `p`.
- `IMM_OPERATOR_PRECEDENCE` — an array of `{ level, ops }` objects that defines the full operator precedence table for immediate expressions, from multiply/divide (level 7) down to bitwise OR (level 2). This drives the Pratt parser in `parseImm.ts`.
- `MATCHER_TYPES` — the types that can appear in `op` parameter declarations: `reg8`, `reg16`, `idx16`, `cc`, `imm8`, `imm16`, `ea`, `mem8`, `mem16`.
- `CHAR_ESCAPE_VALUES` — the escape sequences recognised in character and string literals.
- `SCALAR_TYPES` — `byte`, `word`, `addr`.

Nothing in `grammarData.ts` has any side effects; it is pure data.

### 7.3 The Parser Entry Point (`parser.ts`)

`parseSourceFile(sourcePath, sourceText, diagnostics)` is the function called once per source file. It:

1. Creates a `SourceFile` via `makeSourceFile()` in `source.ts`, which pre-computes the byte offset of every line start.
2. Calls `buildLogicalLines()` to get the `LogicalLine[]` array.
3. Builds the `sourceItemDispatchTable` — a map from each top-level keyword to a handler function.
4. Runs a loop over logical lines, calling `parseSourceItem()` for each.
5. Returns a `SourceFileNode`.

`parseSourceItem()` (a closure inside `parseSourceFile`) is where each line gets routed:

1. Strips the comment from the raw line and trims whitespace.
2. Parses the optional `export` prefix.
3. Identifies the dispatch keyword via `topLevelStartKeyword()` (which peeks at the first token of the line).
4. Calls the matching handler from the dispatch table.
5. Falls back to `recoverUnsupportedParserLine()` if no handler matches, which emits a diagnostic and advances past the bad line.

Parsing is **best-effort**: errors are reported and parsing continues so the user sees as many problems as possible in one pass.

### 7.4 Dispatch and Item Handlers

`parseSourceItemDispatch.ts` coordinates one logical line: AZM `.asm` handoff, dispatch-table lookup, and recovery. `parseSourceItemTable.ts` contains retained top-level AZM declarations such as `.type`, `.union`, `enum`, and `op`. Each retained entry is a function that takes a `ParseItemArgs` context (the line text, span, current line index, etc.) and returns a `ParseItemResult` — a `{ nextIndex, node? }` result.

The `nextIndex` field is important: handlers may consume multiple lines (for example `op`, `.type`, and `.union` declarations consume lines until their matching terminator), so the parser needs to know where to resume.

| Keyword         | File            |
| --------------- | --------------- |
| `op`            | `parseOp.ts`    |
| `.type`, `.union` | `parseTypes.ts` |
| `enum`          | `parseEnum.ts`  |

### 7.5 Parsing Ops

`parseOp.ts` remains part of AZM because visible `op` expansion is a retained
feature. The parser uses `parseOpHeader.ts` for op headers and
`parseOpParamsFromText()` for matcher declarations such as `dst reg8, src
reg16`.

The shared header parser handles op metadata:

- The op name.
- A parenthesised parameter list (`parseParams.ts`).
- An optional `: RP` return-register annotation (e.g. `: HL`).

For canonical AZM design, formal function arguments and locals are retired. Any
procedure-contract work must be explicit assembler-level metadata, not a return
to ZAX `func`.

### 7.6 Parsing ASM Bodies

`parseAsmStatements.ts` is the core of the body parser. It iterates over lines and for each one calls `parseAsmStatement()`, which:

1. Detects label definitions (lines ending in `:`).
2. Rejects or routes retired structured-control keywords through the removal boundary.
3. Falls through to `parseAsmInstruction.ts` for everything else.

`parseAsmInstruction.ts` tokenises the line into a mnemonic (the "head") and zero-or-more operands. It handles the `in` and `out` port syntaxes specially; everything else is parsed as a plain Z80 mnemonic and delegates operand parsing to `parseOperands.ts`.

`parseOperands.ts` parses the comma-separated operand list. Each operand is one of:

- `Reg` — a recognised register name.
- `Imm` — a bare immediate expression.
- `Ea` — an effective-address expression used for ordinary address constants and memory operands.
- `Mem` — a memory operand in parentheses, e.g. `(hl)`.
- `PortC` — the `(C)` port operand.
- `PortImm8` — a `(n)` port operand.

### 7.7 Parsing Expressions: Immediates and Effective Addresses

**Immediate expressions** (`parseImm.ts`) are parsed with a standard Pratt (top-down operator precedence) parser. The precedence table comes from `grammarData.ts`. Supported forms:

- Decimal, hex (`$xx` or `0xXX`), binary (`%xxxxxxxx`) and character literals (`'c'`).
- Named constants and enum members.
- `sizeof(TypeExpr)` and `offset(TypeExpr, path)`.
- Unary `+`, `-`, `~`.
- Binary `*`, `/`, `%`, `+`, `-`, `<<`, `>>`, `&`, `^`, `|`.

**Effective-address expressions** (`parseOperands.ts` and inline in `parseImm.ts`) are inherited from ZAX. Runtime typed EA lowering is retired for AZM assembler. The retained AZM subset is layout constants that fold before instruction emission. The legacy EA tree can describe:

- A bare name (`pair_buf`, `local_var`).
- A field access (`pair_buf.lo`).
- An array index (`arr[i]`, `arr[HL]`, `arr[IX+2]`).
- An explicit address literal (`$1234`).
- A layout cast (`<MyType>BASE.field`).
- Arithmetic offsets (`+ n`, `- n`).

These are represented in the AST as `EaExprNode` variants.

---

## 8. The AST Contract (`frontend/ast.ts`)

`ast.ts` is a **type-only** file — it defines interfaces and type unions but contains zero runtime logic. Every node carries a `kind: string` discriminant and a `span: SourceSpan` for error reporting.

The top-level hierarchy:

```
ProgramNode
└── files: SourceFileNode[]
    └── items: SourceItemNode[]
```

`SourceItemNode` is a union of all possible top-level declarations:

```
AsmEquNode | EnumDeclNode
| UnionDeclNode | TypeDeclNode
| OpDeclNode
| AsmLabelNode | AsmInstructionNode
```

An `AsmBlockNode` holds a flat list of `AsmItemNode[]` for labels and instruction nodes. Retired structured-control tokens may still appear in old scaffolding, but AZM assembler treats them as removed syntax rather than as a lowering contract.

**Key expression types:**

`ImmExprNode` — immediate (compile-time) expression:

```
ImmLiteral | ImmName | ImmSizeof | ImmOffset
| ImmUnary | ImmBinary
```

`EaExprNode` — effective-address (possibly runtime) expression:

```
EaName | EaImm | EaLayoutCast | EaField | EaIndex | EaAdd | EaSub
```

`EaIndexNode` — the index part of an indexed EA:

```
IndexImm | IndexReg8 | IndexReg16 | IndexMemHL | IndexMemIxIy | IndexEa
```

Understanding these three type families is useful for reading the inherited
implementation. For AZM assembler, `ImmExprNode` and constant-folded layout paths
are product features; runtime `EaExprNode` lowering is quarantine/deletion
surface.

---

## 9. Semantics: Building the Compilation Environment

### 9.1 The Compile Environment (`semantics/env.ts`)

`buildEnv(program, diagnostics, options)` traverses the entire `ProgramNode` and populates a `CompileEnv`:

```typescript
interface CompileEnv {
  equates: Map<string, number>; // All assembler equate values, keyed by name
  enums: Map<string, number>; // All enum member values, keyed by "Enum.member"
  types: Map<string, TypeDeclNode | UnionDeclNode>; // Named types
  asmEquExprs?: Map<string, { expr: ImmExprNode; currentLocation?: number }>;
}
```

`evalImmExpr(expr, env, diagnostics?)` evaluates an `ImmExprNode` to a JavaScript `number` at compile time. It recursively handles all `ImmExprNode` variants:

- `ImmLiteral` → the literal value.
- `ImmName` → lookup in `env.equates` or `env.enums`.
- `ImmSizeof` → calls `sizeOfTypeExpr()`.
- `ImmOffset` → calls `offsetPathInTypeExpr()`.
- `ImmUnary` → applies the unary operator.
- `ImmBinary` → recursively evaluates both sides, then applies the operator.

Division by zero is caught and reported as a diagnostic.

`declVisitor.ts` provides `visitDeclTree()`, a utility that walks the whole program tree in declaration order. `buildEnv()` uses it to collect all declarations before any cross-references are evaluated.

### 9.2 Type Layout (`semantics/layout.ts`)

`sizeOfTypeExpr(typeExpr, env)` computes the byte size of a type expression:

- `byte` → 1
- `word`, `addr` → 2
- `TypeName` → looks up the named type in `env.types` and recurses.
- `ArrayType` → `element_size * length`.
- `RecordType` → sum of all field sizes.

`offsetPathInTypeExpr(typeExpr, path, env)` computes the byte offset of a field path within a record type. This is what `offset(T, field)` and retained layout-cast constants evaluate to at compile time.

### 9.3 Semantic Validation

After parsing, AZM builds the compile-time environment from labels, constants,
types, enums, layout declarations, and inline ops. Instruction-form validation
now lives with parsing and lowering rather than in a separate ZAX-style semantic
acceptance pass.

---

## 10. Lowering: From AST to Bytes

The lowering phase lives entirely in `src/lowering/`. It is by far the largest subsystem. `emitProgram()` in `emit.ts` is the entry point.

### 10.1 The Four Phases (`lowering/emit.ts` and `emitPipeline.ts`)

`emitPipeline.ts` documents and names the four phases. `emit.ts` runs them:

```typescript
// Phase 1: workspace wiring
const workspace = createEmitPhase1Workspace(program, env, options);
const phase1 = createEmitPhase1Helpers({ program, env, diagnostics, workspace, options });

// Phase 2: prescan
const prescan = runEmitPrescanPhase(phase1.programLoweringContext);

// Phase 3: lowering
const lowered = runEmitLoweringPhase(phase1.programLoweringContext, prescan);

// Phase 4: finalization
const finalized = runEmitPlacementAndArtifactPhase(
  mergeEmitFinalizationContext(lowered, buildEmitFinalizationPhaseEnv(...))
);
```

### 10.2 Phase 1 — Workspace Setup

`createEmitPhase1Workspace()` in `emitPhase1Workspace.ts` initialises the mutable data structures that will be written into during lowering. The workspace has five top-level sub-objects (instead of one flat bag):

- **`emission`:** merged and per-placement byte maps, listing `codeSourceSegments`, and the lowered-asm stream buffers.
- **`symbols`:** symbol tables, `PendingSymbol` queues, `taken` names, and `fixups` / `rel8Fixups` pending relocation entries.
- **`ops`:** retained op maps, declared `op`/`bin` name sets, and op candidate resolver closures.
- **`config`:** `primaryFile` and `includeDirs`.
- **`placement`:** alias maps and placement `baseExprs` used by retained assembler paths.

Phase 1 helpers still create per-phase offset refs (`codeOffsetRef`, and similar) inside `createEmitStateHelpers`; those live alongside the workspace, not inside it.

`createEmitPhase1Helpers()` in `emitPhase1Helpers.ts` then wires callbacks and utilities around the workspace to build the `ProgramLoweringContext` that phases 2–3 consume.

### 10.3 Phase 2 — Prescan

`preScanProgramDeclarations()` in `programLowering.ts` does a _first_ pass over the program to collect metadata needed by the lowering pass:

- **Ops map:** for every `OpDeclNode`, records the overloads under the op name.
- **Alias map:** retained directive/source alias metadata where it supports assembler lowering.
- **Raw-address symbols:** identifies `extern` declarations that have a fixed address.

Returns a `PrescanResult` that phase 3 unpacks.

### 10.4 Phase 3 — Lowering Declarations

`lowerProgramDeclarations()` in `programLowering.ts` is the main emission loop. It iterates through every retained source item in flattened include order and dispatches each to an appropriate handler in `programLoweringDeclarations.ts`:

- **`AsmAlignNode`** → advances the active placement offset to the next alignment boundary through the ASM80 directive path.
- **`AsmEquNode`** / **`EnumDeclNode`** / **`TypeDeclNode`** → already processed by `buildEnv()`; no code is emitted.

Returns a `LoweringResult` which is the fully populated byte maps plus all pending fixups and symbols.

### 10.5 Removed ZAX Lowering Boundary

ZAX function/module/section lowering is not part of AZM assembler. The old
function-frame, function-call, typed-storage, and structured-control paths are
deletion targets, not compatibility layers. AZM lowering starts from flat
assembler items: labels, directives, instructions, layout constants, and visible
`op` expansions.

### 10.6 Instruction Lowering

`asmInstructionLowering.ts` provides the instruction-level dispatch. For each `AsmInstructionNode` it inspects the `head` string and routes to the appropriate sub-handler:

| Head                                                 | Handler                                            |
| ---------------------------------------------------- | -------------------------------------------------- |
| `ld`                                                 | `asmLoweringLd.ts` (then into the ld sub-pipeline) |
| Branch mnemonics (`jp`, `jr`, `call`, `ret`, `djnz`) | `asmLoweringBranchCall.ts`                         |
| Op invocations                                       | `opExpansionOrchestration.ts`                      |
| Everything else                                      | `z80/encode.ts` directly                           |

AZM source uses explicit branch instructions and labels. ZAX structured control
tokens are removed from the assembler surface.

### 10.7 The `ld` Sub-Pipeline

AZM keeps ordinary Z80 `ld` encoding and compile-time layout constants.
It does not route layout casts through typed memory transfer planning. The
retained `ld` path is:

1. `asmLoweringLd.ts` — top entry point; prepares accepted operands for Z80 `ld` encoding.
2. `ldLowering.ts` — integrates the retained lowering path.
3. `ldFormSelection.ts` — chooses the correct Z80 `ld` form (register-to-register, immediate-to-register, register-to-memory, etc.).
4. `ldEncoding.ts` / `ldEncodingRegMemHelpers.ts` — emit the actual bytes.

For a simple case like `ld a, b` this reduces to a single opcode. For a layout
constant such as `ld hl,<Sprite[16]>SPRITES[3].flags`, the expression folds to a
plain immediate/fixup operand before `ld` encoding.

### 10.8 Op Expansion (Macro-Instructions)

`op` declarations define parameterised instruction templates. When the lowerer encounters a call to an op, it:

1. Identifies the op's overloads by name lookup (`opMatching.ts`).
2. Matches the call-site operands against each overload's parameter matchers to find the best match.
3. Executes the expansion (`opExpansionExecution.ts`): runs the op body as if it were inlined, substituting parameters for their call-site arguments (`opSubstitution.ts`).
4. Emits the resulting instructions into the output stream as if they had been written directly.

### 10.9 Removed Typed EA Materialization Boundary

Runtime typed effective-address materialization belonged to old ZAX. AZM
does not synthesize pointer arithmetic, stack walks, or typed load/store
pipelines from operand types. Layout casts and `offset(...)` forms must fold to
constants before instruction emission; anything that needs runtime address code
must be written as visible Z80 instructions.

### 10.10 Phase 4 — Finalization, Fixups, and Placement

`finalizeEmitProgram()` in `emitFinalization.ts` does four things:

1. **Placement calculation** (`programLoweringFinalize.ts`): computes final addresses from explicit `.org` placement, emitted ranges, and fixups.
2. **Fixup resolution** (`fixupEmission.ts` and the finalization loop): every entry in the `fixups` array is a `{ offset, symbol, addend }` triple. The finaliser looks up the symbol in the now-resolved symbol table, computes the final address, and patches the two bytes at `offset`. `rel8Fixups` do the same for 8-bit signed relative displacements (used by `jr` and `djnz`).
3. **Lowered-ASM placement** (`loweredAsmPlacement.ts`): assigns final addresses to all blocks in the `LoweredAsmStream`, producing the `LoweredAsmProgram` that the `.z80` writer consumes.

Returns `{ map: EmittedByteMap, symbols: SymbolEntry[], placedLoweredAsmProgram }`.

---

## 11. Z80 Machine-Code Encoding (`src/z80/`)

The `z80/` folder is the pure instruction-encoding layer. It knows nothing about ZAX types, functions, modules, or named sections — it only knows how to turn `(mnemonic, operands)` into a byte array.

`encode.ts` is the dispatcher. It looks up the instruction family for a mnemonic in `encoderRegistry.ts`, then calls the appropriate family encoder:

| File               | Instructions                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encodeCoreOps.ts` | `nop`, `halt`, `di`, `ei`, `ex`, `exx`, `daa`, `cpl`, `scf`, `ccf`, `rlca`, `rrca`, `rla`, `rra`, `rld`, `rrd`, `neg`, `retn`, `reti`, `ldi`, `ldir`, `ldd`, `lddr`, `cpi`, `cpir`, `cpd`, `cpdr` |
| `encodeAlu.ts`     | `add`, `adc`, `sub`, `sbc`, `and`, `or`, `xor`, `cp`, `inc`, `dec`                                                                                                                                |
| `encodeBitOps.ts`  | `bit`, `set`, `res`, `rl`, `rr`, `rlc`, `rrc`, `sla`, `sra`, `srl`                                                                                                                                |
| `encodeControl.ts` | `jp`, `jr`, `call`, `ret`, `djnz`                                                                                                                                                                 |
| `encodeIo.ts`      | `in`, `out`, `im`, `rst`                                                                                                                                                                          |
| `encodeLd.ts`      | `ld` (the most complex — handles all 2- and 3-operand forms)                                                                                                                                      |

Each encoder inspects the operand kinds and emits the correct opcode bytes. For instructions that encode a fixup reference (like `call target_address`), they emit placeholder bytes and push a fixup record onto the queue.

`encoderRegistry.ts` holds a `Map<mnemonic, EncoderFamily>` and provides `getEncoderRegistryEntry()`, which also validates arity (number of operands) before dispatching, so arity errors get a clean diagnostic rather than a crash.

---

## 12. The Lowered-ASM Intermediate Representation

Between the high-level AST and the final byte map there is a second, lower-level IR: the **Lowered-ASM stream**, defined in `loweredAsmTypes.ts`.

```typescript
type LoweredAsmProgram = {
  blocks: LoweredAsmBlock[];
};

type LoweredAsmBlock = {
  label?: string;
  address?: number; // set after placement
  items: LoweredAsmItem[];
};

type LoweredAsmItem =
  | { kind: 'label'; name: string }
  | { kind: 'const'; name: string; value: number }
  | { kind: 'db'; values: number[] }
  | { kind: 'dw'; values: Array<number | LoweredImmExpr> }
  | { kind: 'ds'; size: number }
  | { kind: 'instr'; mnemonic: string; operands: LoweredAsmOperand[] }
  | { kind: 'comment'; text: string };
```

This IR is produced alongside byte emission during phase 3 by `loweredAsmStreamRecording.ts`. It records every instruction emitted, with simplified lowered operands (no EA paths — everything has been flattened to registers, immediates, and memory operands). It exists for two purposes:

1. **The `.z80` format writer** (`formats/writeAsm80.ts`) turns it into a valid plain-Z80 assembler source that another tool could assemble and get identical bytes.
2. **Debugging** — the IR preserves the structure of the original code (labels, comments, instruction order) in a form that maps cleanly back to the output listing.

---

## 13. Output Format Writers (`src/formats/`)

All format writers are pure functions that take `(EmittedByteMap, SymbolEntry[])` and return an `Artifact`:

```typescript
type Artifact = {
  name: string; // filename suffix, e.g. ".hex"
  content: string | Uint8Array;
};
```

### `writeBin.ts`

Writes a flat binary. It finds the lowest and highest addresses in the byte map, allocates a `Uint8Array` of the right size, and fills it. Address gaps are zero-padded.

### `writeHex.ts`

Produces Intel HEX format. The byte map is split into records of up to 16 bytes each. Each record is a `:LLAAAATT…CC` line with length, address, type, data, and checksum. Terminates with the `:00000001FF` end record.

### `writeD8m.ts`

Writes a JSON debug map (`.d8.json`) consumed by the D8 debugger. Contains:

- The entry address and entry symbol name (found by looking for `main` or the startup label).
- The full symbol table, with kinds (`label`, `data`, `var`, `const`, `enum`), addresses, sizes, and source file/line info.
- Source-segment attribution (which byte ranges correspond to which source lines).

### `writeListing.ts`

Produces a human-readable listing. Each line shows the hex address, hex bytes, and the original source line. Symbol table is appended at the end.

### `writeAsm80.ts`

Produces a Z80-compatible assembler source from the `LoweredAsmProgram`. It walks each block and item, rendering labels, `org`, `db`/`dw`/`ds`, and instruction lines with their lowered operands.

---

## 14. Diagnostics System

`diagnosticTypes.ts` defines:

```typescript
type DiagnosticSeverity = 'error' | 'warning' | 'info';

interface Diagnostic {
  id: DiagnosticId;
  severity: DiagnosticSeverity;
  message: string;
  file?: string;
  line?: number;
  column?: number;
}
```

Diagnostic IDs are namespaced:

| Range    | Area                     |
| -------- | ------------------------ |
| `AZM000` | Unknown                  |
| `AZM001` | IoReadFailed             |
| `AZM1xx` | Parse errors             |
| `AZM2xx` | Encode errors            |
| `AZM3xx` | Emit/lowering errors     |
| `AZM4xx` | Semantics errors         |
| `AZM5xx` | Case-style lint warnings |

Every subsystem appends to a shared `Diagnostic[]` passed in from `compile.ts`. The compiler never throws for user-visible errors — it reports them and continues. `hasErrors()` in `compileShared.ts` is the central check used between phases.

---

## 15. The Test Suite

### Structure

Tests live in `test/` and use a standard test runner (Vitest/Jest-compatible). They are organised by area:

```
test/
├── frontend/          # Parser unit tests (grammar conformance, drift detection)
├── lowering/          # Lowering unit tests (directives, instruction emission, op expansion, etc.)
├── backend/           # Z80 encoding tests
├── helpers/           # Shared test utilities
└── pr<NNN>_*.test.ts  # Regression tests keyed to a PR
```

### PR Regression Tests

`pr<NNN>_*.test.ts` files name-check specific features introduced in a given PR. They are typically narrow integration tests: compile a small snippet, check that specific bytes appear at specific offsets, or check that a specific diagnostic is emitted.

### Unit Tests

`test/lowering/` contains deeply focused unit tests for internal modules. `test/frontend/pr762_grammar_data_conformance.test.ts` verifies that the grammar data tables stay in sync with the parser.

### `test/helpers/`

Shared utilities for constructing minimal `CompileEnv` objects, running the parser on a snippet, or invoking just the encoder on a single instruction node.

---

## 16. Cross-Cutting Concerns and Design Patterns

### Discriminated Unions for AST Nodes

Every AST node type uses a `kind: 'SomeString'` discriminant. TypeScript's control-flow narrowing means any `switch (node.kind)` is exhaustively checked. If you add a new node variant to `ast.ts` you will get type errors wherever the existing exhaustive switches live — a built-in safety net.

### Mutable Reference Objects (`{ current: T }`)

The lowering code uses `{ current: T }` objects for values that are shared and mutated across closures — for example, `codeOffsetRef: { current: number }`. This pattern avoids closure capture issues when passing offsets between helpers and makes mutation explicit at the call site (`codeOffsetRef.current += bytes.length`).

### Best-Effort Parsing and Error Recovery

The parser never throws on bad input. Instead it calls `parseDiag()` to append an error and returns a `{ nextIndex }` that advances past the bad line. `parseParserRecovery.ts` collects recovery strategies for common mistake patterns (missing `end`, unrecognised keyword, etc.) and tries to emit a helpful diagnostic rather than just "parse error".

### Phase Gating with `hasErrors()`

`compile.ts` calls `hasErrors(diagnostics)` after every major phase. This keeps error messages clean: if the parser fails you never see lowering errors caused by a broken AST.

### Separation of Type Contracts from Logic

`ast.ts`, `loweringTypes.ts`, `loweredAsmTypes.ts`, and `pipeline.ts` are all type-only files. No logic lives in them. This makes it straightforward to understand the data shapes without also understanding the algorithms.

### `PipelineDeps` for Testability

The format writers are injected via `PipelineDeps` rather than imported directly. Tests can supply a mock `PipelineDeps` that captures output as strings, enabling end-to-end testing without touching the filesystem.

---

## 17. Quick Reference: File → Responsibility

| File                                  | One-line summary                                             |
| ------------------------------------- | ------------------------------------------------------------ |
| `cli.ts`                              | Parse CLI args → call `compile()` → write files              |
| `compile.ts`                          | Top-level pipeline: load → parse → semantics → lower → write |
| `compileShared.ts`                    | `hasErrors()`, `normalizePath()`                             |
| `diagnosticTypes.ts`                  | `Diagnostic` interface, `DiagnosticIds` enum                 |
| `pipeline.ts`                         | `CompilerOptions`, `PipelineDeps`, `CompileFn` interfaces    |
| `sourceLoader.ts`                     | `loadProgram()` — file I/O and source assembly               |
| `sourceIncludeExpansion.ts`           | Textual include expansion with source-line provenance        |
| `sourceIncludePaths.ts`               | Textual include candidate path resolution                    |
| `lintCaseStyle.ts`                    | Case-style linting pass                                      |
| `frontend/ast.ts`                     | All AST types (no logic)                                     |
| `frontend/parser.ts`                  | `parseSourceFile()`                                          |
| `frontend/source.ts`                  | `SourceFile`, `makeSourceFile()`, `span()`                   |
| `frontend/grammarData.ts`             | Register names, keywords, operator precedence tables         |
| `frontend/parseLogicalLines.ts`       | `buildLogicalLines()` — backslash line-continuation          |
| `frontend/parseSourceItemDispatch.ts` | Shared logical-line coordinator                              |
| `frontend/parseSourceItemTable.ts`    | Retained top-level declaration parser table                  |
| `frontend/parseAsmStatements.ts`      | ASM body parser — labels, control flow, instructions         |
| `frontend/parseImm.ts`                | Immediate expression Pratt parser                            |
| `frontend/parseOperands.ts`           | ASM operand parser (Reg, Imm, Ea, Mem, Port)                 |
| `semantics/env.ts`                    | `CompileEnv`, `buildEnv()`, `evalImmExpr()`                  |
| `semantics/layout.ts`                 | `sizeOfTypeExpr()`, `offsetPathInTypeExpr()`                 |
| `semantics/typeQueries.ts`            | Type resolution helpers, `typeDisplay()`                     |
| `lowering/emit.ts`                    | `emitProgram()` — top-level lowering entry point             |
| `lowering/emitPipeline.ts`            | Phase names, phase runners, result types                     |
| `lowering/programLowering.ts`         | `preScanProgramDeclarations()`, `lowerProgramDeclarations()` |
| `lowering/asmInstructionLowering.ts`  | Instruction-level dispatch                                   |
| `lowering/asmLoweringLd.ts`           | `ld` lowering (entry)                                        |
| `lowering/ldFormSelection.ts`         | ld form selection                                            |
| `lowering/ldEncoding.ts`              | ld byte encoding                                             |
| `lowering/opMatching.ts`              | Op overload matching                                         |
| `lowering/opExpansionExecution.ts`    | Op body inlining                                             |
| `lowering/emitFinalization.ts`        | Phase 4: fixup resolution, byte placement                    |
| `lowering/loweredAsmTypes.ts`         | Lowered-ASM IR types                                         |
| `lowering/fixupEmission.ts`           | Fixup queue management                                       |
| `z80/encode.ts`                       | Z80 instruction encoder dispatcher                           |
| `z80/encodeLd.ts`                     | `ld` instruction encoding                                    |
| `z80/encodeControl.ts`                | Branch/call instruction encoding                             |
| `z80/encodeAlu.ts`                    | ALU instruction encoding                                     |
| `z80/encodeBitOps.ts`                 | Bit-operation encoding                                       |
| `formats/types.ts`                    | `EmittedByteMap`, `SymbolEntry`, `Artifact` types            |
| `formats/writeBin.ts`                 | Flat binary writer                                           |
| `formats/writeHex.ts`                 | Intel HEX writer                                             |
| `formats/writeD8m.ts`                 | D8 debug-map JSON writer                                     |
| `formats/writeListing.ts`             | Assembler listing writer                                     |
| `formats/writeAsm80.ts`               | Lowered Z80 assembler source writer                          |

---

_This document was generated in March 2026 against the `main` branch of AZM. If you find anything that has drifted from the current source, please open an issue or update this file._
