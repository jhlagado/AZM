# AZM Source Code Overview

Status: active developer reference

This document is a map of the live AZM codebase.

AZM is an ASM80-class Z80 assembler with a small set of deliberate extensions:
register-care contracts, AZMDoc, directive aliases, visible `op` expansion,
enums, conditional source inclusion, and compile-time constants.

## Product Boundary

AZM keeps:

- `.asm` / `.z80` AZM source parsing and Z80 emission
- ASM flat source with labels, directives, and instructions
- textual `.include`
- register-care analysis and AZMDoc contracts
- directive aliases before parsing
- conditional source inclusion with lowercase `.if`, `.else`, and `.endif`
- `op` expansion as visible inline assembly generation
- `type`, `union`, `.type Name = TypeExpr` aliases, `enum`, `sizeof(...)`,
  `offset(...)`, `LSB(...)`, `MSB(...)`, and layout casts when they fold to
  constants

Canonical dotted directives and AZM function names are case-sensitive. Use the
documented spellings: lowercase dotted directives such as `.org`, lowercase
layout functions such as `sizeof(...)` and `offset(...)`, and uppercase acronym
functions such as `LSB(...)` and `MSB(...)`. Undotted compatibility heads such
as `ORG` and `DB` are directive aliases, not canonical AZM style.

AZM does not include a high-level source layer. The following constructs are
outside `.asm` and `.z80` source:

- `func` and `export func`
- formal arguments and local variables
- generated stack frames and synthetic call cleanup
- named `section code` / `section data` blocks
- module imports and export visibility declarations
- typed `data`, `var`, `globals`, and typed `extern func`
- `:=` assignment and hidden typed load/store lowering
- runtime structured control keywords such as `if`, `while`, `repeat`, and
  `select`
- runtime typed effective-address lowering

## Repository Layout

The promoted AZM implementation lives at the repository root under `src/`.
Historical parity work has been folded into promoted tests and external ASM80
acceptance gates; the old implementation is no longer part of the source tree.

```text
src/
  index.ts                    Public package exports (compileNext, compile, tooling)
  api-compile.ts              File-backed compile() and artifact writers
  api-tooling.ts              Tooling-facing compile helpers
  cli.ts                      CLI entry

  core/
    compile.ts                In-memory compileNext (bytes, hex, symbols)
    compile-artifacts.ts        Artifact-oriented compile helpers

  source/
    logical-lines.ts          Comment-aware line scanning
    source-file.ts            Source file + span model
    strip-line-comment.ts     Line comment stripping

  node/
    source-host.ts            Filesystem load and textual `.include` expansion

  syntax/
    parse-line.ts             Logical line → source items
    parse-expression.ts       Imm/sizeof/offset/layout-cast/LSB/MSB parsing
    parse-diagnostics.ts      Shared parse diagnostic helpers
    directive-aliases.ts      Configurable directive alias policy

  expansion/
    op-expansion.ts           Visible `op` registry, matching, substitution

  semantics/
    expression-evaluation.ts  sizeof/offset/layout-cast/LSB/MSB constant folding

  assembly/
    assemble-program.ts       Program assembly coordinator
    address-planning.ts       Labels, equates, layout records
    placement.ts              Origin and storage placement
    fixup-emission.ts         ABS16/REL8 fixup emission
    program-emission.ts       Byte emission helpers

  z80/
    parse-instruction.ts      Instruction operand parsing
    encode.ts                 Encoder dispatch
    effects.ts                Register and flag effects
    instruction.ts            Instruction model

  register-care/              AZMDoc contracts, routine model, reports
  outputs/                    BIN, HEX, listing, D8, lowered asm80 writers
  cli/                        CLI argument parsing and artifact output
  diagnostics/format.ts       Diagnostic text formatting
  model/                      Shared types (no compiler dependencies)
  tooling/                    loadProgram / analyzeProgram adapters
```

Retired high-level lowering (functions, modules, typed memory, structured control) is not
present in this tree. Do not reintroduce it when extending AZM.

## Compile Flow

```text
compile(entryFile, options)                         // file-backed API
  |
  +- loadProgramNext (node/source-host)
  |    +- expand textual .include with provenance
  |    +- scan logical lines
  |
  +- analyzeProgramNext (tooling/api)
  |    +- parse items, ops, layouts, enums
  |    +- optional register-care analysis
  |
  +- assembleProgram (assembly/* + z80/*)
  |    +- plan addresses and layout metadata
  |    +- encode instructions and emit bytes/fixups
  |
  +- write artifacts (outputs/* via defaultFormatWriters)
       +- .bin / .hex / .lst / .d8.json / lowered .z80

compileNext(sourceText, options)                    // in-memory API
  +- parse → assemble → bytes/hex (core/compile.ts)
```

Format writers consume already-lowered byte maps and symbols. They should not
change compilation semantics.

## Current Compiler Boundaries

### Parsing (`source/` + `syntax/`)

Parsing is line-oriented. `source/logical-lines.ts` produces logical lines with stable spans;
`syntax/parse-line.ts` turns them into `SourceItem` values (labels, directives, instructions,
types, unions, enums, ops). Expression parsing for equates and layout terms lives in
`syntax/parse-expression.ts`. Parsing emits recoverable diagnostics and does not emit bytes.

### Semantics

The semantic environment owns compile-time facts:

- constant values
- enum members
- type, union, and type-alias declarations
- `sizeof(...)`
- `offset(...)`
- `LSB(...)`
- `MSB(...)`
- layout-cast constant paths

Type expressions such as `byte`, `word`, `Sprite`, and `Sprite[10]` are
compile-time byte-size expressions in layout-size positions. They are useful for
`.field`, `.ds`, `sizeof`, `offset`, and layout casts. They do not create typed
labels or hidden memory access.

Type aliases give a name to another type expression without adding a wrapper
field:

```asm
.type SpriteArray = Sprite[16]
```

`SpriteArray` behaves exactly like `Sprite[16]` in `.ds`, `.field`,
`sizeof(...)`, `offset(...)`, and layout casts. It does not create constructors,
runtime type checks, or hidden memory access.

Record layouts are instantiated with ordinary assembler storage directives:
`.ds Sprite` reserves one record, `.ds Sprite[10]` reserves ten records, and
initialized records are written explicitly with `.db`, `.dw`, `.cstr`, `.pstr`,
or `.istr` in layout order. AZM does not have record constructors.

Scalar layout names follow the same rule as records in size positions:
`.ds byte` reserves one byte, `.ds word` reserves two bytes, `.ds byte[10]`
reserves ten bytes, and `.ds word[10]` reserves twenty bytes. Inside `.type`
and `.union`, `.byte`, `.word`, and `.addr` are shorthand for `.field byte`,
`.field word`, and `.field addr`; outside a layout block, they are not
data-emission directives.

The storage model is:

- `byte`, `word`, `addr`, and named layouts evaluate to byte counts only in
  layout-size positions
- `.ds TypeExpr` reserves that many bytes
- `.db` and `.dw` emit initialized byte and word values
- `.cstr`, `.pstr`, and `.istr` emit initialized string bytes with C-style,
  Pascal-style, and high-bit-final terminators respectively

Semantics must not grow runtime typed memory behavior. If a layout expression
cannot fold to a constant, it is outside the retained AZM layout feature.

### Assembly (`assembly/` + `z80/` + `expansion/`)

Assembly turns accepted source items into bytes, fixups, and symbols:

- `expansion/op-expansion.ts` expands visible `op` invocations inline before assembly
- `assembly/address-planning.ts` collects labels, equates, and layout metadata
- `z80/encode.ts` encodes instructions; `assembly/fixup-emission.ts` patches symbolic refs
- `outputs/write-asm80.ts` serializes lowered trace text when requested

There is no separate “lowering” layer for high-level language features.

### Register Care

Register-care analysis is a retained AZM feature. It builds routine summaries
from assembler source, tracks Z80 register and flag effects, reads AZMDoc
contracts, and can rewrite generated contract comments. The routine model is
based on visible labels and calls.

### Output Formats

Output format modules serialize byte maps and metadata. They are integration
boundaries for downstream tools such as Debug80, so their JSON and text shapes
should be treated as public contracts once exported through the package API.

- `writeBin` crops or pads according to explicit binary range controls
- `writeHex` emits Intel HEX
- `writeListing` formats listing output
- `writeD8m` writes typed Debug80 metadata with AZM generator details, source
  file keys, source-line segments, and value-only constants
- `writeAsm80` writes lowered `.z80` assembler text

## Retired Source Boundary

Do not rename retired high-level behavior into AZM to make it look current.
Either:

1. delete it,
2. rewrite the useful assertion as an ASM80/AZM test, or
3. leave the code unreferenced only for the shortest possible deletion slice.

Use these documents when deciding what survives:

- [AZM expression and visibility](../design/azm-expression-and-visibility.md)
- [AZM code quality standard](code-quality-standard.md)
- [AZM CLI reference](cli.md)

## Testing Map

Use focused tests that match the touched boundary:

- Parser/expression work: `test/unit/syntax/**`
- Integration slices: `test/integration/**` (stages, diagnostic matrices, layout, includes)
- Z80 encoder: `test/unit/z80/**`
- register-care: `test/unit/register-care/**`, `test/integration/register-care/**`, `test/cli/register_care_cli.test.ts`
- op expansion: `test/unit/expansion/**`
- asm80 / real programs: `test/asm80/**`, `test/differential/**`
- CLI contracts: `test/cli/**`

`npm run next:guardrails:core` is the main promoted-code guardrail; `npm run test:ci:asm80-parity`
gates lowered asm80 output.

Avoid broad coverage work during feature cleanup. Run the smallest meaningful
verification first, then broader guardrails only when the change affects a broad
boundary.
