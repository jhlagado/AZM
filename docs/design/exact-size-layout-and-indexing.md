# Exact-Size Layout and Indexing

Status: direction accepted; implementation staged via issues #817-#820

## Purpose

Remove the remaining semantic use of power-of-two rounded type sizes.

ZAX now treats exact packed size as the real size of a type. Power-of-two
scaling remains a code-generation optimization only. It is no longer part of
the language layout model.

## Current state

Current `main` already partially moved in this direction:

- record field packing uses exact field size when computing nested record
  offsets
- field walking for typed storage paths uses exact field size
- tests already lock exact packed record sizes

But array stride and runtime indexed addressing still retain the old rounded
power-of-two model:

- array total size still uses rounded element size
- runtime indexing only supports element sizes that are powers of two
- wide EA helpers still assume shift-only scaling

So the implementation is currently split between two incompatible rules.

## Decision

Adopt a single exact-size rule for type layout.

- a type has one semantic size: its exact packed size in bytes
- records use the sum of exact field sizes
- unions use the max exact member size
- arrays use exact element size times length
- named types recurse to the exact size of the referenced type
- no semantic layout rule rounds to the next power of two

Power-of-two size remains relevant only as an optimization opportunity in code
emission.

## Naming cleanup

The current pair:

- `preRoundSize`
- `storageSize`

is now misleading.

Target model:

- keep one exact size concept in semantics/layout
- migrate callers from `preRoundSizeOfTypeExpr(...)` / `sizeOfTypeExpr(...)`
  split to a single exact-size API
- if an optimization helper still wants power-of-two classification, compute it
  locally in lowering from the exact size

The old rounded `storageSize` concept should be removed, not preserved under a
new name.

## Code-generation rule

Exact-size layout does not require general multiplication instructions, but it
*does* require exact constant scaling for indexed addressing.

For indexed array addressing with runtime index in `HL` and base in `DE`:

- if `elemSize` is a power of two, keep the current fast path:
  - emit unrolled `add hl, hl` shifts
  - then `add hl, de`
  - no `DE` preservation needed
- if `elemSize` is not a power of two:
  1. preserve incoming base `DE` on the stack with `push de`
  2. copy original index from `HL` into `DE` using `ld d, h` / `ld e, l`
  3. emit an unrolled shift/add multiply sequence using:
     - `add hl, hl`
     - `add hl, de`
  4. restore base `DE` with `pop de`
  5. `add hl, de` to combine scaled index with base

This keeps power-of-two sizes fast while making exact-size indexing correct for
all sizes.

The non-power-of-two path must keep stack balance exact. The preserved base in
`DE` is restored from the stack before the final base add; this is not an
optional implementation detail.

## General multiply-by-constant algorithm

Do not hardcode only a few sizes like 3, 5, or 6.

The non-power-of-two path should be generated from the binary decomposition of
`elemSize`.

Given:

- `HL = x`
- preserved original `DE = x`

For multiplier `K`:

- start with `HL = x`
- walk the remaining bits of `K` after the top set bit
- for each bit:
  - `add hl, hl`
  - if the bit is `1`, `add hl, de`

Example for `K = 13` (`1101b`):

- start `HL = x`
- bit `1`: `add hl, hl`; `add hl, de` -> `3x`
- bit `0`: `add hl, hl` -> `6x`
- bit `1`: `add hl, hl`; `add hl, de` -> `13x`

This yields a general unrolled multiply-by-constant sequence with no multiply
subroutine call.

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

## Scope of the change

This is broader than the old Phase D note.

It now means:

1. remove rounded semantic size from `src/semantics/layout.ts`
2. make arrays stride by exact element size
3. update field walking and emitters to use the unified exact size API
4. update runtime indexed addressing to support exact non-power-of-two scaling
5. optionally add diagnostics encouraging power-of-two element sizes for speed,
   but not as a semantic rule

## Non-goals

- introducing explicit alignment as a language feature
- adding a multiply subroutine call as the default implementation strategy
- preserving the old rounded `storageSize` behavior for compatibility

## Implementation sequence

1. unify semantic layout on one exact-size API
2. update emitters and typed offset walking to use that exact-size API
3. implement exact constant scaling in addressing/lowering
4. refresh tests and examples
5. optionally add a performance warning for non-power-of-two array element sizes

## Issue split

Recommended issue split:

- umbrella: exact-size layout and indexing
- semantic layout unification
- exact-scale lowering for indexed addressing
- cleanup/docs/tests
