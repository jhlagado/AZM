# AZM Source Code Overview

Status: active developer reference

This document is a map of the live AZM codebase.

AZM is an ASM80-class Z80 assembler with a small set of deliberate extensions:
register-care contracts, AZMDoc, directive aliases, visible `op` expansion,
enums, and compile-time layout constants.

## Product Boundary

AZM keeps:

- `.asm` / `.z80` AZM source parsing and Z80 emission
- ASM flat source with labels, directives, and instructions
- textual `.include`
- register-care analysis and AZMDoc contracts
- directive aliases before parsing
- `op` expansion as visible inline assembly generation
- `type`, `union`, `enum`, `sizeof(...)`, `offset(...)`, and layout casts when
  they fold to constants

AZM does not include a high-level source layer. The following constructs are
outside `.asm` and `.z80` source:

- `func` and `export func`
- formal arguments and local variables
- generated stack frames and synthetic call cleanup
- named `section code` / `section data` blocks
- module imports and export visibility declarations
- typed `data`, `var`, `globals`, and typed `extern func`
- `:=` assignment and hidden typed load/store lowering
- structured control keywords such as `if`, `while`, `repeat`, and `select`
- runtime typed effective-address lowering

## Repository Layout

```text
src/
  cli.ts                    CLI argument parsing and file I/O
  compile.ts                Top-level compile orchestration
  sourceLoader.ts           Entry loading and textual include expansion
  sourceIncludeExpansion.ts Textual include expansion with provenance
  sourceIncludePaths.ts     Include candidate path ordering
  pipeline.ts               Public pipeline option/result contracts

  diagnostics/
    types.ts                Diagnostic type and stable ID registry

  frontend/
    ast.ts                  AST type definitions
    asm80/                  ASM80-baseline line parsing helpers
    directiveAliases.ts     Configurable directive head aliases
    parseAsmTopLevel.ts ASM source top-level parser
    parseAsmStream.ts    Flat assembler stream parser
    parseImm.ts             Immediate expression parser
    parseOperands.ts        Instruction operand parser
    parseOp.ts              Op declaration parser
    parseTypes.ts           Type and union declarations
    parseEnum.ts            Enum declarations
    parseSourceItemTable.ts AZM top-level parser dispatch table

  semantics/
    env.ts                  Compile-time environment construction
    layout.ts               Size and offset computation
    typeQueries.ts          Type and layout query helpers

  lowering/
    asmDirectiveLowering.ts ASM80/AZM directive lowering
    asmDirectiveTraversal.ts Directive classification helpers
    asmSourceInstructionLowering.ts    Visible assembler instruction lowering
    opExpansionOrchestration.ts Op overload selection
    opExpansionExecution.ts Op substitution and recursive lowering
    programLowering.ts      Program lowering coordinator
    programPrescan.ts       Prescan for symbols, ops, and layout metadata
    emitFinalization.ts     Placement, fixups, and artifact context
    emissionCore.ts         Byte emission helpers
    fixupEmission.ts        ABS16/REL8 fixup handling

  registerCare/
    analyze.ts              Register-care analysis and annotation workflow
    summary.ts              Routine summary inference
    effects.ts              Z80 register and flag effects
    programModel.ts         Routine boundary model
    smartComments.ts        AZMDoc parsing

  formats/
    writeAsm80.ts           Lowered `.z80` source writer
    writeBin.ts             Flat binary writer
    writeD8m.ts             Debug map writer
    writeHex.ts             Intel HEX writer
    writeListing.ts         Listing writer
    range.ts                Byte-range utilities

  z80/
    encode.ts               Z80 encoder dispatch
    encode*.ts              Instruction-family encoders
```

Lowering paths for non-AZM constructs should be treated as deletion targets, not
as normal AZM architecture. This includes function/module/section lowering,
typed assignment, typed storage, structured control, and runtime typed-address
materialization.

## Compile Flow

```text
compile(entry, options, deps)
  |
  +- load source
  |    +- expand textual includes for .asm/.z80
  |    +- parse AZM assembler source
  |
  +- optional lint passes
  |
  +- build compile-time environment
  |    +- constants and enums
  |    +- type and union layouts
  |    +- retained op/layout metadata
  |
  +- lower program
  |    +- lower assembler directives
  |    +- lower concrete Z80 instructions
  |    +- expand ops at call sites
  |    +- apply fixups and placement
  |
  +- write requested artifacts
       +- .bin
       +- .hex
       +- .lst
       +- .d8.json
       +- lowered .z80
```

Format writers consume already-lowered byte maps and symbols. They should not
change compilation semantics.

## Current Compiler Boundaries

### Frontend

The frontend is line-oriented. It builds AST nodes and source spans, emits
recoverable parse diagnostics where practical, and avoids byte-emission
decisions.

The ASM80 input baseline lives in `frontend/asm80/` plus the flat assembler
stream parser. AZM `.asm` should stay flat and assembler-shaped: top-level
declarations followed by labels, directives, and instructions.

### Semantics

The semantic environment owns compile-time facts:

- constant values
- enum members
- type and union declarations
- `sizeof(...)`
- `offset(...)`
- layout-cast constant paths

Type expressions such as `byte`, `word`, `Sprite`, and `Sprite[10]` are
compile-time byte-size expressions in layout-size positions. They are useful for
`.field`, `.ds`, `sizeof`, `offset`, and layout casts. They do not create typed
labels or hidden memory access.

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

### Lowering

Lowering turns accepted assembler-shaped AST into bytes, fixups, symbols, and
lowered source traces. Current AZM lowering should be explicit:

- directives lower to constants, gaps, labels, and binary range markers
- Z80 instructions lower through the ASM80 instruction path and encoder
- ops expand inline to ordinary assembler items
- fixups handle symbolic references

Hidden high-level code generation is outside the AZM lowering model.

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

- ASM80 parser/directive work: `test/asm80/**` and `test/frontend/asm80_*`
- ASM source surface rules: `test/frontend/asm_*`
- register-care work: `test/registerCare/**` and CLI register-care tests
- op expansion: `test/lowering/*op*` and register-care op integration tests
- layout constants: `test/semantics/layout_constants_asm.test.ts`
- output writers: `test/backend/*write*`, CLI artifact tests, and format tests

`npm run test:azm:alpha` is the main AZM guardrail.

Avoid broad coverage work during feature cleanup. Run the smallest meaningful
verification first, then broader guardrails only when the change affects a broad
boundary.
