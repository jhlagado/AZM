# A Guided Tour of the ZAX Compiler

> **Audience:** Someone reading the ZAX source code for the first time and wanting a coherent mental model before diving in.
> **Goal:** By the end of this document you should be able to open any file in `src/`, understand which phase of the compiler it belongs to, why it exists, and how it connects to its neighbours.

---

## Table of Contents

1. [What ZAX Is](#1-what-zax-is)
2. [Repository Layout at a Glance](#2-repository-layout-at-a-glance)
3. [The Compilation Pipeline — Overview](#3-the-compilation-pipeline--overview)
4. [A Running Example](#4-a-running-example)
5. [Entry Points: `cli.ts` and `compile.ts`](#5-entry-points-clits-and-compilets)
6. [Module Loading (`moduleLoader.ts` and friends)](#6-module-loading-moduleloaderts-and-friends)
7. [The Frontend: Turning Text into an AST](#7-the-frontend-turning-text-into-an-ast)
   - 7.1 [Logical Lines (`parseLogicalLines.ts`)](#71-logical-lines-parselogicallinests)
   - 7.2 [Grammar Data (`grammarData.ts`)](#72-grammar-data-grammardatats)
   - 7.3 [The Parser Entry Point (`parser.ts`)](#73-the-parser-entry-point-parserts)
   - 7.4 [Dispatch and Item Handlers](#74-dispatch-and-item-handlers)
   - 7.5 [Parsing Functions and Ops](#75-parsing-functions-and-ops)
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
    - 10.5 [Function Lowering in Detail](#105-function-lowering-in-detail)
    - 10.6 [Instruction Lowering](#106-instruction-lowering)
    - 10.7 [The `ld` Sub-Pipeline](#107-the-ld-sub-pipeline)
    - 10.8 [Op Expansion (Macro-Instructions)](#108-op-expansion-macro-instructions)
    - 10.9 [Value Materialization and the Step Library](#109-value-materialization-and-the-step-library)
    - 10.10 [Phase 4 — Finalization, Fixups, and Placement](#1010-phase-4--finalization-fixups-and-placement)
11. [Z80 Machine-Code Encoding (`src/z80/`)](#11-z80-machine-code-encoding-srcz80)
12. [The Lowered-ASM Intermediate Representation](#12-the-lowered-asm-intermediate-representation)
13. [Output Format Writers (`src/formats/`)](#13-output-format-writers-srcformats)
14. [Diagnostics System](#14-diagnostics-system)
15. [The Test Suite](#15-the-test-suite)
16. [Cross-Cutting Concerns and Design Patterns](#16-cross-cutting-concerns-and-design-patterns)
17. [Quick Reference: File → Responsibility](#17-quick-reference-file--responsibility)

---

## 1. What ZAX Is

ZAX is a structured assembler for the Z80 processor. It accepts `.zax` source files that look a lot like assembly but add:

- **Named, typed variables** at module scope (`globals`/`var`) and function scope (`var`).
- **Typed function declarations** with named parameters and declared return registers.
- **Structured control flow** — `if/else/end`, `while/end`, `repeat/until`, `select/case/end` — that compile down to conditional jumps.
- **Typed effective addresses** — you write `pair_buf.lo` and the compiler resolves the field offset.
- **Op declarations** — parameterised macro-instructions that can accept registers, immediates, or effective addresses as arguments.
- **Named sections** with placement anchors, enabling fine-grained memory-map control.
- **Import system** — modules can split across files.

The compiler turns this into standard Z80 machine code, producing flat binary, Intel HEX, a listing file, a debug-map JSON (`.d8.json`), and optionally a lowered plain-Z80 source file (`.z80`).

---

## 2. Repository Layout at a Glance

```
src/
├── cli.ts                     # Command-line entry point
├── compile.ts                 # Main compile() function — pipeline orchestration
├── compileShared.ts           # Tiny shared helpers (hasErrors, normalizePath)
├── diagnosticTypes.ts         # Diagnostic ID constants and Diagnostic interface
├── pipeline.ts                # CompilerOptions and PipelineDeps interfaces
├── moduleIdentity.ts          # Canonical module-ID generation
├── moduleLoader.ts            # File loading, include expansion, import resolution
├── moduleLoaderIncludePaths.ts# Import candidate path resolution
├── moduleVisibility.ts        # Cross-module symbol visibility rules
├── lintCaseStyle.ts           # Case-style linting (keywords/registers)
├── sectionKeys.ts             # Named section key collection
│
├── frontend/                  # Parsing: text → AST
│   ├── ast.ts                 # AST type contracts (no logic)
│   ├── parser.ts              # parseModuleFile() — top-level parser
│   ├── source.ts              # SourceFile, line offsets, span()
│   ├── grammarData.ts         # Register names, keywords, operator precedence tables
│   ├── parseLogicalLines.ts   # Line-continuation (backslash) handling
│   ├── parseParserShared.ts   # Shared helpers: stripLineComment, isReservedName, etc.
│   ├── parseDiagnostics.ts    # parseDiag() helper
│   ├── parseParserRecovery.ts # Error-recovery helpers
│   ├── parseModuleCommon.ts   # topLevelStartKeyword(), diagInvalidHeaderLine()
│   ├── parseModuleItemDispatch.ts # Dispatch table for top-level keywords
│   ├── parseTopLevelSimple.ts # const, align, bin, hex declarations
│   ├── parseFunc.ts           # func declaration
│   ├── parseOp.ts             # op declaration
│   ├── parseCallableHeader.ts # Shared header (name + params) for func/op
│   ├── parseGlobals.ts        # globals block
│   ├── parseData.ts           # data block + initializers
│   ├── parseEnum.ts           # enum declaration
│   ├── parseExtern.ts         # extern declaration
│   ├── parseExternBlock.ts    # extern block body
│   ├── parseTypes.ts          # type and union declarations
│   ├── parseParams.ts         # Parameter list parsing
│   ├── parseImm.ts            # Immediate expression parser
│   ├── parseOperands.ts       # ASM operand parser
│   ├── parseAsmStatements.ts  # ASM statement dispatcher (labels, control, instructions)
│   ├── parseAsmInstruction.ts # Individual instruction line parser
│   ├── parseAsmControlHelpers.ts # Control-flow frame helpers
│   ├── parseAssignmentInstruction.ts # := assignment syntax
│   ├── parseStepInstruction.ts # step addressing instruction
│   ├── parseAsmCaseValues.ts  # case value range expressions
│   ├── parseRawDataDirectives.ts # db/dw/ds directives
│   └── parseSectionBodies.ts  # Named section body parsing
│
├── semantics/                 # Semantic analysis
│   ├── env.ts                 # CompileEnv, buildEnv(), evalImmExpr()
│   ├── layout.ts              # sizeOfTypeExpr(), offsetOfPathInTypeExpr()
│   ├── typeQueries.ts         # Type resolution helpers, typeDisplay()
│   ├── storageView.ts         # Storage-view management
│   ├── declVisitor.ts         # Declaration tree visitor
│   ├── instructionAcceptance.ts # Instruction semantic validation
│   ├── assignmentAcceptance.ts  # := statement validation
│   └── stepAcceptance.ts        # step instruction validation
│
├── lowering/                  # Code generation: AST + env → bytes
│   │
│   │  ── Orchestration ──
│   ├── emit.ts                # emitProgram(): phases 1-4 glued together
│   ├── emitPipeline.ts        # Phase 2/3/4 runners + result types
│   ├── emitContextBuilder.ts  # Program lowering context assembly
│   ├── emitPhase1Workspace.ts # Section byte maps and mutable state
│   ├── emitPhase1Helpers.ts   # Phase-1 helper construction
│   ├── emitProgramContext.ts  # ProgramLoweringContext wiring
│   ├── emitState.ts           # Mutable emission state
│   ├── emitVisibility.ts      # Symbol visibility tracking
│   ├── emitFinalization.ts    # Phase 4: fixup resolution + placement
│   ├── emitFinalizationSetup.ts # Finalization env setup
│   │
│   │  ── Program-level lowering ──
│   ├── programLowering.ts     # preScanProgramDeclarations() + lowerProgramDeclarations()
│   ├── programLoweringData.ts # Data block lowering
│   ├── programLoweringDeclarations.ts # Declaration dispatch helpers
│   ├── programLoweringFinalize.ts # Section base computation
│   │
│   │  ── Function lowering ──
│   ├── functionLowering.ts    # Per-function coordinator
│   ├── functionBodySetup.ts   # Body parsing + control-flow frame
│   ├── functionFrameSetup.ts  # Stack frame and locals allocation
│   ├── functionAsmRewriting.ts # Peephole / rewriting passes
│   ├── functionCallLowering.ts # Function call emission
│   │
│   │  ── ASM body / instruction lowering ──
│   ├── asmBodyOrchestration.ts # ASM block traversal
│   ├── asmInstructionLowering.ts # Instruction dispatch
│   ├── asmInstructionLdHelpers.ts # ld-instruction helpers
│   ├── asmLoweringAssign.ts   # := lowering
│   ├── asmLoweringLd.ts       # ld lowering
│   ├── asmLoweringStep.ts     # step lowering
│   ├── asmLoweringBranchCall.ts # Branch/call lowering
│   ├── asmLoweringHost.ts     # Host-instruction helpers
│   ├── asmRangeLowering.ts    # Range/loop lowering
│   ├── asmUtils.ts            # ASM utility functions
│   │
│   │  ── ld encoding sub-pipeline ──
│   ├── ldEncoding.ts          # Top-level ld encoding
│   ├── ldEncodingRegMemHelpers.ts # reg-mem encoding
│   ├── ldFormSelection.ts     # Load form selection
│   ├── ldTransferPlan.ts      # Load transfer planning
│   ├── ldLowering.ts          # ld lowering integration
│   │
│   │  ── Op (macro) expansion ──
│   ├── opMatching.ts          # Op overload matching
│   ├── opExpansionOrchestration.ts # Expansion orchestration
│   ├── opExpansionExecution.ts # Expansion execution
│   ├── opStackAnalysis.ts     # Stack effect analysis
│   ├── opSubstitution.ts      # Parameter substitution
│   │
│   │  ── Value materialisation / EA ──
│   ├── valueMaterialization.ts    # Orchestration
│   ├── valueMaterializationBase.ts # Base helper
│   ├── valueMaterializationContext.ts # Context
│   ├── valueMaterializationIndexing.ts # Indexing
│   ├── valueMaterializationRuntimeEa.ts # Runtime EA
│   ├── valueMaterializationTransport.ts # Transport
│   ├── eaResolution.ts        # EA name → storage location
│   ├── eaMaterialization.ts   # EA materialization
│   ├── addressingPipelines.ts # Addressing pipeline builders
│   ├── steps.ts               # Step library (pure addressing primitives)
│   │
│   │  ── Supporting infrastructure ──
│   ├── loweredAsmTypes.ts     # Lowered-ASM IR types
│   ├── loweredAsmByteEmission.ts # Lowered-ASM → bytes
│   ├── loweredAsmPlacement.ts # Lowered-ASM placement
│   ├── loweredAsmStreamRecording.ts # Stream recording
│   ├── loweringTypes.ts       # Shared lowering types (Callable, PendingSymbol, …)
│   ├── loweringDiagnostics.ts # Lowering diag helpers
│   ├── typeResolution.ts      # Type-resolution shim
│   ├── fixupEmission.ts       # Fixup queue management
│   ├── emissionCore.ts        # Core emission helpers
│   ├── emitStepImports.ts     # Step-instruction import handling
│   ├── runtimeAtomBudget.ts   # Runtime atom budget enforcement
│   ├── runtimeImmediates.ts   # Runtime immediate handling
│   ├── capabilities.ts        # Capability checking
│   ├── startupInit.ts         # Startup initialisation helpers
│   ├── inputAssets.ts         # bin/hex asset loading
│   ├── sectionContributions.ts # Named-section contribution sinks
│   ├── sectionLayout.ts       # Section layout management
│   ├── sectionPlacement.ts    # Section placement and addressing
│   ├── scalarWordAccessors.ts # Scalar word accessor helpers
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
├── language-tour/             # End-to-end ZAX programs (golden tests)
├── frontend/                  # Parser unit tests
├── lowering/                  # Lowering unit/integration tests
├── backend/                   # Encoding tests
├── helpers/                   # Shared test utilities
└── pr<NNN>_*.test.ts          # Feature regression tests (one per PR)
```

---

## 3. The Compilation Pipeline — Overview

Compiling a ZAX program happens in a clearly phased pipeline. Before looking at any individual file, it pays to have the whole sequence in your head:

```
 Source text(s)
       │
       ▼
┌─────────────────┐
│  Module Loading │  Read files from disk, expand includes, resolve imports
└────────┬────────┘
         │  ProgramNode (tree of ModuleFileNodes, each a parsed .zax file)
         ▼
┌─────────────────┐
│    Parsing      │  Text → AST (frontend/)
└────────┬────────┘
         │  ProgramNode (fully populated AST)
         ▼
┌─────────────────┐
│   Semantics     │  Build CompileEnv, validate assignments/steps
└────────┬────────┘
         │  CompileEnv (consts, enums, types, visibility)
         ▼
┌──────────────────────────────────────────────────────────┐
│  Lowering (lowering/)                                    │
│                                                          │
│  Phase 1: Workspace setup (section maps, fixup queues)   │
│  Phase 2: Prescan (build callables/ops/alias maps)       │
│  Phase 3: Lower declarations (emit bytes + fixups)       │
│  Phase 4: Finalize (place sections, resolve fixups)      │
└────────┬─────────────────────────────────────────────────┘
         │  EmittedByteMap + SymbolEntry[] + LoweredAsmProgram
         ▼
┌─────────────────┐
│  Format Writers │  Produce .bin, .hex, .d8.json, .lst, .z80
└─────────────────┘
```

Each phase can emit diagnostics. The pipeline performs a `hasErrors()` check after each major phase and short-circuits early on fatal errors. This means diagnostics accumulate up to the point of the first fatal error set, and you always see errors from the *highest* phase that successfully ran.

---

## 4. A Running Example

To make the tour concrete, we will follow this small ZAX program through the compiler. It defines a helper function and an exported `main`:

```zax
; File: example.zax

func inc_one(input_word: word): HL
  var
    temp_word: word = $22
  end

  de := input_word
  inc de
  temp_word := de
  de := temp_word
  ex de, hl
end

export func main()
  var
    result_word: word = $11
  end

  inc_one $44
  result_word := hl
end
```

By the end of the tour you will be able to trace exactly what every line of this source does to every data structure in the compiler.

---

## 5. Entry Points: `cli.ts` and `compile.ts`

### `cli.ts`

The command-line interface. It parses `process.argv`, constructs a `CompilerOptions` object, and calls the `compile()` function with a `PipelineDeps` object that wires in the real format writers (`writeHex`, `writeBin`, `writeD8m`, `writeListing`, `writeAsm80`). After compilation it writes artifacts to disk and prints diagnostics to `stderr`.

`PipelineDeps` (defined in `pipeline.ts`) is an interface that declares the format writers as a bundle. This indirection makes the compiler core fully testable without touching the filesystem — tests supply mock writers that capture the output in memory.

### `compile.ts`

This is the heart of the pipeline coordinator. `compile()` is an `async` function (because module loading reads from disk). It:

1. Calls `loadProgram()` to load all `.zax` files into a `ProgramNode`.
2. Checks for errors. If any, returns early.
3. Collects named-section keys via `collectNonBankedSectionKeys()`.
4. Validates that the program contains at least one declaration.
5. Optionally checks for a `main` function (`requireMain` option).
6. Runs `lintCaseStyle()` to warn about inconsistent register/keyword casing.
7. Builds the `CompileEnv` with `buildEnv()`.
8. Runs `validateAssignmentAcceptance()` and `validateStepAcceptance()`.
9. Calls `emitProgram()` which returns `{ map, symbols, placedLoweredAsmProgram }`.
10. Passes those products to the format writers to produce `Artifact[]`.
11. Returns `{ diagnostics, artifacts }`.

Notice the `withDefaults()` helper at the top of `compile.ts`. If the caller specifies *any* primary emit flag (`emitBin`, `emitHex`, `emitD8m`) then only those are written. If none is specified, all three default to `true`. `emitListing` defaults to `true` independently; `emitAsm80` defaults to `false`.

---

## 6. Module Loading (`moduleLoader.ts` and friends)

### What it does

`loadProgram()` in `moduleLoader.ts` is responsible for turning an entry-file path into a `LoadedProgram` — a `ProgramNode` that contains a `ModuleFileNode` for every imported module, plus auxiliary maps:

- `sourceTexts` — the raw text of each file (for the listing writer and debug map).
- `sourceLineComments` — a per-file, per-line index of inline comments (used in listings).
- `moduleTraversal` — the deterministic topological traversal order of module IDs.
- `resolvedImportGraph` — the resolved dependency graph as `Map<moduleId, moduleId[]>`.

### Include expansion

ZAX supports a `#include`-like mechanism at the preprocessor level. `expandIncludes()` is an internal async helper that reads a source file, scans it line by line for `include` directives, and splices the included file's lines in-place. The result is a flat expanded-source object with parallel `lineFiles[]` and `lineBaseLines[]` arrays so that diagnostics can always point to the original file and line number, even after inclusion. This expanded source is what actually gets parsed.

### Import resolution

After expansion, any `import` statements in the source are discovered by the parser. The loader re-reads those import targets (following `includeDirs` if provided), builds the `edges` map of dependencies, detects cycles (returning an error diagnostic if found), and assembles everything into the final `ProgramNode` in deterministic topological order.

**Key invariant:** module IDs are canonical (absolute or root-relative) strings. `canonicalModuleId()` in `moduleIdentity.ts` ensures two paths to the same file always produce the same module ID.

### `moduleLoaderIncludePaths.ts`

Contains `resolveImportCandidates()` and `resolveIncludeCandidates()`, which expand a bare module specifier (`"utils"`) into a list of candidate file paths to try, taking `includeDirs` into account.

### `moduleVisibility.ts`

Defines visibility rules: which constants and types exported from module A are visible to module B, given the import graph. Used by `buildEnv()` to populate `visibleConsts`, `visibleEnums`, and `visibleTypes` in the `CompileEnv`.

---

## 7. The Frontend: Turning Text into an AST

All parsing lives in `src/frontend/`. There is **no separate lexer**. Instead, parsing is done on logical lines, using regex and character-by-character scanning, guided by keyword lookups in the tables from `grammarData.ts`.

### 7.1 Logical Lines (`parseLogicalLines.ts`)

The very first transformation takes the raw source text (a flat string) and breaks it into **logical lines**. A logical line is almost always a physical line, but a backslash (`\`) followed immediately by a non-whitespace character splits a line into two logical statements. So:

```zax
de := input_word \ inc de
```

… produces two logical lines: `de := input_word` and `inc de`.

`buildLogicalLines()` also correctly handles backslashes inside string and character literals (so `'\\'` is not treated as a line-continuation). Each logical line is a `LogicalLine` record containing:

- `raw` — the text of the logical line (no trailing newline, no comment).
- `startOffset` / `endOffset` — byte offsets in the original source for source-span tracking.
- `lineNo` — 1-based line number in the original file (important after include expansion).
- `filePath` — the original file this line came from.

Comments are **not** stripped here; `stripLineComment()` is called on each line just before parsing in `parseModuleItem()`.

### 7.2 Grammar Data (`grammarData.ts`)

This file is a single flat module of exported constants — think of it as the grammar's vocabulary:

- `TOP_LEVEL_KEYWORDS` — the `Set` of keywords that can start a top-level declaration: `func`, `const`, `enum`, `data`, `import`, `type`, `union`, `globals`, `var`, `extern`, `bin`, `hex`, `op`, `section`, `align`.
- `REGISTERS_8`, `REGISTERS_16`, `REGISTERS_16_SHADOW` — the Z80 register names (always in upper-case canonical form, e.g. `"HL"`, `"AF'"`).
- `CONDITION_CODES` — `z`, `nz`, `c`, `nc`, `pe`, `po`, `m`, `p`.
- `ASM_CONTROL_KEYWORDS` — `if`, `else`, `end`, `while`, `repeat`, `until`, `break`, `continue`, `select`, `case`.
- `IMM_OPERATOR_PRECEDENCE` — an array of `{ level, ops }` objects that defines the full operator precedence table for immediate expressions, from multiply/divide (level 7) down to bitwise OR (level 2). This drives the Pratt parser in `parseImm.ts`.
- `MATCHER_TYPES` — the types that can appear in `op` parameter declarations: `reg8`, `reg16`, `idx16`, `cc`, `imm8`, `imm16`, `ea`, `mem8`, `mem16`.
- `CHAR_ESCAPE_VALUES` — the escape sequences recognised in character and string literals.
- `SCALAR_TYPES` — `byte`, `word`, `addr`.

Nothing in `grammarData.ts` has any side effects; it is pure data.

### 7.3 The Parser Entry Point (`parser.ts`)

`parseModuleFile(modulePath, sourceText, diagnostics)` is the function called once per module. It:

1. Creates a `SourceFile` via `makeSourceFile()` in `source.ts`, which pre-computes the byte offset of every line start.
2. Calls `buildLogicalLines()` to get the `LogicalLine[]` array.
3. Builds the `moduleItemDispatchTable` — a map from each top-level keyword to a handler function.
4. Runs a loop over logical lines, calling `parseModuleItem()` for each.
5. Returns a `ModuleFileNode`.

`parseModuleItem()` (a closure inside `parseModuleFile`) is where each line gets routed:

1. Strips the comment from the raw line and trims whitespace.
2. If inside a named section (`ctx.scope === 'section'`), checks for the closing `end` token.
3. Parses the optional `export` prefix.
4. Identifies the dispatch keyword via `topLevelStartKeyword()` (which peeks at the first token of the line).
5. Calls the matching handler from the dispatch table.
6. Falls back to `recoverUnsupportedParserLine()` if no handler matches, which emits a diagnostic and advances past the bad line.

Parsing is **best-effort**: errors are reported and parsing continues so the user sees as many problems as possible in one pass.

### 7.4 Dispatch and Item Handlers

`parseModuleItemDispatch.ts` builds the dispatch table. Each entry is a function that takes a `ParseItemArgs` context (the line text, span, `export` flag, current line index, etc.) and returns a `ParseItemResult` — a `{ nextIndex, node?, sectionClosed? }` triple.

The `nextIndex` field is important: handlers may consume multiple lines (e.g. a `func` declaration consumes lines until its matching `end`), so the parser needs to know where to resume.

Simple top-level keywords (`const`, `align`, `bin`, `hex`) are handled in `parseTopLevelSimple.ts`. More complex ones have dedicated files:

| Keyword | File |
|---------|------|
| `func` | `parseFunc.ts` |
| `op` | `parseOp.ts` |
| `type`, `union` | `parseTypes.ts` |
| `enum` | `parseEnum.ts` |
| `data` | `parseData.ts` |
| `globals`, `var` | `parseGlobals.ts` |
| `extern` | `parseExtern.ts` / `parseExternBlock.ts` |
| `section` | dispatches into `parseSectionBodies.ts` |

### 7.5 Parsing Functions and Ops

`parseFunc.ts` calls `parseCallableHeader.ts` to parse the `name(params): returnRegs` header, then collects logical lines until it finds a bare `end` keyword at the correct nesting level, calling `parseAsmStatements.ts` for the body.

The header parser, `parseCallableHeader.ts`, is shared between `func` and `op`. It handles:
- The function name.
- A parenthesised parameter list (`parseParams.ts`).
- An optional `: RP` return-register annotation (e.g. `: HL`).

`parseOp.ts` does the same but uses `parseOpParamsFromText()` which expects `op` parameter declarations like `dst: reg8, src: reg16`.

### 7.6 Parsing ASM Bodies

`parseAsmStatements.ts` is the core of the body parser. It iterates over lines and for each one calls `parseAsmStatement()`, which:

1. Detects label definitions (lines ending in `:`).
2. Detects structured control-flow keywords (`if`, `while`, `repeat`, `until`, `select`, `case`, `else`, `end`, `break`, `continue`) and creates `AsmControlNode` objects. Nesting depth is tracked in a `ControlFrame` stack managed by `parseAsmControlHelpers.ts`.
3. Falls through to `parseAsmInstruction.ts` for everything else.

`parseAsmInstruction.ts` tokenises the line into a mnemonic (the "head") and zero-or-more operands. It recognises:
- The special `:=` assignment head — handled by `parseAssignmentInstruction.ts`.
- The `step` head — handled by `parseStepInstruction.ts`.
- Everything else as a plain Z80 mnemonic, delegating operand parsing to `parseOperands.ts`.

`parseOperands.ts` parses the comma-separated operand list. Each operand is one of:
- `Reg` — a recognised register name.
- `Imm` — a bare immediate expression.
- `Ea` — an effective-address expression (possibly with an explicit `@` address-of prefix).
- `Mem` — a memory operand in parentheses, e.g. `(hl)`.
- `PortC` — the `(C)` port operand.
- `PortImm8` — a `(n)` port operand.

### 7.7 Parsing Expressions: Immediates and Effective Addresses

**Immediate expressions** (`parseImm.ts`) are parsed with a standard Pratt (top-down operator precedence) parser. The precedence table comes from `grammarData.ts`. Supported forms:

- Decimal, hex (`$xx` or `0xXX`), binary (`%xxxxxxxx`) and character literals (`'c'`).
- Named constants and enum members.
- `sizeof(TypeExpr)` and `offsetof(TypeExpr, path)`.
- Unary `+`, `-`, `~`.
- Binary `*`, `/`, `%`, `+`, `-`, `<<`, `>>`, `&`, `^`, `|`.

**Effective-address expressions** (`parseOperands.ts` and inline in `parseImm.ts`) are ZAX-specific. An EA describes a memory location in a way that may involve:

- A bare name (`pair_buf`, `local_var`).
- A field access (`pair_buf.lo`).
- An array index (`arr[i]`, `arr[HL]`, `arr[IX+2]`).
- An explicit address literal (`$1234`).
- A typed reinterpretation (`as MyType`).
- Arithmetic offsets (`+ n`, `- n`).

These are represented in the AST as `EaExprNode` variants.

---

## 8. The AST Contract (`frontend/ast.ts`)

`ast.ts` is a **type-only** file — it defines interfaces and type unions but contains zero runtime logic. Every node carries a `kind: string` discriminant and a `span: SourceSpan` for error reporting.

The top-level hierarchy:

```
ProgramNode
└── files: ModuleFileNode[]
    └── items: ModuleItemNode[]
```

`ModuleItemNode` is a union of all possible top-level declarations:

```
ImportNode | NamedSectionNode | ConstDeclNode | EnumDeclNode
| DataBlockNode | VarBlockNode | FuncDeclNode | UnionDeclNode
| TypeDeclNode | ExternDeclNode | BinDeclNode | HexDeclNode
| OpDeclNode | AlignDirectiveNode | UnimplementedNode
```

A `FuncDeclNode` is:
```typescript
{
  kind: 'FuncDecl',
  name: string,
  exported: boolean,
  params: ParamNode[],
  returnRegs: string[],   // e.g. ['HL']
  locals: VarBlockNode,   // the var...end block
  asm: AsmBlockNode,      // the body
}
```

An `AsmBlockNode` holds a flat list of `AsmItemNode[]` — labels, control nodes, and instruction nodes. The structured control flow (`if/while/…`) is represented as flat control tokens; the *nesting* is not made explicit in the AST. That nesting is reconstructed during lowering.

**Key expression types:**

`ImmExprNode` — immediate (compile-time) expression:
```
ImmLiteral | ImmName | ImmSizeof | ImmOffsetof
| ImmUnary | ImmBinary
```

`EaExprNode` — effective-address (possibly runtime) expression:
```
EaName | EaImm | EaReinterpret | EaField | EaIndex | EaAdd | EaSub
```

`EaIndexNode` — the index part of an indexed EA:
```
IndexImm | IndexReg8 | IndexReg16 | IndexMemHL | IndexMemIxIy | IndexEa
```

Understanding these three type families is crucial for comprehending the lowering phase.

---

## 9. Semantics: Building the Compilation Environment

### 9.1 The Compile Environment (`semantics/env.ts`)

`buildEnv(program, diagnostics, options)` traverses the entire `ProgramNode` and populates a `CompileEnv`:

```typescript
interface CompileEnv {
  consts:  Map<string, number>;      // All constant values, keyed by name
  enums:   Map<string, number>;      // All enum member values, keyed by "Enum.member"
  types:   Map<string, TypeDeclNode | UnionDeclNode>;  // Named types
  // Visibility-filtered sub-maps (cross-module):
  visibleConsts?:  Map<string, number>;
  visibleEnums?:   Map<string, number>;
  visibleTypes?:   Map<string, TypeDeclNode | UnionDeclNode>;
}
```

`evalImmExpr(expr, env, diagnostics?)` evaluates an `ImmExprNode` to a JavaScript `number` at compile time. It recursively handles all `ImmExprNode` variants:
- `ImmLiteral` → the literal value.
- `ImmName` → lookup in `env.consts` or `env.enums`.
- `ImmSizeof` → calls `sizeOfTypeExpr()`.
- `ImmOffsetof` → calls `offsetOfPathInTypeExpr()`.
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

`offsetOfPathInTypeExpr(typeExpr, path, env)` computes the byte offset of a field path within a record type. This is what `offsetof(T, field)` evaluates to at compile time, and it is also what the lowering phase uses when accessing named fields.

### 9.3 Semantic Validation Passes

After building the environment, `compile.ts` runs two validation passes before lowering:

**`validateAssignmentAcceptance()`** (`semantics/assignmentAcceptance.ts`) checks every `:=` instruction in every function body for semantic correctness — for example, that the right-hand side of a register assignment is actually a storable source.

**`validateStepAcceptance()`** (`semantics/stepAcceptance.ts`) validates every `step` instruction, checking that the target is a valid memory-incrementable variable.

Both passes append errors to `diagnostics` but do not modify the AST. Lowering is only attempted if both pass cleanly.

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

- **`emission`:** merged and per-section byte maps, listing `codeSourceSegments`, and the lowered-asm stream buffers.
- **`symbols`:** symbol tables, `PendingSymbol` queues, `taken` names, and `fixups` / `rel8Fixups` pending relocation entries.
- **`callables`:** per-file and merged callable/op maps, declared `op`/`bin` name sets, and visibility resolver closures.
- **`config`:** `opStackPolicyMode`, `rawTypedCallWarningsEnabled`, `primaryFile`, and `includeDirs`.
- **`storage`:** `storageTypes`, alias maps, stack slot maps, `rawAddressSymbols`, and section `baseExprs`.

Phase 1 helpers still create per-phase offset refs (`codeOffsetRef`, and similar) inside `createEmitStateHelpers`; those live alongside the workspace, not inside it.

`createEmitPhase1Helpers()` in `emitPhase1Helpers.ts` then wires callbacks and utilities around the workspace to build the `ProgramLoweringContext` that phases 2–3 consume.

### 10.3 Phase 2 — Prescan

`preScanProgramDeclarations()` in `programLowering.ts` does a *first* pass over the program to collect metadata needed by the lowering pass:

- **Callables map:** for every `FuncDeclNode` and `ExternFuncNode`, records name, file, parameter types, and return registers into a `Map<string, Callable>`, keyed by canonical function name.
- **Ops map:** for every `OpDeclNode`, records the overloads under the op name.
- **Storage type map:** collects the type annotation of every `VarDecl` and `DataDecl`.
- **Module alias map:** collects `var x = other_var` alias declarations.
- **Raw-address symbols:** identifies `extern` declarations that have a fixed address.

Returns a `PrescanResult` that phase 3 unpacks.

### 10.4 Phase 3 — Lowering Declarations

`lowerProgramDeclarations()` in `programLowering.ts` is the main emission loop. It iterates through every `ModuleItemNode` across all files (in module-traversal order) and dispatches each to an appropriate handler in `programLoweringDeclarations.ts`:

- **`FuncDeclNode`** → `lowerFunction()` (the big one — see §10.5).
- **`DataBlockNode`** → `lowerDataBlock()` in `programLoweringData.ts` — serialises the typed initialiser into the data section byte map.
- **`VarBlockNode`** (module-scope globals) → reserves space in the var section and records symbols.
- **`BinDeclNode`** / **`HexDeclNode`** → reads the binary asset from disk and splices it into the appropriate section.
- **`AlignDirectiveNode`** → advances the active section offset to the next alignment boundary.
- **`ConstDeclNode`** / **`EnumDeclNode`** / **`TypeDeclNode`** → already processed by `buildEnv()`; no code is emitted.
- **`NamedSectionNode`** → recursively processes the section's items inside the context of the named section.

Returns a `LoweringResult` which is the fully populated byte maps plus all pending fixups and symbols.

### 10.5 Function Lowering in Detail

`lowerFunction()` in `functionLowering.ts` is responsible for turning a single `FuncDeclNode` into machine-code bytes. It creates several helper bundles:

**Frame setup** (`functionFrameSetup.ts`):
- Allocates a stack frame for local variables. Each `VarDecl` in the function's `var` block gets a slot in the frame, sized by its type.
- Records the negative IX displacements for each variable (Z80 convention: locals are at `(IX-n)`).
- Emits the function prologue: `push ix`, `ld ix, 0`, `add ix, sp`, `ld sp, (IX)`.

**Body setup** (`functionBodySetup.ts`):
- Parses the flat list of `AsmItemNode[]` to reconstruct the *nesting* of structured control-flow constructs.
- Builds a `FlowState` — a stack of open control frames for `if/while/select/…`.
- Generates fresh label names for control-flow branch targets (e.g. `__while_top_0`, `__if_else_1`).

**Instruction lowering** (delegated to `asmBodyOrchestration.ts`): see §10.6.

**ASM rewriting** (`functionAsmRewriting.ts`):
- Post-pass peephole rewrites applied after the main lowering.

**Call lowering** (`functionCallLowering.ts`):
- Emits `call` instructions for function invocations with proper argument marshalling.

### 10.6 Instruction Lowering

`asmInstructionLowering.ts` provides the instruction-level dispatch. For each `AsmInstructionNode` it inspects the `head` string and routes to the appropriate sub-handler:

| Head | Handler |
|------|---------|
| `:=` | `asmLoweringAssign.ts` |
| `ld` | `asmLoweringLd.ts` (then into the ld sub-pipeline) |
| `step` | `asmLoweringStep.ts` |
| Branch mnemonics (`jp`, `jr`, `call`, `ret`, `djnz`) | `asmLoweringBranchCall.ts` |
| Range/loop instructions | `asmRangeLowering.ts` |
| Op invocations | `opExpansionOrchestration.ts` |
| Everything else | `z80/encode.ts` directly |

Structured control-flow tokens (`If`, `While`, `Repeat`, etc.) are handled in `asmBodyOrchestration.ts` by emitting the appropriate jump and label pairs. For example:

```zax
if Z
  ...body...
end
```

becomes (approximately):

```asm
jp nz, __if_end_0
  ...body bytes...
__if_end_0:
```

The label names are generated and deduped by the `FlowState` helpers.

### 10.7 The `ld` Sub-Pipeline

The `ld` instruction is the most complex in ZAX because it bridges the high-level typed world (EA expressions with field paths) and the restricted Z80 addressing modes. It has its own multi-file sub-pipeline:

1. `asmLoweringLd.ts` — top entry point; decides whether the operand is simple enough for direct Z80 encoding or needs the EA sub-pipeline.
2. `ldLowering.ts` — integrates EA resolution and transfer planning.
3. `ldTransferPlan.ts` — constructs a *transfer plan*: the sequence of primitive operations needed to move data between two memory locations via Z80 registers.
4. `ldFormSelection.ts` — chooses the correct Z80 `ld` form (register-to-register, immediate-to-register, register-to-memory, etc.).
5. `ldEncoding.ts` / `ldEncodingRegMemHelpers.ts` — emit the actual bytes.

For a simple case like `ld a, b` this reduces to a single opcode. For `de := input_word` (loading a 16-bit local variable into DE), it expands to a sequence of `ld` instructions accessing `(IX+offset)`.

### 10.8 Op Expansion (Macro-Instructions)

`op` declarations define parameterised instruction templates. When the lowerer encounters a call to an op, it:

1. Identifies the op's overloads by name lookup (`opMatching.ts`).
2. Matches the call-site operands against each overload's parameter matchers to find the best match.
3. Executes the expansion (`opExpansionExecution.ts`): runs the op body as if it were inlined, substituting parameters for their call-site arguments (`opSubstitution.ts`).
4. Emits the resulting instructions into the output stream as if they had been written directly.

`opStackAnalysis.ts` optionally checks that the op body does not leave the stack in an inconsistent state (controlled by the `opStackPolicy` option).

### 10.9 Value Materialization and the Step Library

When an instruction operand is a typed EA expression (like `pair_buf.lo` or `arr[ix+2]`), the lowerer needs to turn it into a valid Z80 addressing mode. This is **value materialisation**, the job of the `valueMaterialization*.ts` family.

The materialiser resolves each `EaExprNode` variant:
- `EaName` → looks up the storage location in the `CompileEnv` / `storageView` (global, local/IX, or raw address).
- `EaField` → resolves the base EA, then adds the field offset (from `offsetOfPathInTypeExpr`).
- `EaIndex` → resolves base + index, generating pointer arithmetic code.
- `EaAdd` / `EaSub` → applies a compile-time displacement.

The output is a sequence of **step instructions** defined in `steps.ts`. The step library is a catalogue of pure, typed micro-operations:

```typescript
type StepInstr =
  | { kind: 'push'; reg: StepStackReg }
  | { kind: 'pop'; reg: StepStackReg }
  | { kind: 'ldRegMemHl'; reg: StepReg8 }       // ld reg, (HL)
  | { kind: 'ldIxDispReg'; disp: number; reg: StepReg8 } // ld (IX+d), reg
  | { kind: 'ldRpGlob'; rp: 'DE'|'HL'; glob: string } // ld HL, (global)
  // … many more …
```

A `StepPipeline` is an ordered array of `StepInstr` that collectively implement a read or write of a memory location. These pipelines are built by `addressingPipelines.ts` and then rendered to actual Z80 bytes during emission.

`eaResolution.ts` maps an EA name to its concrete storage kind (global variable, local via IX, raw address, …). `eaMaterialization.ts` turns that resolution into a step pipeline.

### 10.10 Phase 4 — Finalization, Fixups, and Placement

`finalizeEmitProgram()` in `emitFinalization.ts` does four things:

1. **Named-section placement** (`sectionPlacement.ts`): for each named section with an `at` anchor, verifies that no two sections overlap and computes the final base address.
2. **Section base calculation** (`programLoweringFinalize.ts`): `computeSectionBases()` determines the final base address of the default code, data, and var sections. By default, code starts at address 0, data immediately follows (word-aligned), and var follows data (word-aligned). The `defaultCodeBase` option can relocate code.
3. **Fixup resolution** (`fixupEmission.ts` and the finalization loop): every entry in the `fixups` array is a `{ offset, symbol, addend }` triple. The finaliser looks up the symbol in the now-resolved symbol table, computes the final address, and patches the two bytes at `offset`. `rel8Fixups` do the same for 8-bit signed relative displacements (used by `jr` and `djnz`).
4. **Lowered-ASM placement** (`loweredAsmPlacement.ts`): assigns final addresses to all blocks in the `LoweredAsmStream`, producing the `LoweredAsmProgram` that the `.z80` writer consumes.

Returns `{ map: EmittedByteMap, symbols: SymbolEntry[], placedLoweredAsmProgram }`.

---

## 11. Z80 Machine-Code Encoding (`src/z80/`)

The `z80/` folder is the pure instruction-encoding layer. It knows nothing about ZAX types, functions, or sections — it only knows how to turn `(mnemonic, operands)` into a byte array.

`encode.ts` is the dispatcher. It looks up the instruction family for a mnemonic in `encoderRegistry.ts`, then calls the appropriate family encoder:

| File | Instructions |
|------|--------------|
| `encodeCoreOps.ts` | `nop`, `halt`, `di`, `ei`, `ex`, `exx`, `daa`, `cpl`, `scf`, `ccf`, `rlca`, `rrca`, `rla`, `rra`, `rld`, `rrd`, `neg`, `retn`, `reti`, `ldi`, `ldir`, `ldd`, `lddr`, `cpi`, `cpir`, `cpd`, `cpdr` |
| `encodeAlu.ts` | `add`, `adc`, `sub`, `sbc`, `and`, `or`, `xor`, `cp`, `inc`, `dec` |
| `encodeBitOps.ts` | `bit`, `set`, `res`, `rl`, `rr`, `rlc`, `rrc`, `sla`, `sra`, `srl` |
| `encodeControl.ts` | `jp`, `jr`, `call`, `ret`, `djnz` |
| `encodeIo.ts` | `in`, `out`, `im`, `rst` |
| `encodeLd.ts` | `ld` (the most complex — handles all 2- and 3-operand forms) |

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
  address?: number;       // set after placement
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
  name: string;     // filename suffix, e.g. ".hex"
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

| Range | Area |
|-------|------|
| `ZAX000` | Unknown |
| `ZAX001` | IoReadFailed |
| `ZAX1xx` | Parse errors |
| `ZAX2xx` | Encode errors |
| `ZAX3xx` | Emit/lowering errors |
| `ZAX4xx` | Semantics errors |
| `ZAX5xx` | Case-style lint warnings |

Every subsystem appends to a shared `Diagnostic[]` passed in from `compile.ts`. The compiler never throws for user-visible errors — it reports them and continues. `hasErrors()` in `compileShared.ts` is the central check used between phases.

---

## 15. The Test Suite

### Structure

Tests live in `test/` and use a standard test runner (Vitest/Jest-compatible). They are organised by area:

```
test/
├── language-tour/     # End-to-end golden tests (.zax → compare bytes/symbols)
├── frontend/          # Parser unit tests (grammar conformance, drift detection)
├── lowering/          # Lowering unit tests (addressing pipelines, op expansion, etc.)
├── backend/           # Z80 encoding tests
├── helpers/           # Shared test utilities
└── pr<NNN>_*.test.ts  # Regression tests keyed to a PR
```

### Golden Tests (`language-tour/`)

Each `.zax` file in `language-tour/` has a matching `.d8.json` committed alongside it. The test runner compiles the `.zax` source and compares the output symbol table and entry-point against the golden JSON. These tests exercise the full end-to-end pipeline.

### PR Regression Tests

`pr<NNN>_*.test.ts` files name-check specific features introduced in a given PR. They are typically narrow integration tests: compile a small snippet, check that specific bytes appear at specific offsets, or check that a specific diagnostic is emitted.

### Unit Tests

`test/lowering/` contains deeply focused unit tests for internal modules — e.g. `pr509_addressing_pipeline_builders.test.ts` tests the step-pipeline construction helpers in isolation. `test/frontend/pr762_grammar_data_conformance.test.ts` verifies that the grammar data tables stay in sync with the parser.

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

| File | One-line summary |
|------|-----------------|
| `cli.ts` | Parse CLI args → call `compile()` → write files |
| `compile.ts` | Top-level pipeline: load → parse → semantics → lower → write |
| `compileShared.ts` | `hasErrors()`, `normalizePath()` |
| `diagnosticTypes.ts` | `Diagnostic` interface, `DiagnosticIds` enum |
| `pipeline.ts` | `CompilerOptions`, `PipelineDeps`, `CompileFn` interfaces |
| `moduleIdentity.ts` | `canonicalModuleId()` |
| `moduleLoader.ts` | `loadProgram()` — file I/O, include expansion, import resolution |
| `moduleLoaderIncludePaths.ts` | Import candidate path resolution |
| `moduleVisibility.ts` | Cross-module export visibility rules |
| `lintCaseStyle.ts` | Case-style linting pass |
| `sectionKeys.ts` | `collectNonBankedSectionKeys()` |
| `frontend/ast.ts` | All AST types (no logic) |
| `frontend/parser.ts` | `parseModuleFile()`, `parseProgram()` |
| `frontend/source.ts` | `SourceFile`, `makeSourceFile()`, `span()` |
| `frontend/grammarData.ts` | Register names, keywords, operator precedence tables |
| `frontend/parseLogicalLines.ts` | `buildLogicalLines()` — backslash line-continuation |
| `frontend/parseModuleItemDispatch.ts` | Dispatch table for top-level keywords |
| `frontend/parseAsmStatements.ts` | ASM body parser — labels, control flow, instructions |
| `frontend/parseImm.ts` | Immediate expression Pratt parser |
| `frontend/parseOperands.ts` | ASM operand parser (Reg, Imm, Ea, Mem, Port) |
| `semantics/env.ts` | `CompileEnv`, `buildEnv()`, `evalImmExpr()` |
| `semantics/layout.ts` | `sizeOfTypeExpr()`, `offsetOfPathInTypeExpr()` |
| `semantics/typeQueries.ts` | Type resolution helpers, `typeDisplay()` |
| `lowering/emit.ts` | `emitProgram()` — top-level lowering entry point |
| `lowering/emitPipeline.ts` | Phase names, phase runners, result types |
| `lowering/programLowering.ts` | `preScanProgramDeclarations()`, `lowerProgramDeclarations()` |
| `lowering/functionLowering.ts` | Per-function lowering coordinator |
| `lowering/functionFrameSetup.ts` | Stack frame / locals allocation |
| `lowering/functionBodySetup.ts` | Control-flow frame reconstruction |
| `lowering/asmBodyOrchestration.ts` | ASM block traversal and control-flow lowering |
| `lowering/asmInstructionLowering.ts` | Instruction-level dispatch |
| `lowering/asmLoweringAssign.ts` | `:=` lowering |
| `lowering/asmLoweringLd.ts` | `ld` lowering (entry) |
| `lowering/ldTransferPlan.ts` | ld transfer plan builder |
| `lowering/ldFormSelection.ts` | ld form selection |
| `lowering/ldEncoding.ts` | ld byte encoding |
| `lowering/opMatching.ts` | Op overload matching |
| `lowering/opExpansionExecution.ts` | Op body inlining |
| `lowering/valueMaterialization.ts` | EA → step pipeline orchestration |
| `lowering/eaResolution.ts` | EA name → storage location |
| `lowering/steps.ts` | Step library (pure addressing micro-ops) |
| `lowering/emitFinalization.ts` | Phase 4: fixup resolution, section placement |
| `lowering/sectionPlacement.ts` | Named-section placement |
| `lowering/loweredAsmTypes.ts` | Lowered-ASM IR types |
| `lowering/fixupEmission.ts` | Fixup queue management |
| `z80/encode.ts` | Z80 instruction encoder dispatcher |
| `z80/encodeLd.ts` | `ld` instruction encoding |
| `z80/encodeControl.ts` | Branch/call instruction encoding |
| `z80/encodeAlu.ts` | ALU instruction encoding |
| `z80/encodeBitOps.ts` | Bit-operation encoding |
| `formats/types.ts` | `EmittedByteMap`, `SymbolEntry`, `Artifact` types |
| `formats/writeBin.ts` | Flat binary writer |
| `formats/writeHex.ts` | Intel HEX writer |
| `formats/writeD8m.ts` | D8 debug-map JSON writer |
| `formats/writeListing.ts` | Assembler listing writer |
| `formats/writeAsm80.ts` | Lowered Z80 assembler source writer |

---

*This document was generated in March 2026 against the `main` branch of ZAX. If you find anything that has drifted from the current source, please open an issue or update this file.*
