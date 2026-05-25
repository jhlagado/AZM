# AZM Native Syntax Cleanup Tasks

Status: P1 and P2 complete; remaining work is explicitly scoped to the P3 list

This document records the current implementation decisions for the next AZM
language cleanup pass. It is intended for coding agents; documentation writers
should use the final landed behavior, not this task list, as the manual source.

## Decisions

- Canonical AZM declarations should use a name-left shape.
- Colons are address-label syntax only.
- Do not teach or accept colons on declarations in native AZM.
- Type aliases should use a dedicated name-left directive:

```asm
SpriteArray .typealias Sprite[16]
```

- The previously landed prefix alias form:

```asm
.type SpriteArray = Sprite[16]
```

has been replaced in active examples and is now rejected with a migration
diagnostic.

- `.lst` listing output should be removed entirely, not merely deprecated.

## Target Native Syntax

```asm
Label:

COUNT       .equ 8
Colour      .enum Red, Green, Blue

Sprite      .type
x           .byte
y           .byte
tile        .byte
flags       .byte
            .endtype

SpriteArray .typealias Sprite[16]
```

Rejected native forms:

```asm
COUNT:       .equ 8
Colour:      .enum Red, Green, Blue
Sprite:      .type
SpriteArray: .typealias Sprite[16]
```

## P1 Implementation Result

Status: complete. PR #208 landed this set on `main`.

1. Done: add `Name .typealias TypeExpr`.
   - Reuse the already-landed type-alias semantics.
   - Cover aliases to record, union, scalar, array, and nested alias targets.
   - Cover `.ds`, `.field`, `sizeof`, `offset`, layout casts, lowered ASM80,
     recursive aliases, and undefined targets.

2. Done: add name-left enum syntax.
   - Native form: `Name .enum A, B, C`.
   - Reject existing `enum Name A, B, C` with a migration diagnostic.
   - Reject `Name: .enum ...`.

3. Done: add name-left type body syntax.
   - Native form: `Name .type` ... `.endtype`.
   - Reject existing `.type Name` with a migration diagnostic.
   - Reject `Name: .type`.

4. Done: reject colon `.equ` declarations.
   - Native form remains `Name .equ expr`.
   - Reject `Name: .equ expr` with a diagnostic that points to `Name .equ expr`.

5. Done: remove listing output.
   - Remove `.lst` artifact generation.
   - Remove `--nolist`.
   - Update CLI help, package/reference docs, and tests.
   - Ensure default artifact behavior is explicit after removal.

6. Done: update manual handover notes.
   - Replace `.type Name = TypeExpr` examples with `Name .typealias TypeExpr`.
   - Document colon as address-label syntax only.
   - Remove listing output from normal workflow notes.

## P2 Implementation Result

Status: implemented on `codex/native-syntax-closure`; verify by running
`npm test`.

1. Done: colon consistency audit.
   - Audit every parser context where `:` is accepted.
   - Confirm the native rule: colon means address label only.
   - Ensure declarations reject colons consistently.
   - Result: colon labels remain address labels only. Declaration forms reject
     colons consistently, including `Name: .equ`, `Name: .enum`,
     `Name: .type`, `Name: .union`, and `Name: .typealias`.

2. Done: quote syntax policy.
   - Decide whether native AZM enforces single quotes for character literals and
     double quotes for strings.
   - Clarify `.db`, `.cstr`, `.pstr`, and `.istr`.
   - Result: single quotes are one-character literals in expression contexts.
     Double quotes are strings for `.db`, string equates, `.cstr`, `.pstr`, and
     `.istr`.

3. Done: case-sensitive alias matching.
   - Make directive alias matching explicit and preferably case-sensitive.
   - Built-in aliases should list accepted forms intentionally.
   - Result: aliases match exactly and case-sensitively. Built-in compatibility
     aliases are the explicit uppercase spellings such as `ORG`, `EQU`, `DB`,
     `DW`, and `DS`; lowercase canonical dotted directives remain native AZM.

4. Done: review `--case-style`.
   - Decide whether to keep, deprecate, or downplay it.
   - Confirm it only checks mnemonics, registers, and op heads, not labels or
     constants.
   - Result: keep as a style lint for instruction mnemonics, registers, and
     visible `op` heads/bodies. It does not lint labels, constants,
     directives, or compile-time function names.

## Remaining P3 Work

1. `.import` with public `@` symbols.
   - Future module/import system.
   - Requires a separate design pass.

2. Op value-pattern overloads.
   - Compile-time numeric matching for op recursion.
   - Requires a separate design pass.

3. `LSW` / `MSW`.
   - Possible word extraction functions.
   - Low priority until use cases are clear.

Do not start P3 features without a separate design pass.
