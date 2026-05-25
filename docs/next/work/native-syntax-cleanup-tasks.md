# AZM Native Syntax Cleanup Tasks

Status: implemented on `codex/native-syntax-cleanup`; retain as handover evidence

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

has been replaced in active examples. It remains accepted only as transition
compatibility syntax.

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

1. Done: add `Name .typealias TypeExpr`.
   - Reuse the already-landed type-alias semantics.
   - Cover aliases to record, union, scalar, array, and nested alias targets.
   - Cover `.ds`, `.field`, `sizeof`, `offset`, layout casts, lowered ASM80,
     recursive aliases, and undefined targets.

2. Done: add name-left enum syntax.
   - Native form: `Name .enum A, B, C`.
   - Decide whether existing `enum Name A, B, C` remains compatibility syntax
     during transition.
   - Reject `Name: .enum ...`.

3. Done: add name-left type body syntax.
   - Native form: `Name .type` ... `.endtype`.
   - Decide whether existing `.type Name` remains compatibility syntax during
     transition.
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

## Follow-Up P2 Work

- Colon consistency audit across all parser contexts.
- Quote syntax policy.
- Case-sensitive directive alias matching.
- `--case-style` review.

Do not start P3 features from the external coding-agent brief without a separate
design pass.
