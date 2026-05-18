# AZM assembly baseline

Status: draft baseline standard
Date: 2026-05-17

## Purpose

This document defines the assembler-facing baseline for AZM. AZM starts from the
documented ASM80 compatibility subset, then adds stricter and more expressive
tooling conventions without hiding the Z80 machine model.

The baseline is intentionally smaller than "every ASM80 feature". It is the
canonical surface AZM should teach, syntax-highlight, lint, and extend.

## Standards stack

AZM is defined as a small stack of compatible standards:

- **ASM80 compatibility baseline**: the corpus-driven subset documented in
  `docs/design/asm80-compatibility-baseline.md`.
- **AZM-native assembly style**: the preferred spelling and stricter habits for
  new AZM source.
- **AZMDoc**: ordinary semicolon comments with structured `@` metadata tags, as
  defined in `docs/spec/azmdoc.md`.
- **Register-care contracts**: an AZMDoc vocabulary used by the register-care
  analyzer to describe register inputs, outputs, clobbers, and preservation.

These standards must remain compatible with ordinary ASM80-style source. AZMDoc
metadata is carried in comments, so legacy assemblers ignore it.

## Source modes

AZM accepts the following source families:

- `.asm` and `.z80`: compatibility inputs using the supported ASM80-style
  baseline.
- `.azm`: preferred native AZM source. This mode may warn on inherited ZAX
  high-level constructs that are not part of the AZM direction.

Native AZM examples should prefer the AZM style in this document. Compatibility
inputs may retain historical forms where they are part of the accepted baseline.

## Canonical native style

AZM source should use:

- semicolon comments
- ordinary Z80 mnemonics
- labels with a colon
- idiomatic ASM80-family directives such as `ORG`, `EQU`, `DB`, `DW`, `DS`,
  `.include`, `.align`, `.binfrom`, and `.end`
- AZMDoc metadata comments for machine-checkable documentation

AZM is a stricter ASM80-family dialect, not a permissive clone of every
historical assembler spelling. It accepts the idiomatic ASM80 subset used by the
standing corpora, while project-local variants should enter through the
directive-alias mechanism rather than becoming parser-native language.

## Directive aliases

Directive aliases are an external source-normalization policy for project-local
or non-baseline spellings. The built-in AZM baseline already accepts idiomatic
ASM80 heads such as `ORG`, `EQU`, `DB`, `DW`, `DS`, `INCLUDE`, and `END`.
Additional spellings such as `DEFB`, `DEFW`, `DEFS`, `RMB`, `FCB`, or local
project names belong in an alias file.

Project-specific aliases may be supplied in JSON:

```json
{
  "extends": "azm",
  "directiveAliases": {
    "BYTE": ".db",
    "WORD": ".dw",
    "SPACE": ".ds"
  }
}
```

This mechanism is deliberately not a macro system. It only rewrites directive
heads at the start of a statement, after an optional label. It does not rewrite
operands, symbols, expressions, instructions, or arbitrary text.

## Required assembler surface

The assembler baseline includes:

- global labels and local labels
- label plus statement on one line
- `EQU` / `.equ` constants and expression aliases
- `ORG` / `.org` placement
- `INCLUDE` / `.include "file"` with relative include resolution
- `DB` / `.db`, `DW` / `.dw`, and `DS` / `.ds`
- `.align`
- `.cstr`, `.pstr`, and `.istr`
- `.binfrom` and `.binto`
- `.end`
- Z80 instruction syntax needed by the active corpus set
- semicolon comments, including AZMDoc metadata comments

The exact compatibility corpus and directive details remain documented in
`docs/design/asm80-compatibility-baseline.md`.

## AZMDoc position

AZMDoc is part of the AZM assembly baseline, not a separate language. It adds
structured meaning to comments, but it does not change emitted bytes.

Tools may use AZMDoc for:

- syntax highlighting
- hover help and outline views
- register-care analysis
- generated interface files
- documentation extraction
- linting and formatting

Assemblers that do not understand AZMDoc still see ordinary comments.

The companion draft TextMate grammar is `docs/spec/azm.tmLanguage.json`, with
usage notes in `docs/spec/azm-textmate-highlighting.md`.

## Non-goals

The baseline does not include:

- ASM80 text macros
- broad directive alias coverage inside the parser
- non-Z80 targets
- hidden calling conventions
- automatic register preservation
- high-level control flow as a prerequisite for useful assembly

AZM extensions should be added only when they improve handwritten Z80 assembly
without obscuring registers, flags, memory, ports, or control flow.
