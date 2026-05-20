# AZM Source Code Overview

Status: active developer reference

This document is a map of the live AZM codebase. It describes the assembler AZM
is becoming, not the high-level ZAX system it inherited.

AZM is an ASM80-class Z80 assembler with a small set of deliberate extensions:
register-care contracts, AZMDoc, directive aliases, visible `op` expansion,
and compile-time layout constants. Anything related to ZAX `func`, generated
frames, typed arguments or locals, named sections, module imports, typed
storage, typed assignment, runtime typed effective-address lowering, or
structured control is retirement code unless another current design document
explicitly keeps it.

## Product Boundary

AZM keeps:

- `.asm` / `.z80` ASM80-compatible parsing and Z80 emission
- native flat `.azm` source with labels, directives, and instructions
- textual `.include`
- register-care analysis and AZMDoc contracts
- directive aliases before parsing
- `op` expansion as visible inline assembly generation
- `type`, `union`, `enum`, `sizeof(...)`, `offset(...)`, and layout casts when
  they fold to constants

AZM removes from native `.azm`:

- `func` and `export func`
- formal arguments and function-local variables
- generated stack frames and synthetic call cleanup
- named `section code` / `section data` blocks
- ZAX `import` modules and `export` visibility
- typed `data`, `var`, `globals`, and typed `extern func`
- `:=` assignment and hidden typed load/store lowering
- structured control keywords such as `if`, `while`, `repeat`, and `select`
- runtime typed effective-address lowering

## Repository Layout

```text
src/
  cli.ts                    CLI argument parsing and file I/O
  compile.ts                Top-level compile orchestration
  moduleLoader.ts           Entry loading and textual include expansion
  sourceIncludeExpansion.ts Textual include expansion with provenance
  sourceIncludePaths.ts     Include candidate path ordering
  pipeline.ts               Public pipeline option/result contracts

  diagnostics/
    types.ts                Diagnostic type and stable ID registry

  frontend/
    ast.ts                  AST type definitions
    asm80/                  ASM80/classic line parsing
    directiveAliases.ts     Configurable directive head aliases
    parseAzmNativeTopLevel.ts Native .azm top-level parser
    parseAzmAsmStream.ts    Flat assembler stream parser
    parseImm.ts             Immediate expression parser
    parseOperands.ts        Instruction operand parser
    parseOp.ts              Op declaration parser
    parseTypes.ts           Type and union declarations
    parseEnum.ts            Enum declarations
    parseZaxModuleItemTable.ts Temporary ZAX retirement parser table

  semantics/
    env.ts                  Compile-time environment construction
    layout.ts               Size and offset computation
    instructionAcceptance.ts Instruction acceptance checks

  lowering/
    asmDirectiveLowering.ts ASM80/AZM directive lowering
    asmDirectiveTraversal.ts Directive classification helpers
    asm80InstructionLowering.ts Concrete ASM80 instruction lowering
    opExpansionOrchestration.ts Op overload selection
    opExpansionExecution.ts Op substitution and recursive lowering
    programLowering.ts      Program lowering coordinator
    programPrescan.ts       Prescan for symbols, ops, and retirement data
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
    writeAsm80.ts           Lowered source writer
    writeBin.ts             Flat binary writer
    writeD8m.ts             Debug map writer
    writeHex.ts             Intel HEX writer
    writeListing.ts         Listing writer
    range.ts                Byte-range utilities

  z80/
    encode.ts               Z80 encoder dispatch
    encode*.ts              Instruction-family encoders
```

Old ZAX lowering paths should be treated as deletion targets, not as normal AZM
architecture. This includes function/module/section lowering, typed assignment,
typed storage, structured control, and runtime typed-address materialization.

## Compile Flow

```text
compile(entry, options, deps)
  |
  +- load source
  |    +- expand textual includes for .azm/.asm/.z80
  |    +- parse ASM80/classic or native AZM source
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

ASM80 compatibility lives in `frontend/asm80/` plus the flat assembler stream
parser. Native `.azm` should stay flat and assembler-shaped: top-level
declarations followed by labels, directives, and instructions.

### Semantics

The semantic environment owns compile-time facts:

- constant values
- enum members
- type and union declarations
- `sizeof(...)`
- `offset(...)`
- layout-cast constant paths

Semantics must not grow runtime typed memory behavior. If a layout expression
cannot fold to a constant, it is outside the retained AZM layout feature.

### Lowering

Lowering turns accepted assembler-shaped AST into bytes, fixups, symbols, and
lowered source traces. Current AZM lowering should be explicit:

- directives lower to constants, gaps, labels, and binary range markers
- Z80 instructions lower through the ASM80 instruction path and encoder
- ops expand inline to ordinary assembler items
- fixups handle symbolic references

Hidden high-level code generation belongs to the ZAX retirement path.

### Register Care

Register-care analysis is a retained AZM feature. It builds routine summaries
from assembler source, tracks Z80 register and flag effects, reads AZMDoc
contracts, and can rewrite generated contract comments. The routine model is
based on visible labels and calls, not on ZAX `func` declarations.

### Output Formats

Output format modules serialize byte maps and metadata:

- `writeBin` crops or pads according to explicit binary range controls
- `writeHex` emits Intel HEX
- `writeListing` formats listing output
- `writeD8m` writes debugger metadata
- `writeAsm80` writes lowered assembler text

## ZAX Retirement Boundary

Do not rename old ZAX behavior into AZM to make it look current. Either:

1. delete it,
2. rewrite the useful assertion as an ASM80/AZM test, or
3. leave the code unreferenced only for the shortest possible deletion slice.

Use these documents when deciding what survives:

- [AZM language direction](../design/azm-language-direction.md)
- [AZM expression and visibility](../design/azm-expression-and-visibility.md)
- [AZM code quality standard](code-quality-standard.md)

## Testing Map

Use focused tests that match the touched boundary:

- ASM80 parser/directive work: `test/asm80/**` and `test/frontend/asm80_*`
- native `.azm` surface rules: `test/frontend/azm_*`
- register-care work: `test/registerCare/**` and CLI register-care tests
- op expansion: `test/lowering/*op*` and register-care op integration tests
- layout constants: `test/semantics/layout_constants_azm.test.ts`
- output writers: `test/backend/*write*`, CLI artifact tests, and format tests

`npm run test:azm:alpha` is the main AZM guardrail.

Avoid broad coverage work during feature cleanup. Run the smallest meaningful
verification first, then broader guardrails only when the change affects a broad
boundary.
