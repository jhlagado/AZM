# AZM Post-Release P1 Manual Handover

Status: draft for documentation writers

This note summarizes the post-0.2.1 language changes that should be integrated
into the AZM assembler manual.

## Canonical Directive Case

Canonical AZM dotted directives are lowercase and case-sensitive:

```asm
.org $8000
.db 1,2,3
.dw target
.ds Sprite[16]
.end
```

Case-varied dotted spellings such as `.ORG`, `.DB`, `.Type`, or `.EndType` are
not canonical AZM and are rejected by the parser.

Compatibility spellings such as `ORG`, `EQU`, `DB`, `DW`, and `DS` remain
available through the directive-alias system. The manual should teach lowercase
dotted AZM style first and describe undotted uppercase heads only as import or
compatibility aliases.

## AZM Function Case

AZM compile-time function names are case-sensitive. Use the documented spelling:

```asm
SIZE  .equ sizeof(Sprite)
FLAGS .equ offset(Sprite, flags)
LO    .equ LSB(target)
HI    .equ MSB(target)
```

Do not write `SIZEOF`, `Offset`, `lsb`, or `msb`.

## Conditional Source Inclusion

Conditional source inclusion uses lowercase dotted directives:

```asm
DEBUG .equ 1

.if DEBUG
        .db $ff
.else
        .db $00
.endif
```

The current implementation evaluates `.if` during source preprocessing. It can
use already-known constants and equates, including supported `EQU` aliases, but
it deliberately rejects current-location-dependent expressions involving `$`.

## Byte Extraction Functions

`LSB(...)` returns the low byte of a compile-time expression. `MSB(...)` returns
the high byte:

```asm
target:
VALUE .equ $ABCD

        .db LSB(VALUE), MSB(VALUE)
        .db LSB(target), MSB(target)
```

These are compile-time functions, not runtime instructions.

## Layout Type Aliases

AZM now supports transparent aliases for layout type expressions:

```asm
.type Sprite
x     .byte
y     .byte
tile  .byte
flags .byte
.endtype

.type SpriteArray = Sprite[16]
```

`SpriteArray` behaves exactly like `Sprite[16]`:

```asm
SPRITES:
        .ds SpriteArray

SIZE  .equ sizeof(SpriteArray)
FLAGS .equ offset(SpriteArray, [3].flags)
        LD HL,<SpriteArray>SPRITES[3].flags
```

The alias does not add a wrapper field. It is not equivalent to:

```asm
.type SpriteArray
sprites .field Sprite[16]
.endtype
```

That wrapper form remains valid, but it requires the extra `sprites` path level.
Use `.type Name = TypeExpr` when the intent is a pure alias.

Aliases are compile-time layout facts only. They do not introduce constructors,
runtime type checks, hidden typed load/store lowering, or a broader type system.

## Register-Care Status

No new register-care syntax is introduced by this P1 language pass. Existing
register-care behavior remains the retained AZM feature surface: `@` routine
entry labels, AZMDoc contracts, `.asmi` interfaces, CLI/tooling reports, and
source annotation support. The post-release verification pass re-ran the
register-care integration suite to ensure the parser and layout changes did not
regress it.

## Suggested Manual Placement

- Put canonical case rules near the initial syntax/style chapter.
- Put `.if` / `.else` / `.endif` near constants and source inclusion.
- Put `LSB(...)` / `MSB(...)` with compile-time expressions.
- Put `.type Name = TypeExpr` after records/unions and before array examples.
- Keep compatibility aliases separate from canonical AZM syntax examples.
