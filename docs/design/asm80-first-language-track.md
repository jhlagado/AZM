# ASM80-first language track

Status: post-ASM80-baseline extension plan

## Purpose

ZAX 0.3.0 marks the current mature structured-assembler implementation as a
working baseline. The ASM80 compatibility pass has now reached the practical
baseline for MON3, the TEC-1G non-macro corpus, and Tetro. The next
language-design track should remain reversible: if the ASM80-first extension
direction does not prove useful, development can return to the 0.3.0 line
without losing a stable assembler.

The goal is not to throw away the existing compiler. The goal is to build from
the working codebase while making the source language feel like an assembler
first. Advanced ZAX features remain valuable, but they should be reintroduced
above a classic Z80 assembler surface instead of being required at the entry
point.

The long-term goal is for ZAX to replace ASM80 in the Z80 toolchain. During the
migration, ASM80 remains the reference assembler and fallback, but the intended
destination is that `.asm`, `.z80`, and ZAX-extended assembler source are all
compiled by ZAX.

## Baseline rule

The compatibility target is now a stripped-down assembler-facing ZAX:

- Z80 instructions
- labels
- `call`, `jp`, `jr`, `djnz`, `ret`, and ordinary subroutine structure
- constants/equates
- origin/location control
- raw data directives
- comments
- includes
- output-range directives needed by the chosen corpus

For this track, functions, OPS, typed globals, records, unions, modules, and
structured control flow are existing ZAX features, but the next phase should
reintroduce them above classic assembler source rather than making them the
entry point.

The compatibility target is not full ASM80. It is the documented subset in
`docs/design/asm80-compatibility-baseline.md`.

## First corpus

Use the TEC-1G MON3 source as the first real ASM80-style corpus:

- `/Users/johnhardy/Documents/projects/MON3/src/mon3.z80`
- related Debug80 MON3 bundles and examples as secondary checks

The MON3 source shows the first syntax pressure points:

- dot directives such as `.equ` and `.org`
- trailing-`H` hexadecimal literals such as `00H`, `0DH`, and `0C000H`
- label/equate forms with and without a colon before `.equ`
- ordinary Z80 instruction streams
- semicolon comments
- address expressions such as `STACK_TOP+32`

The first useful milestone is not "support all ASM80". It is "assemble the MON3
subset without translating it by hand".

## Completed compatibility stage

The first compatibility stage is effectively complete:

1. MON3 assembles through ZAX and matches a fresh ASM80-built reference.
2. The TEC-1G non-macro corpus assembles through ZAX and matches ASM80.
3. Tetro assembles through ZAX and matches the trimmed ASM80 listing range.
4. Macro-bearing sources remain excluded by policy.
5. VS Code and LSP work remains deferred.

## Next execution plan

The next phase is ASM80-first ZAX extensions, not more speculative ASM80 syntax:

1. Keep the current ASM80 baseline gates green before and after each language
   change.
2. Add value-level globals and memory declarations that can coexist with raw
   labels, `EQU`, `DB`, `DW`, and `DS`.
3. Introduce selected high-level syntax where it makes assembler programs
   clearer without hiding machine effects: small structured branches, typed
   values, and narrowly useful OPS-style abstractions.
4. Keep broad directives, alias dialects, macros, and unusual assembler
   variants out of scope unless a real corpus creates a concrete requirement.
5. Revisit Debug80, VS Code syntax, and LSP only after ZAX can confidently
   replace ASM80 in command-line builds.

## Checkpoint decision

Do not bump the npm package version for this docs-only baseline consolidation.
Use a lightweight git tag or branch checkpoint after a clean smoke pass if a
stable handoff point is useful, and reserve the next version bump for a
user-visible language or tooling change.

## Non-goals for the first milestone

- ASM80 macro-system compatibility
- `.macro`, `.rept`, `.endm`, `.block`, and `.endblock`
- non-Z80 processor support
- broad ASM80 directive compatibility before a real corpus requires it
- dialect aliases such as `DEFB`, `DEFW`, and `RMB`
- unusual assembler variants and compatibility shims without corpus pressure
- full segment-system compatibility before the chosen corpus requires it
- replacing labels and `call` with `func`
- changing `ld` back into typed-storage transfer
- VS Code extension work or LSP/language-server integration

ASM80's text macro system is deliberately out of scope. MON3 does not use it,
it is not part of the common subset being targeted, and ZAX should grow in the
direction of safer higher-level features such as OPS rather than carrying a
primitive text-substitution system for compatibility alone.

Typed ZAX storage remains a value-level feature. Raw labels remain address-level
assembler symbols. That distinction is one of the strongest parts of the
current implementation and should survive this language-track change.
