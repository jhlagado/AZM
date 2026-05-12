# VS Code language services direction

Status: future design note
Date: 2026-05-10

## Purpose

ZAX should eventually contribute language intelligence to the VS Code
experience used around Debug80. This is a future goal, separate from the
immediate ASM80 compatibility baseline, but it should shape the compiler API
so editor support can use the real ZAX parser and assembler semantics instead
of duplicating them.

## Scope boundary

The immediate ZAX priority remains ASM80 subset compatibility for MON3. VS Code
integration should not expand the assembler compatibility target or delay the
MON3 acceptance milestone.

Longer term, editor support probably lives between projects:

- ZAX owns parsing, assembly semantics, diagnostics, symbols, source spans, and
  source-to-address mapping.
- Debug80 owns debugger workflow, emulator state, breakpoints, stepping, and
  runtime views.
- A VS Code extension or language-server package consumes both sides.

This means ZAX should expose language-service-friendly data, but it does not
necessarily need to contain the VS Code extension itself.

## Desired editor features

Useful first editor features:

- syntax highlighting for ASM80-compatible ZAX source
- syntax highlighting for later ZAX extensions
- diagnostics from the real ZAX parser and assembler
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

## ZAX compiler services needed

Editor tooling should consume stable ZAX services rather than reimplementing
assembler behavior. Useful service boundaries:

- parse a source file or source tree
- resolve `.include` files with source locations
- return diagnostics with file, line, column, severity, and code
- return a symbol table with definitions, values, sections, and spans
- return references to labels and constants
- return address ranges by source span
- return emitted bytes by source span
- return source mode and dialect information for `.zax`, `.z80`, and `.asm`
- run in a partial or tolerant mode for incomplete editor buffers

The `docs/spec-language-services-api.md` and `docs/tooling-api.md` documents are
the likely places to promote these ideas once the compiler API is ready.

## Syntax highlighting

Syntax highlighting can start before a full LSP, but it should still respect
the same dialect policy:

- `.z80` and `.asm` highlight as ASM80-compatible classic ZAX.
- `.zax` highlights the richer ZAX language.
- Raw assembler directives use ASM80 spellings.
- ZAX extensions are highlighted as extensions, not as required assembler
  syntax.

A TextMate grammar is probably enough for the first VS Code syntax pass. The
language server becomes more valuable once ZAX can reliably produce symbols,
diagnostics, and address maps for real projects.

## Non-goals for now

- Do not implement VS Code integration before the MON3 assembler baseline is
  stable.
- Do not duplicate ZAX parsing rules inside Debug80 or a VS Code extension.
- Do not use editor integration as a reason to expand the ASM80 compatibility
  baseline.
- Do not make macros part of the language-service target.

## Suggested phases

1. Stabilize ZAX classic ASM80 mode against MON3.
2. Expose compiler diagnostics and symbol/address metadata through a small
   tooling API.
3. Add syntax highlighting for `.z80`, `.asm`, and `.zax`.
4. Add a minimal language server using the ZAX tooling API.
5. Connect Debug80 debugger state to ZAX source maps and symbols.

The key design rule is that editor intelligence should be ZAX-aware because it
uses ZAX itself as the source of truth.
