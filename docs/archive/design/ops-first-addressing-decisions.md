# Ops-First Addressing Decisions

**Date:** 2026-03-07
**Status:** Draft decision record for review
**Purpose:** Narrow the exploratory direction in
`docs/archive/design/ops-first-addressing-direction.md` into concrete language
decisions and explicit non-goals.

This document is not an implementation plan. It exists to decide the language boundary before any implementation backlog is created.

---

## 1. Problem Statement

ZAX currently has a good semantic EA model, but too much tactical code-generation policy is owned by the compiler.

The compiler is currently responsible for both:

1. computing effective addresses from typed EA expressions
2. deciding how loads/stores should preserve registers and materialize those addresses

The first responsibility belongs in the compiler.
The second is where complexity, hidden behavior, and lowering bugs accumulate.

The purpose of this decision record is to make that split explicit.

---

## 2. Decisions

### D1. Introduce `addr` as a first-class language keyword

ZAX should introduce `addr` with this initial surface:

```zax
addr hl, ea_expr
```

Meaning:

> Compute the effective address of `ea_expr` into `HL`.

`addr` is **HL-only in v1**.

Rationale:

- this keeps the feature semantic, not tactical
- it avoids reintroducing register-allocation/preservation policy into the feature itself
- it provides a clean boundary primitive for typed addressing
- it is visibly a ZAX language construct rather than a mnemonic that looks like a machine opcode

Explicitly not included in v1:

- `addr de, ...`
- `addr bc, ...`
- arbitrary destination pairs

---

### D2. `addr` becomes the primary model; direct typed EA in `ld` is transitional only

Forms such as:

```zax
ld a, arr[C]
ld arr[C], a
ld de, table[idx]
```

may remain temporarily for compatibility, but they should no longer be treated as independent compiler-owned special cases, and they should not be the intended long-term surface.

The preferred model is:

1. `addr hl, ...`
2. explicit memory access via raw instructions or ops

If transitional typed EA forms remain during migration, they must be defined in terms of the `addr` model rather than retaining bespoke hidden lowering.

Rationale:

- makes the explicit model (`addr + instructions` or `addr + ops`) the real language center
- keeps ZAX constructs visibly ZAX-like instead of hiding them inside Z80-looking opcodes
- leaves room to remove typed EA magic from `ld` entirely once `addr` has proven itself

This is a language-design decision, not merely an implementation preference.

---

### D3. Typed pointer reinterpretation uses angle-bracket cast syntax

ZAX should support explicit typed reinterpretation at the access site using:

```zax
<Type>base.tail
```

Examples:

```zax
addr hl, <Sprite>hl.flags
ld a, <Sprite>hl.flags
addr hl, <Outer>hl.inner.flags
```

Meaning:

> Interpret `base` as the address of a `Type`, then apply the normal EA tail (`.field`, `[index]`, nested tails).

Rationale:

- explicit and local
- avoids overloading `()` further, which are already heavily used in Z80 syntax and grouping
- avoids grammar-clever overlay forms like `Sprite[HL]`
- does not imply typed registers; typing is applied only at point of access

Boundary for v1:

- cast applies to a base address expression
- the result participates in normal EA tail parsing
- no persistent “typed register” state is introduced

This needs a precise grammar production before implementation.

---

### D4. Op contracts are deferred until there is a real effect-analysis mechanism

Ops are still the right place for reusable access policy, but ZAX does not currently have any trustworthy mechanism for proving register/flag side effects.

That means v1 should **not** commit to verified op return/clobber contracts.

For now:

- ops remain explicit source-level abstractions
- the language does not promise compiler-verified register contracts for them
- any future clobber/result metadata must wait until there is a real effect-analysis framework

Rationale:

- avoids signing up to a feature that has no implementation basis today
- keeps the language direction honest
- leaves room for a later, narrower design once effect analysis actually exists

---

### D5. Compiler-owned preservation machinery lands first; `@dead` comes later

ZAX should give `addr` a fixed, compiler-guaranteed public contract:

> `addr hl, ea_expr` places the effective address in `HL` and preserves everything else.

That requires compiler-owned preservation machinery from the first implementation slice.

Required internal model:

- each compiler-owned lowering slab such as `addr` lowering or transitional sugary EA access must explicitly know which registers it uses transiently
- the compiler emits preservation wrappers from that internal metadata
- preservation scaffolding remains distinct from semantic body operations

Future direction:

- a later `@dead` surface may trim only compiler-owned preservation regions
- it must not rewrite arbitrary stack juggling inside the body

Rationale:

- keeps the programmer-facing contract simple and ZAX-like
- avoids exposing internal lowering details to the programmer
- builds the right machinery first, before adding optimization controls on top

---

### D6. `select case` gains ranges and grouped values

ZAX should support:

```zax
select A
  case 'A'..'Z', '_'
    ...
  case '0'..'9'
    ...
end
```

Allowed forms:

- single value
- inclusive range `a..b`
- comma-separated lists mixing both

Minimal intended grammar shape:

- `case_item = imm_expr | imm_expr ".." imm_expr`
- `case_clause = "case" case_item ("," case_item)*`

Rationale:

- common for ASCII classification and protocol dispatch
- small grammar cost
- high ergonomic payoff

---

### D7. Packed layout is the semantic default; pow2 stride is a codegen choice

ZAX should treat packed composite layout as the language semantic model.

That means:

- top-level records and arrays are not required to have pow2 total size
- record field offsets are based on packed size
- array element stride may use any constant-size codegen strategy needed to address packed elements correctly
- pow2 stride remains an optimization path, not a universal storage invariant

Rationale:

- keeps storage semantics honest and space-efficient
- avoids forcing padding into objects that are never indexed with shift-only fast paths
- matches the broader direction that tactical codegen policy should not become a language law

---

## 3. Non-Goals

The following are explicitly **not** part of this direction:

### N1. No parser-generator rewrite

The hand-written parser remains the intended parser architecture.

### N2. No typed registers

Registers remain raw machine registers.
Typing is applied only at point of access or interpretation.

### N3. No generic pointer types in this direction

This direction does not introduce `ptr<T>`.
Typed reinterpretation is done with cast syntax instead.

### N4. No automatic compiler save/restore for hypothetical op contracts

If op contract metadata exists in the future, the compiler still should not silently satisfy it by inserting save/restore code.

### N5. No promise that direct typed EA in `ld` remains part of the long-term surface

Existing forms like `ld a, arr[C]` may remain during transition.
But this direction does not commit to keeping them once `addr` is established.

### N6. No mandatory liveness analysis

Any future dead-register optimization remains advisory.
The compiler is not required to prove or infer full liveness in order to use this model.

### N7. No `@dead` surface in the first slice

The first slice must land compiler-owned preservation machinery for `addr`.
The pragma surface itself can come later once that machinery is stable.

---

## 4. Follow-up Spec Questions

Resolved by `docs/archive/design/addr-prereq-decisions.md`:

1. Transitional status of typed EA inside `ld`
2. Semantic mapping of transitional direct EA forms onto `addr`
3. Op contracts deferred for v1
4. `addr` preservation contract and compiler-owned preservation machinery

Still open:

1. What is the exact grammar production for `<Type>base.tail`?
2. What counts as a valid `base` for casted EA interpretation in v1?
3. Should `@dead` remain deferred until after `addr` stabilizes, or follow immediately after?
4. How do range/grouped `case` values lower in the presence of overlapping clauses?

---

## 5. Recommended First Implementation Boundary

If this direction is accepted, the safest first implementation boundary is:

1. add `addr hl, ea`
2. give `addr` a compiler-guaranteed preservation contract using compiler-owned preservation machinery
3. route existing `ld`-embedded typed EA forms through `addr` as transitional compatibility only
4. leave existing op semantics unchanged
5. add cast syntax only once the `addr` boundary is stable
6. decide whether to retire direct typed EA from `ld`
7. add any `@dead` pragma surface only after generated `addr` code is stable
8. revisit op metadata only after there is a real effect-analysis mechanism

This keeps the first implementation step focused and prevents the whole idea from becoming an entangled “big bang” redesign.

---

## 6. Bottom Line

This direction keeps ZAX aligned with its strongest qualities:

- explicit
- structured
- machine-close
- programmable through hygienic ops

The key decision is not “more abstraction” versus “less abstraction”.

The real decision is:

> semantic address computation belongs in the compiler; tactical memory-access policy should increasingly belong to explicit ZAX constructs and ops.

That is the boundary this design record adopts.
