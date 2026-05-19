# AZM TextMate highlighting draft

Status: draft syntax-highlighting companion
Date: 2026-05-17

## Purpose

`docs/spec/azm.tmLanguage.json` is a draft TextMate grammar for AZM syntax
highlighting in VS Code, Debug80, and other TextMate-compatible editors.

It is not a parser and must not be treated as a semantic authority. The
normative language and metadata documents remain:

- `docs/spec/azm-assembly-baseline.md`
- `docs/spec/azmdoc.md`
- `docs/design/asm80-compatibility-baseline.md`

The TextMate grammar exists so editor tooling can follow the same direction as
the AZM language standard while AZM is being stabilized.

## Covered scopes

The grammar currently highlights:

- semicolon comments
- AZMDoc tags inside comments
- AZMDoc register and flag carriers
- global and local labels
- AZM-native dotted directives
- accepted legacy directive aliases
- Z80 instruction mnemonics
- Z80 registers and register pairs
- condition codes after branch/call/return mnemonics
- decimal, hexadecimal, binary, and current-location literals
- double-quoted strings and single-quoted character/string literals
- arithmetic operators, commas, and parentheses

## AZMDoc highlighting rule

AZMDoc metadata is highlighted inside ordinary comments. The `@` tag is the
metadata marker; `;!` is not required.

Examples:

```asm
; Loads the pending candidate coordinate.
; Returns @out D as pending x and @out E as pending y.
; Uses @clobbers A as scratch.
LOAD_DE_FROM_PENDING:
```

Detached interface blocks are also supported:

```asm
; @routine CHECK_COLLISION_AT_DE
; @in D candidate_x
; @in E candidate_y
; @out carry collision
; @clobbers A
; @end
```

Generated source blocks use compact `;!` lines and bare metadata keys:

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
        "extensions": [".azm", ".asm", ".z80"]
      }
    ],
    "grammars": [
      {
        "language": "azm",
        "scopeName": "source.azm",
        "path": "./syntaxes/azm.tmLanguage.json"
      }
    ]
  }
}
```

When Debug80 already has distinct handling for `.asm` or `.z80`, use `.azm` as
the native language id and decide separately whether existing ASM80 files should
opt into the same grammar by default.

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
