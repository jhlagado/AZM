# VS Code Language Services Direction

Status: future design note
Date: 2026-05-10

## Purpose

AZM should eventually contribute language intelligence to the VS Code
experience used around Debug80. This is a future goal, separate from the
immediate ASM80 compatibility baseline, but it should shape the compiler API
so editor support can use the real AZM parser and assembler semantics instead
of duplicating them.

## Scope boundary

The immediate AZM priority is a strict ASM80-compatible assembler baseline with
the retained AZM language features layered on top. VS Code integration should not
expand the assembler compatibility target or delay the assembler baseline.

Longer term, editor support probably lives between projects:

- AZM owns parsing, assembly semantics, diagnostics, symbols, source spans, and
  source-to-address mapping.
- Debug80 owns debugger workflow, emulator state, breakpoints, stepping, and
  runtime views.
- A VS Code extension or language-server package consumes both sides.

This means AZM should expose language-service-friendly data, but it does not
necessarily need to contain the VS Code extension itself.

## Desired editor features

Useful first editor features:

- syntax highlighting for ASM80-compatible AZM source
- syntax highlighting for retained AZM language features
- diagnostics from the real AZM parser and assembler
- go to definition for labels and equates
- find references for labels and constants
- hover text for symbol values, addresses, instruction sizes, and emitted bytes
- completion for opcodes, registers, directives, labels, constants, and include
  paths
- warnings for compatibility hazards such as ambiguous `FFH`-style hex
- include graph awareness
- source-to-address annotations after assembly
- debugger breakpoint validation against assembled addresses

Debug80-facing features can build on the same data:

- map source lines to runtime addresses
- show symbol names for program counters and watch expressions
- validate breakpoints before launch
- connect assembled output, disassembly, and source spans

## AZM Compiler Services Needed

Editor tooling should consume stable AZM services rather than reimplementing
assembler behavior. Useful service boundaries:

- parse a source file or source tree
- resolve `.include` files with source locations
- return diagnostics with file, line, column, severity, and code
- return a symbol table with definitions, values, placement/origin context, and
  spans
- return references to labels and constants
- return address ranges by source span
- return emitted bytes by source span
- return AZM source information for `.asm` and `.z80`
- run in a partial or tolerant mode for incomplete editor buffers

The `docs/tooling-api.md` document is the current place to promote these ideas
once the compiler API is ready.

## Syntax highlighting

Syntax highlighting can start before a full LSP, but it should still respect
the same dialect policy:

- `.z80` and `.asm` highlight as AZM assembler source.
- `.asm` highlights AZM source.
- Raw assembler directives use ASM80 spellings.
- Retained AZM features such as AZMDoc, `op`, enums, `.type` / `.union`,
  `sizeof`, `offset`, and constant-only layout casts are highlighted as AZM
  syntax layered above the ASM80 baseline.

A TextMate grammar is probably enough for the first VS Code syntax pass. The
language server becomes more valuable once AZM can reliably produce symbols,
diagnostics, and address maps for real projects.

## Non-goals for now

- Do not implement VS Code integration before the assembler baseline is stable.
- Do not duplicate AZM parsing rules inside Debug80 or a VS Code extension.
- Do not use editor integration as a reason to expand the ASM80 compatibility
  baseline.
- Do not make macros part of the language-service target.

## Suggested phases

1. Stabilize AZM ASM80-compatible mode against MON3, Tetro, and Pacmo.
2. Expose compiler diagnostics and symbol/address metadata through a small
   tooling API.
3. Add syntax highlighting for `.asm` and `.z80`.
4. Add a minimal language server using the AZM tooling API.
5. Connect Debug80 debugger state to AZM source maps and symbols.

The key design rule is that editor intelligence should be AZM-aware because it
uses AZM itself as the source of truth.
