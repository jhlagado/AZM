# `addr` Implementation Prerequisites

**Date:** 2026-03-08
**Status:** Spec decisions — ready for implementation backlog
**Purpose:** Close the implementation-blocking questions for the first `addr`
slice before work begins. This document is narrower than
`docs/archive/design/ops-first-addressing-decisions.md` and records only the
decisions needed to start `addr`.

Questions addressed here: transitional typed EA in `ld`, semantic mapping onto `addr`, op-contract status for v1, and the preservation contract for `addr`.
Questions intentionally deferred: cast syntax (`<Type>base.tail`), `@dead` pragma surface, and `select case` range/group overlap rules.

---

## Q1 — Transitional status of typed EA in `ld`

**Answer:** Transitional compatibility only. Not a parallel feature.

Forms such as:

```zax
ld a, arr[C]
ld arr[C], a
ld de, table[idx]
```

are transitional compatibility surface. They are not independently specified and they do not keep bespoke hidden lowering.

What "transitional" means concretely:

- they are defined only as shorthand for the `addr`-then-access pattern (see Q2)
- they inherit the `addr` preservation contract rather than inventing their own
- they may be removed from the language once `addr` is established and standard-library access ops exist
- new code should not rely on them as the primary or intended model

If these forms remain in the parser, their lowering must route through the `addr` path.

---

## Q2 — Semantic mapping of transitional direct EA forms onto `addr`

**Answer:** Each supported transitional form is defined as a fixed semantic expansion over `addr hl, ea`. HL is always the intermediate register.

### Byte load

```zax
ld a, ea
```

expands to:

```zax
addr hl, ea
ld a, (hl)
```

- contract: result in `A`
- preservation: whatever `addr` guarantees, plus the ordinary machine effect of `ld a, (hl)`

### Byte store

```zax
ld ea, a
```

expands to:

```zax
addr hl, ea
ld (hl), a
```

- contract: store `A` into memory at `ea`
- preservation: whatever `addr` guarantees, plus the ordinary machine effect of `ld (hl), a`

### Word load into HL

```zax
ld hl, ea
```

expands to:

```zax
addr hl, ea
ld a, (hl)
inc hl
ld h, (hl)
ld l, a
```

- contract: result in `HL`
- preservation: whatever `addr` guarantees, plus the ordinary machine effects of the explicit instructions above

### Word load into DE

```zax
ld de, ea
```

expands to:

```zax
addr hl, ea
ld e, (hl)
inc hl
ld d, (hl)
```

### Word load into BC

```zax
ld bc, ea
```

expands to:

```zax
addr hl, ea
ld c, (hl)
inc hl
ld b, (hl)
```

### Word store from HL — unsupported in v1

```zax
ld ea, hl
```

is **not supported as transitional sugar in v1**.

Reason: `addr` is HL-only. A word store from HL needs the effective address in a register other than HL, or an explicit spill/reload sequence. That is exactly the hidden tactical complexity this direction is trying to avoid.

The v1 diagnostic should state plainly that word store via typed EA in `ld` is unsupported and that the programmer must use an explicit sequence or a dedicated op.

---

## Q3 — Op contracts in v1

**Answer:** Deferred. No op metadata in v1.

Ops carry no compiler-verified clobber/result annotations in this phase. The programmer is responsible for preservation within an op body. The compiler makes no promises about user-authored op register effects.

This remains separate from `addr`, which is compiler-owned and therefore can have a compiler-guaranteed preservation contract.

---

## Q4 — `addr` preservation contract and machinery

**Answer:** `addr` has a fixed compiler-guaranteed public contract:

> `addr hl, ea_expr` places the effective address in `HL` and preserves everything else.

The programmer does not need to know how `addr` computes the address internally.

### Internal model

For each `addr` lowering path, the compiler must know which registers it uses transiently while computing the address. From that internal knowledge it emits preservation scaffolding around the lowering body.

Conceptually:

```text
for each addr lowering path:
  transiently_used = registers this path uses internally, excluding HL

emit:
  preserve transiently_used
  [lowering body]
  restore transiently_used
```

The important distinction is structural:

- **preservation scaffolding** is compiler-owned
- **lowering body operations** are the actual instructions used to compute the address

That distinction is required now, even before any `@dead` pragma exists, because later optimizations must be able to trim preservation without touching semantic stack juggling inside the lowering body.

### Why this is not D4's deferred problem

Deferred op contracts are about **user-written op bodies**, where the compiler lacks a general effect-analysis mechanism.

`addr` is different. It is a compiler-owned keyword. The compiler generates the whole lowering path and therefore already knows which registers it uses internally. No analysis framework is required.

---

## What remains intentionally open

| Question | Status | When to resolve |
|---|---|---|
| `<Type>base.tail` grammar production | Open | Before cast syntax implementation begins |
| Valid `base` for cast in v1 | Open | Before cast syntax implementation begins |
| `@dead` pragma surface and scope rules | Deferred | After `addr` lowering is stable |
| `select case` range/group overlap lowering | Resolved | Overlapping reachable values are compile errors; out-of-range `reg8` portions warn and are omitted/clipped |

---

## Implementation boundary for the first slice

The resolved answers support this first implementation slice:

1. `addr hl, ea_expr` — parser, lowering, and compiler-owned preservation machinery
2. Transitional typed EA in `ld` — routes through `addr` lowering, not bespoke hidden paths
3. Explicit diagnostic for unsupported word-store-from-HL via typed EA
4. Tests — verify correct address computation across EA shapes and verify the public preservation contract of `addr`

Not part of this first slice:

- `@dead` pragma syntax or propagation
- typed cast syntax
- grouped/ranged `select case` (implemented later)
- user-authored op contract metadata
