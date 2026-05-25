# Exact-Size Layout Constants

Status: retained AZM feature direction

## Purpose

AZM should help assembly programmers describe complex memory layouts without
turning memory access into a high-level language feature.

The intended feature is a small layout-constant system:

- record and union layout declarations
- array type expressions
- scalar layout types such as `byte`, `word`, and `addr`
- exact `sizeof(...)`
- exact `offset(...)`
- explicit layout-cast address expressions
- named constants derived from those values

The CPU still performs indexing, address arithmetic, loads, and stores. AZM
only calculates the constants that make those operations maintainable.

The storage rule is deliberately ordinary assembler: type expressions calculate
sizes, `.ds` reserves sizes, and initialized data still uses `.db`, `.dw`,
`.cstr`, `.pstr`, and `.istr`.

## Current AZM surface

AZM retains the useful assembler-facing part of the inherited layout machinery:

- scalar sizes
- record field offsets
- union size and overlay rules
- arrays
- `sizeof`
- `offset`
- constant-only layout-cast address expressions

AZM does not carry all inherited ZAX type behavior forward. The useful part is
layout calculation. Explicit cast-style layout paths are useful only when they
resolve to constant address expressions.

Obsolete ZAX behavior for this area:

- typed storage paths
- `:=` assignment
- implicit typed label access
- runtime register indexes inside layout paths
- hidden effective-address or load/store lowering

## Decision

Adopt exact packed layout as the only semantic layout model.

- a type has one semantic size: its exact packed size in bytes
- records use the sum of exact field sizes
- unions use the max exact member size
- arrays use exact element size times length
- named types recurse to the exact size of the referenced type
- no semantic layout rule rounds to the next power of two

Power-of-two sizes may still matter to the programmer for performance, but that
is a code-writing concern, not a layout rule.

## Assembly boundary

AZM should not infer typed memory access from an untyped label:

```asm
Sprite[HL].flags
player.position.x
```

That kind of syntax is too implicit for AZM. The source does not say what layout
type applies to the label, and `HL` is a runtime value that cannot be folded
into a constant address.

AZM should instead preserve the explicit inherited cast form as a layout query:

```asm
ld hl,<Sprite[16]>SPRITES[BASE + 1].pos.x
ld a,(<Sprite[16]>SPRITES[BASE + 1].flags)
```

The cast says: treat `SPRITES` as the base address of a `Sprite[16]` layout, and
fold the bracket/field path into a constant byte offset. The examples above are
equivalent to:

```asm
ld hl,SPRITES + ((BASE + 1) * sizeof(Sprite)) + offset(Sprite, pos.x)
ld a,(SPRITES + ((BASE + 1) * sizeof(Sprite)) + offset(Sprite, flags))
```

The parentheses in the second form are ordinary Z80 memory dereference syntax.
The brackets are not a memory dereference; inside a layout-cast path they mean
array element offset.

AZM should also make this kind of source reliable:

```asm
Sprite .type
x     .byte
y     .word
tile  .byte
flags .byte
arr   .field byte[10]
.endtype

SPRITE_SIZE  .equ sizeof(Sprite)
SPRITE_X     .equ offset(Sprite, x)
SPRITE_FLAGS .equ offset(Sprite, flags)

SPRITES:
    .ds Sprite[16]
```

In this context `Sprite[16]` is a size expression. It means
`sizeof(Sprite) * 16`. The `.ds` line reserves the correct number of bytes, but
it does not permanently bind `SPRITES` to a type. The use-site cast supplies the
intended layout:

```asm
ld hl,<Sprite[16]>SPRITES[2].flags
```

For runtime indexing, the programmer still writes the actual Z80 code:

```asm
; HL = runtime sprite index
; Compute HL = SPRITES + HL * SPRITE_SIZE + SPRITE_FLAGS
; using whatever sequence is appropriate for the program.
```

This keeps the machine visible and prevents the layout feature from becoming
hidden lowering.

## Layout-cast address expressions

Layout casts are **expression sugar**, not memory-access operators. A folded
cast must be equivalent to the same expression built from `sizeof` and
`offset`, and must reach instruction emission as an ordinary constant operand
(fixup addend), not through typed load/store lowering. See
`docs/design/azm-expression-and-visibility.md`.

The core address-expression form is:

```asm
<TypeExpr>base[index].field
```

where:

- `TypeExpr` is a layout type such as `Sprite`, `Sprite[16]`, or `TileMap`
- `base` is a label or address expression
- `[index]` selects an array element
- `.field` selects a record or union field

Indexes inside layout-cast paths must be compile-time expressions:

```asm
BASE .equ 2
ld hl,<Sprite[16]>SPRITES[BASE + 1].pos.x
```

Runtime registers are not valid in layout paths:

```asm
ld hl,<Sprite[16]>SPRITES[HL].pos.x   ; invalid: HL is not constant
```

This rule is what keeps the feature from generating hidden multiply/add code.
The expression either folds to an address constant or it is rejected.

## Naming cleanup

The inherited pair:

- `preRoundSize`
- `storageSize`

is misleading for AZM.

Target model:

- keep one exact size concept in semantics/layout
- migrate callers from the `preRoundSizeOfTypeExpr(...)` /
  `sizeOfTypeExpr(...)` split to a single exact-size API
- if any retained lowering helper still wants power-of-two classification,
  compute it locally from the exact size

The old rounded `storageSize` concept should be removed, not preserved under a
new name.

## Recursive size calculation

Exact-size layout must remain recursive.

The size of a composite element is computed recursively through its type:

- scalar: fixed size
- named type: resolve and recurse
- record: sum field sizes
- union: max member size
- array: element size times length

So an array element that is itself a record containing arrays or nested records
must resolve to one exact recursive packed size.

## `sizeof`

`sizeof` should be a compile-time expression that returns an exact byte count.

Required forms:

```asm
sizeof(byte)
sizeof(word)
sizeof(Sprite)
sizeof(Sprite[16])
```

The same type expressions are also valid directly in layout-size positions:

```asm
Scratch:
    .ds byte           ; 1 byte
    .ds byte[10]       ; 10 bytes
    .ds word           ; 2 bytes
    .ds word[10]       ; 20 bytes
    .ds Sprite         ; sizeof(Sprite)
    .ds Sprite[10]     ; sizeof(Sprite) * 10
```

This is not a second initialization syntax. `.ds byte[10]` is still just `.ds`
with a byte-count expression. Initialized data remains `.db`, `.dw`, and the
string directives.

The scalar names work the same way as records in size positions:

```asm
byte       ; 1
word       ; 2
addr       ; 2
byte[10]   ; 10
word[10]   ; 20
addr[10]   ; 20
```

So this:

```asm
Buffer:
    .ds byte[10]
```

is just the readable form of:

```asm
Buffer:
    .ds 10
```

It does not create ten named byte fields and it does not create an initialized
array.

The scalar layout names are types. In a layout block:

```asm
field .byte
field .word
field .addr
```

means:

```asm
field .field byte
field .field word
field .field addr
```

So `.word` is `.field word` in layout terms, and `word` contributes 2 bytes
to the enclosing layout. These layout shorthands do not emit bytes; storage
still comes from `.db`, `.dw`, and `.ds`.

The idiomatic field rule is:

- `name .field T` contributes `sizeof(T)` bytes to the enclosing layout
- `name .field T[n]` contributes `n * sizeof(T)` bytes
- `name .byte`, `name .word`, and `name .addr` are shorthand for
  `name .field byte`, `name .field word`, and `name .field addr`

For example:

```asm
Sprite .type
x   .byte
y   .word
arr .field byte[10]
.endtype
```

Here `x` occupies 1 byte, `y` occupies 2 bytes, and `arr` occupies 10 bytes.

`sizeof` should reject:

- unknown types
- inferred-length arrays where the length is not known
- recursive layouts with no finite size

## `offset`

`offset` should be a compile-time expression that returns a byte offset from
the start of a layout.

`offset` is the only AZM spelling. AZM has no legacy spelling for this feature.

Required forms:

```asm
offset(Sprite, flags)
offset(Rect, bottomRight.x)
offset(Sprite[16], [2].flags)
```

For records, each path step adds the exact size of preceding fields. For unions,
each field starts at offset zero, and nested paths continue inside the selected
field's type. For arrays, an index step adds
`index * sizeof(element)`.

`offset` should reject:

- unknown types
- unknown fields
- field access through scalar types
- array index expressions that are not compile-time constants
- runtime values

That keeps `offset` a pure layout query.

## Arrays

Arrays are layout expressions, not runtime containers.

```asm
sizeof(byte)          ; 1
sizeof(word)          ; 2
sizeof(byte[32])      ; 32
sizeof(Sprite[16])    ; 16 * sizeof(Sprite)
```

Array stride is always `sizeof(element)`. AZM may expose that value through
`sizeof(Element)`, `offset(...)`, explicit layout-cast address expressions,
and ordinary constant arithmetic. It does not need a separate runtime indexing
feature.

In a layout-size position, the type expression itself is the byte count:

```asm
byte        ; 1
word        ; 2
addr        ; 2
Sprite      ; sizeof(Sprite)
byte[10]    ; 10
word[10]    ; 20
Sprite[10]  ; sizeof(Sprite) * 10
```

The important boundary is that this is a constant-expression rule. `byte[10]`
does not declare ten byte variables, create a typed label, or initialize memory.
It evaluates to the number of bytes needed by that layout.

For storage reservation, `.ds` may take a type expression directly:

```asm
OneByte:
    .ds byte

Buffer:
    .ds byte[32]

OneWord:
    .ds word

Words:
    .ds word[8]

OneSprite:
    .ds Sprite

Sprites:
    .ds Sprite[16]
```

This is only shorthand for:

```asm
OneByte:
    .ds sizeof(byte)

Buffer:
    .ds sizeof(byte[32])

OneWord:
    .ds sizeof(word)

Words:
    .ds sizeof(word[8])

OneSprite:
    .ds sizeof(Sprite)

Sprites:
    .ds sizeof(Sprite[16])
```

It keeps `.ds` as the storage directive and keeps the type system in the
compile-time size-calculation role.

The initialized data directives remain separate:

```asm
.db "hello",0
.dw 1000H,2000H
.cstr "hello"
.pstr "hello"
.istr "hello"
```

Those forms write bytes or words now; `.ds` reserves space, optionally filled
with a byte value. `.db` and `.dw` are therefore not aliases for `.ds byte` and
`.ds word`: they are the initialized-data forms. `.cstr`, `.pstr`, and `.istr`
are initialized string-data shorthands. AZM does not use `.cstring` or
`.pstring` as the canonical names.

The string directive meanings are:

- `.cstr "text"` emits the string bytes followed by `0`
- `.pstr "text"` emits a leading length byte followed by the string bytes
- `.istr "text"` emits the string bytes with bit 7 set on the final character

The practical rule is:

- use `.field TypeExpr` inside `.type` / `.union` to describe layout;
- use `.ds TypeExpr` to reserve uninitialized storage of that layout size;
- use scalar shorthand such as `.ds byte[32]`, `.field word`, `.byte`, `.word`,
  and `.addr` only as byte-size/layout spelling;
- use `.db`, `.dw`, `.cstr`, `.pstr`, or `.istr` when the source supplies the
  actual bytes or words to emit.

## Record allocation and initialization

A record declaration is a layout description, not a storage declaration:

```asm
Sprite .type
x       .byte
y       .byte
flags   .byte
ptr     .word
.endtype
```

To allocate one record, reserve its byte size:

```asm
PlayerSprite:
    .ds Sprite
```

To allocate an array of records, reserve the array type expression:

```asm
SpriteTable:
    .ds Sprite[16]
```

Those lines mean exactly:

```asm
PlayerSprite:
    .ds sizeof(Sprite)

SpriteTable:
    .ds sizeof(Sprite[16])
```

The labels are still ordinary labels. They are not permanently typed. If a later
instruction wants a field offset, it supplies the layout explicitly:

```asm
    ld hl,<Sprite>PlayerSprite.flags
    ld hl,<Sprite[16]>SpriteTable[3].ptr
```

Initialized records should stay assembler-shaped. The source writes the fields
in layout order using the initialized-data directives:

```asm
PlayerSprite:
    .db 10             ; x
    .db 20             ; y
    .db 00000001B      ; flags
    .dw SpriteImage    ; ptr
```

AZM should not add record constructors unless there is a strong assembler-level
reason later. The useful feature here is reliable byte-size and field-offset
calculation, not a new data initialization language.

## Scope

For AZM, this means maintaining:

1. layout parser and evaluator support
2. one exact semantic size model instead of rounded semantic storage size
3. arrays that stride by exact element size
4. `sizeof` and `offset` in constant expressions
5. explicit `<TypeExpr>base[index].field` layout-cast address
   expressions when all path indexes are constant
6. those values anywhere ordinary address constants are legal
7. no hidden address-lowering behavior as part of this feature

This design sits inside the current AZM language boundary: `.asm` and `.z80`
are source files, `.asmi` is the external register-care interface format, and
layout support is limited to assembler-visible constants.

## Non-goals

- introducing explicit alignment as a language feature
- preserving the old rounded `storageSize` behavior for compatibility
- adding modules/imports, `func`, locals, formal args, or named sections
- adding typed assignment or typed memory access
- adding typed storage lowering
- adding implicit typed label access without an explicit layout cast
- accepting runtime registers inside layout path indexes
- generating multiply-by-constant address code automatically

## Maintenance guidance

1. keep semantic layout on one exact-size model
2. keep record, union, array, `sizeof`, and `offset` tests focused on
   compile-time values
3. keep explicit layout-cast address tests focused on constant folding
4. remove or quarantine tests whose only purpose is old ZAX typed memory
   lowering
5. document idiomatic assembly examples using `.equ`, `sizeof`, `offset`,
   and `<TypeExpr>label[index].field`
6. defer any address-calculation helper ops until the AZM op subset has a
   specific visible-expansion design for them

## Work classification

Current:

- exact-size layout constants
- scalar layout sizes
- `sizeof` and `offset` constant-expression coverage
- explicit constant-only layout-cast address expressions

Deferred:

- address-calculation helper ops that emit visible Z80
- record-constructor syntax, if it can ever be justified as assembler data

Obsolete:

- ZAX typed-memory lowering
- rounded semantic storage size
- typed assignment or runtime typed access
