# Typed Reinterpretation Cast (`LANG-02`)

**Date:** 2026-03-12
**Status:** Accepted design; implementation landed on `main`
**Source:** GitHub issue `#736 (LANG-02)`

This document defines the accepted source-language shape for typed
reinterpretation using angle-bracket cast syntax:

```zax
<Type>base.tail
```

It replaces the scattered historical cast notes in archived addressing
documents and serves as the retained design record for `LANG-02`.

---

## Purpose

ZAX already has strong typed storage-path syntax:

- `rec.field`
- `arr[index]`
- nested paths such as `sprites[C].flags`

What it lacks is a way to apply those typed path rules to an address value that
already exists at runtime.

That gap appears in common low-level cases:

- a pointer-like value already lives in `HL`, `DE`, `BC`, `IX`, or `IY`
- a scalar `word`/`addr` variable contains a runtime address
- a function parameter is an address that should be viewed as a specific record
  or array type at the access site

The goal of `LANG-02` is to make that explicit and local without changing the
rest of the language model.

---

## Core rule

`<Type>base` means:

> treat `base` as the address of a value of type `Type`

The result is a typed storage base. Normal typed path rules then continue from
that base:

- `.field` selects a record or union field
- `[index]` selects an array element
- existing scalar-versus-aggregate access rules remain unchanged

Examples:

```zax
ld a, <Sprite>hl.flags
ld hl, <Sprite>ptr.position
ld a, <TileMap>map_base[row][col]
ld (<Header>ix.checksum), a
```

The cast is local. It does not permanently type the register or variable used
as the base.

---

## Design goals

- Add typed reinterpretation without changing the existing direct typed-`ld`
  surface.
- Keep source intent explicit at the access site.
- Avoid introducing generic pointer types or persistent typed-register state.
- Reuse the existing field/indexing model instead of creating a second access
  language.
- Keep the grammar simple enough to fit the grammar-driven parser strategy.

---

## Accepted v1 shape

### Syntax

The intended surface syntax is:

```ebnf
typed_reinterpret_expr = "<" , type_expr , ">" , reinterpret_base , reinterpret_tail ;
reinterpret_tail       = ( "." , identifier | "[" , ea_index , "]" ) ,
                         { "." , identifier | "[" , ea_index , "]" } ;
```

This is intentionally a typed-path form, not a general expression cast.

### Required tail

In v1, the cast must be followed by at least one path segment:

- valid: `<Sprite>hl.flags`
- valid: `<Sprite[8]>ptr[2]`
- invalid in v1: `<Sprite>hl`

Rationale:

- the language value comes from typed field/index access
- requiring a tail keeps the feature visually tied to storage navigation
- it avoids introducing a new “bare typed pointer value” category before the
  language has a broader address-value design

---

## Valid base forms in v1

`reinterpret_base` should accept values that are already plausible address
holders in current ZAX.

### Allowed base forms

1. Address-capable 16-bit registers:
   - `HL`
   - `DE`
   - `BC`
   - `IX`
   - `IY`

2. Scalar names whose type is `word` or `addr`:
   - globals
   - locals
   - function parameters
   - constants are not included here because the cast is for runtime address
     values, not compile-time storage naming

3. Parenthesized address-value forms built from an allowed base plus `+ imm` or
   `- imm`:

```zax
<Sprite>(hl + 4).flags
<Header>(ptr - 2).checksum
```

### Explicitly not valid in v1

- bare aggregates such as `<Sprite>sprites`
- general `imm` expressions
- `AF`
- `SP`
- arbitrary nested casts as bases

Reasons:

- bare aggregates already have native typed storage semantics and do not need
  reinterpretation
- `imm` expressions are not the current source model for runtime addresses
- `AF` is not an address base
- `SP` introduces stack-model questions that are better handled separately
- nested casts complicate the grammar and are not needed for the first useful
  slice

---

## Semantics

### Storage-path semantics

`<Type>base.tail` creates a typed storage path exactly as though there were an
anonymous storage object of type `Type` rooted at address `base`.

That means:

- field offsets come from `Type`
- array element stride comes from the selected array element type
- further `.field` / `[index]` traversal behaves the same way as ordinary typed
  storage access

### Scalar and aggregate use

Existing value semantics remain in force:

- if the final selected thing is scalar, bare use in ordinary instruction and
  call contexts has scalar value semantics
- if the final selected thing is aggregate, the result remains a storage base
  for further navigation or aggregate use

Examples:

```zax
ld a, <Sprite>hl.flags      ; scalar byte load
ld hl, <Sprite>hl.position  ; scalar word load
ld a, <RowTable>de[row].x   ; scalar via array + field path
ld hl, <Sprite>hl           ; invalid in v1, no tail
```

### No persistent typing

After:

```zax
ld a, <Sprite>hl.flags
```

`HL` is still just `HL`. The cast does not mutate register identity or attach a
lasting type to the register.

---

## Interaction with existing `ea` rules

Typed reinterpretation is additive. It does not replace ordinary `ea` forms.

Current ZAX already supports typed storage access when the compiler knows the
type of the storage base:

- `player.flags`
- `sprites[C].x`

`LANG-02` extends that same access model to explicit runtime address values.

Conceptually:

- ordinary typed storage path: typed base is known from the declaration
- reinterpretation path: typed base is supplied explicitly at the access site

This keeps one storage-path language instead of splitting the language into two
unrelated addressing models.

---

## Lowering intent

This document does not prescribe implementation details, but the intended
lowering model is straightforward:

1. Evaluate the base as a runtime address value.
2. Reuse the same field/index offset logic already used for typed storage-path
   lowering.
3. Materialize the effective address when the target Z80 form needs one.
4. Preserve existing scalar load/store semantics and diagnostics.

Important consequence:

- `LANG-02` is not a reason to reintroduce `addr` as a source-language feature
- it should fit the current direct typed-`ld` world, not replace it

---

## Diagnostics

V1 should diagnose the following clearly:

- unknown cast type
- invalid base form for reinterpretation
- missing tail after `<Type>base`
- field selection on a non-record/non-union cast type
- indexing on a non-array cast type
- invalid index form under the existing `ea` rules

Representative invalid forms:

```zax
ld a, <Sprite>hl            ; error: reinterpret cast requires a field/index tail
ld a, <Sprite>af.flags      ; error: AF is not a valid reinterpret base
ld a, <word>hl.low          ; error: scalar cast type cannot be field-selected
ld a, <Sprite>sprites.flags ; error: aggregate storage name is not a reinterpret base
```

---

## Grammar impact

The parser should treat the cast as a privileged storage-path head, not as a
general-purpose expression cast.

That means the grammar update should live near the `ea` / storage-path area in
`docs/spec/zax-grammar.ebnf.md`, not in the arithmetic `imm_expr` section.

The intended shape is:

- a new typed reinterpretation head
- followed by ordinary path segments
- with no change to arithmetic expression casting rules, because there are none

This keeps the feature aligned with the grammar-driven parser strategy: one
small new head form feeding the existing path machinery.

---

## Out of scope for v1

- bare `<Type>base` with no field/index tail
- general expression-cast semantics
- nested casts
- `SP` as a cast base
- implicit typed registers
- pointer arithmetic beyond `base +/- imm`
- generic pointer or reference types
- any revival of `addr` as a source-language prerequisite

---

## Recommended next docs steps

If this design direction is accepted:

1. Update GitHub issue `#736 (LANG-02)` so it points to this document as the
   canonical design anchor.
2. Add the accepted grammar form to `docs/spec/zax-grammar.ebnf.md`.
3. Add the accepted semantics to `docs/spec/zax-spec.md`.
4. Add a short example to `docs/reference/ZAX-quick-guide.md`.
5. Only then create parser / lowering implementation tickets.
