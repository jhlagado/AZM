# AZM TextMate highlighting draft

Status: draft syntax-highlighting companion
Date: 2026-05-17

## Purpose

`docs/spec/azm.tmLanguage.json` is a draft TextMate grammar for AZM syntax
highlighting in VS Code, Debug80, and other TextMate-compatible editors.

It is not a parser and must not be treated as a semantic authority. Live source
and tests define accepted assembler behavior. Supporting documentation remains:

- `docs/spec/azmdoc.md`
- `docs/design/asm80-compatibility-baseline.md`

The TextMate grammar exists so editor tooling can follow the AZM language
standard.

## Covered scopes

The grammar currently highlights:

- semicolon comments
- compact AZMDoc contract lines
- AZMDoc register and flag carriers
- plain labels and `@` routine-entry labels
- canonical AZM dotted directives
- accepted directive aliases
- Z80 instruction mnemonics
- Z80 registers and register pairs
- condition codes after branch/call/return mnemonics
- decimal, hexadecimal, binary, and current-location literals
- double-quoted strings and single-quoted character/string literals
- arithmetic operators, commas, and parentheses

## AZMDoc highlighting rule

AZMDoc metadata is highlighted on compact `;!` contract lines. Ordinary prose
comments remain plain comments.

Examples:

```asm
; Loads the pending candidate coordinate.
; D and E contain the pending candidate coordinate.
;!      out       DE
;!      clobbers  A
LOAD_DE_FROM_PENDING:
```

Source contract blocks use bare metadata keys:

```asm
;!      in        DE
;!      out       carry
;!      clobbers  A
```

## VS Code integration sketch

A VS Code extension can consume the grammar like this:

```json
{
  "contributes": {
    "languages": [
      {
        "id": "azm",
        "aliases": ["AZM", "azm"],
        "extensions": [".asm", ".z80"]
      }
    ],
    "grammars": [
      {
        "language": "azm",
        "scopeName": "source.asm",
        "path": "./syntaxes/azm.tmLanguage.json"
      }
    ]
  }
}
```

When Debug80 already has distinct handling for `.asm` or `.z80`, use `.asm` as
the canonical AZM language id and decide separately whether ASM80 corpus files
should opt into the same grammar by default.

## Expected future refinement

TextMate highlighting should remain a fast visual aid. Later language services
can layer semantic tokens over it for:

- resolved labels
- unknown symbols
- routine boundaries
- register-care contract status
- external routine contracts
- dead or unreachable labels

The grammar should stay conservative and readable. Do not duplicate the full
AZM parser in regex form.
