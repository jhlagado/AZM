# Exact-Size Layout Constants

Status: direction accepted; AZM scope narrowed

## Purpose

AZM should help assembly programmers describe complex memory layouts without
turning memory access into a high-level language feature.

The intended feature is a small layout-constant system:

- record and union layout declarations
- array type expressions
- exact `sizeof(...)`
- exact `offsetof(...)`
- explicit layout-cast address expressions
- named constants derived from those values

The CPU still performs indexing, address arithmetic, loads, and stores. AZM
only calculates the constants that make those operations maintainable.

## Current state

The inherited ZAX codebase already has substantial type and layout machinery:

- scalar sizes
- record field offsets
- union size and overlay rules
- arrays
- `sizeof`
- `offsetof`
- cast-style typed effective-address syntax
- typed storage paths and lowering

AZM should not carry all of that forward unchanged. The useful part is the
layout calculation. Explicit cast-style layout paths are useful when they
resolve to constant address expressions. The high-level typed access,
assignment, and hidden lowering machinery should be audited separately and is
not part of this design.

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
ld hl,SPRITES + ((BASE + 1) * sizeof(Sprite)) + offsetof(Sprite, pos.x)
ld a,(SPRITES + ((BASE + 1) * sizeof(Sprite)) + offsetof(Sprite, flags))
```

The parentheses in the second form are ordinary Z80 memory dereference syntax.
The brackets are not a memory dereference; inside a layout-cast path they mean
array element offset.

AZM should also make this kind of source reliable:

```asm
type Sprite
    x:     byte
    y:     byte
    tile:  byte
    flags: byte
end

SPRITE_SIZE  .equ sizeof(Sprite)
SPRITE_X     .equ offsetof(Sprite, x)
SPRITE_FLAGS .equ offsetof(Sprite, flags)

SPRITES:
    .ds sizeof(Sprite[16])
```

The `.ds` line reserves the correct number of bytes, but it does not
permanently bind `SPRITES` to a type. The use-site cast supplies the intended
layout:

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

`sizeof` should reject:

- unknown types
- inferred-length arrays where the length is not known
- recursive layouts with no finite size

## `offsetof`

`offsetof` should be a compile-time expression that returns a byte offset from
the start of a layout.

Required forms:

```asm
offsetof(Sprite, flags)
offsetof(Rect, bottomRight.x)
offsetof(Sprite[16], [2].flags)
```

For records, each path step adds the exact size of preceding fields. For unions,
each field starts at offset zero, and nested paths continue inside the selected
field's type. For arrays, an index step adds
`index * sizeof(element)`.

`offsetof` should reject:

- unknown types
- unknown fields
- field access through scalar types
- array index expressions that are not compile-time constants
- runtime values

That keeps `offsetof` a pure layout query.

## Arrays

Arrays are layout expressions, not runtime containers.

```asm
sizeof(byte[32])      ; 32
sizeof(Sprite[16])    ; 16 * sizeof(Sprite)
```

Array stride is always `sizeof(element)`. AZM may expose that value through
`sizeof(Element)`, `offsetof(...)`, explicit layout-cast address expressions,
and ordinary constant arithmetic. It does not need a separate runtime indexing
feature.

## Scope of the change

For AZM, this means:

1. preserve or rebuild the layout parser and evaluator
2. remove rounded semantic size from `src/semantics/layout.ts`
3. make arrays stride by exact element size
4. support `sizeof` and `offsetof` in constant expressions
5. support explicit `<TypeExpr>base[index].field` layout-cast address
   expressions when all path indexes are constant
6. allow those values anywhere ordinary address constants are legal
7. avoid hidden address-lowering behavior as part of this feature

## Non-goals

- introducing explicit alignment as a language feature
- preserving the old rounded `storageSize` behavior for compatibility
- adding typed assignment or typed memory access
- adding implicit typed label access without an explicit layout cast
- accepting runtime registers inside layout path indexes
- generating multiply-by-constant address code automatically

## Implementation sequence

1. unify semantic layout on one exact-size API
2. keep record, union, array, `sizeof`, and `offsetof` tests focused on
   compile-time values
3. keep explicit layout-cast address tests focused on constant folding
4. remove or quarantine tests whose only purpose is old ZAX typed memory
   lowering
5. document idiomatic assembly examples using `.equ`, `sizeof`, `offsetof`,
   and `<TypeExpr>label[index].field`
6. defer any address-calculation helper ops until the op survival plan is
   settled

## Issue split

Recommended issue split:

- umbrella: exact-size layout constants
- semantic layout unification
- `sizeof` and `offsetof` constant-expression coverage
- explicit layout-cast address expressions
- ZAX typed-memory-lowering audit
- cleanup/docs/tests
