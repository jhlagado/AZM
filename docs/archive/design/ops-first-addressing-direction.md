# Ops-First Addressing Direction

**Date:** 2026-03-07
**Status:** Design note for review
**Scope:** Language direction only; not an implementation plan

This note explores a possible next direction for ZAX: keep the compiler responsible for type-aware effective-address calculation, but move more of the memory-access policy and register-preservation policy out of the compiler and into explicit ZAX constructs and programmable `op`s.

The goal is not to weaken ZAX. The goal is to make the language more explicit, reduce hidden lowering magic, and let experienced Z80 programmers take direct control of important tradeoffs without falling back to unsafe textual macros.

---

## 1. Current design strength

ZAX is strongest where it is:

- close to the machine
- structured rather than textual
- explicit about registers and calling convention
- deterministic in expansion and lowering

Three parts of the language are particularly strong:

### 1.1 Ops

`op` is one of the best parts of ZAX.

It provides most of the power people reach for macros to get, but without the usual macro failures:

- no accidental token-pasting
- no accidental capture of labels
- no unhygienic local names
- no ad-hoc text substitution surprises
- overload selection can be type- and shape-aware

This means ZAX already has a principled extension mechanism for creating "enhanced opcodes".

### 1.2 Structured control flow

The `if/while/repeat/select` layer improves readability without hiding the CPU model. Flag-setting still comes from real instructions; ZAX only removes boilerplate branch scaffolding.

### 1.3 Typed addressing

The current typed EA model gives the compiler enough information to compute:

- `sizeof(T)`
- `offsetof(T, field)`
- array stride
- frame-slot displacement
- constant field/index folding

This is real value. It is exactly the kind of machine-adjacent convenience that belongs in ZAX.

---

## 2. The pressure point: too much hidden addressing magic

The current addressing grammar is expressive and elegant:

- `arr[C]`
- `arr[idxw]`
- `sprite.flags`
- `sprites[C].flags`
- indexed loads and stores directly inside `ld`

This looks good at source level, but it pushes a large amount of implicit work into the lowering layer.

That hidden work currently includes:

- effective-address construction
- type-driven stride computation
- field offset folding
- register shuffling
- save/restore policy
- special handling for byte vs word loads
- special handling for global vs frame vs indirect bases

The result is that the compiler is not only answering the semantic question:

> "What is the address of this thing?"

It is also answering the tactical codegen question:

> "How should this address be materialized while preserving as many registers as possible?"

That second question is where complexity and bugs accumulate.

---

## 3. Proposed split of responsibility

The key design move is this:

### Keep in the compiler

The compiler should continue to own:

- type-driven layout
- `sizeof` / `offsetof`
- array-stride math
- frame-slot math
- effective-address computation
- constant offset/index folding
- typed interpretation of memory shapes

### Move toward ops / explicit user control

The compiler should stop trying to invisibly own:

- every load/store pattern variant
- every save/restore policy
- every register-preservation compromise
- every "best effort" memory access template

Those should increasingly live in:

- explicit source code
- standard-library ops
- user-authored ops with clear behavior

This is the core of the ops-first direction.

---

## 4. `addr` as the boundary primitive

The cleanest way to separate these concerns is to introduce a first-class `addr` keyword.

### 4.1 Meaning

`addr` means:

> Compute the effective address of an EA expression and place it in a register.

For example:

```zax
addr hl, arr[C]
addr hl, sprites[idx].flags
addr hl, local_buf
```

The compiler still does all the smart work:

- resolve the base
- compute stride
- fold field offsets
- honor frame layout
- dereference indirect parameter bases correctly

But it stops short of deciding the final memory access policy.

### 4.2 Why this helps

Today, `ld a, arr[C]` asks the compiler to do two jobs:

1. compute the address
2. choose a load strategy and register-preservation strategy

With `addr`, these become separate:

```zax
addr hl, arr[C]
ld a, (hl)
```

This is only one extra line, but it changes the ownership boundary completely.

The compiler handles the semantic part.
The programmer handles the tactical part.

That is a better fit for Z80 programming.

---

## 5. Ops as the place for memory-access policy

Once `addr` exists, `op`s become the natural way to define reusable load/store patterns.

### 5.1 Standard-library ops instead of hardcoded lowering templates

Instead of the compiler containing a large matrix of implicit memory templates, ZAX can provide standard ops such as:

```zax
op ldb(dst: A, src: ea): AF
  push de
  push hl
  addr hl, src
  ld a, (hl)
  pop hl
  pop de
end

op ldw(dst: HL, src: ea): HL
  push de
  addr hl, src
  ld e, (hl)
  inc hl
  ld d, (hl)
  ex de, hl
  pop de
end
```

Then the language has two tiers:

- ergonomic/high-level path via standard ops
- explicit/manual path via `addr` + raw instructions

That is a much better distribution of complexity than burying everything in compiler-only lowering templates.

`addr` is intentionally a ZAX keyword, not a mnemonic pretending to be a machine opcode.

### 5.2 Why ops are the right abstraction

Ops are already:

- hygienic
- typed at the operand-shape level
- deterministic
- structurally analyzable
- visible to the programmer

They are therefore a much safer place than macros to hold these richer access patterns.

---

## 6. What should happen to magic `ld a, arr[C]` syntax?

This is the central design choice.

### Option A - keep it as core language magic

Pros:

- very compact
- reads beautifully
- familiar to users coming from higher-level languages

Cons:

- keeps hidden lowering complexity in the compiler
- keeps save/restore policy implicit
- makes register effects harder to reason about
- encourages the compiler to keep accumulating special cases

### Option B - de-emphasize it in favor of `addr + ops`

Pros:

- compiler becomes simpler and more trustworthy
- access patterns become visible
- power users can optimize directly
- ops can still recover ergonomic sugar when wanted

Cons:

- source gets slightly longer
- casual code becomes less pretty

### Option C - keep it as sugar only

This is the strongest option.

Keep `ld a, arr[C]` only as a transitional compatibility form while the explicit model is introduced.

That means:

- the intended model becomes `addr` plus explicit access
- any remaining typed EA inside `ld` must be defined in terms of that explicit model
- ZAX can later remove typed EA magic from `ld` entirely if `addr` proves to be the better surface

This is the cleanest end-state.

---

## 7. Cast syntax for typed pointer interpretation

This is the other area where the language needs a clean, non-magical surface.

Problem:

- registers are intentionally untyped
- but sometimes the programmer has a pointer in a register and wants typed field access through it

Example need:

```zax
; HL points to a Sprite
; want Sprite.flags
```

### 7.1 Rejected shape: `Sprite[HL]`

This reads cleverly, but it is too grammar-clever.

It overloads the indexing surface with a cast/overlay meaning, which is the wrong direction if the goal is to simplify the grammar and reduce magic.

### 7.2 Preferred shape: explicit cast syntax using `< >`

Because `()` are already heavily used for:

- Z80 indirect forms
- grouping
- expression syntax

using them for typed pointer reinterpretation is likely to become visually muddy.

That leaves the free bracket pairs:

- `< >`
- `{ }`

`{ }` are likely better reserved for aggregate/initializer work.

So the best candidate is angle-bracket cast syntax:

```zax
addr hl, <Sprite>hl.flags
ld a, <Sprite>hl.flags
addr hl, <Outer>hl.inner.flags
```

This should mean:

> Interpret the address in `hl` as pointing to `Sprite`, then compute the field path from that typed base.

This is explicit, compact, and local.

It does not imply typed registers. It applies type only at the access site.

That is the right semantic model.

### 7.3 Why not pragmas for casts

A cast pragma like:

```zax
@cast Sprite
addr hl, hl.flags
```

is the wrong tool.

Pragmas are good for optimization metadata, not semantic reinterpretation of expressions.

A cast needs to be:

- expression-local
- explicit in place
- visible at the exact access site

So cast should be syntax, not pragma.

---

## 8. Op contracts are a possible future direction, not a current commitment

Ops currently have power, but there is no real mechanism in ZAX today for proving register/flag side effects instruction-by-instruction.

That means this direction should **not** commit to verified op contracts in the first pass.

### 8.1 What is still true

Ops remain the right place for reusable access policy because they are:

- hygienic
- typed at the operand-shape level
- explicit in source
- deterministic in expansion

That is enough to justify the ops-first direction without pretending there is already a contract-verification engine.

### 8.2 What should be deferred

Any feature like:

```zax
op add16(dst: DE, src: reg16): DE
  ...
end
```

should be treated as a later possibility, not part of the current decision set.

Before a real op-contract feature exists, ZAX would need:

- a real model of per-instruction register/flag effects
- a clear verifier scope
- a decision on what happens when verification is impossible

Until then, op contracts should be discussed as a future option, not a present language commitment.

### 8.3 Important constraint if this ever returns

Even if op metadata is added later, the compiler still should not silently wrap ops to satisfy it.

The op author must own preservation behavior.
The compiler should either prove the contract or refuse it.

---

## 9. Dead-register pragmas are a good fit later

This is exactly the kind of thing pragmas *should* do.

### 9.1 Why

Dead-register information is:

- optimization metadata
- scoped
- non-semantic
- naturally advisory

That makes it a good pragma candidate.

### 9.2 Proposed later scope

Support:

- function-level
- block-level

Examples:

```zax
func render(): HL
  @dead DE
  ; body
end
```

```zax
repeat
  @dead DE
  addr hl, arr[C]
  ld a, (hl)
until Z
```

This is enough to be useful without becoming a full liveness language.
But it should land only after `addr` and its preservation machinery are stable in real code.

### 9.3 What `@dead` must and must not touch

A raw pragma cannot safely mean “delete any `push de` / `pop de` you happen to see”.

That would be wrong because some stack traffic is:

- preservation scaffolding
- temporary value transport
- register shuffling
- algorithmic staging

Only the first category is eligible for dead-register suppression.

So the compiler needs an internal distinction:

- **preservation region**: compiler-owned save/restore wrapper around a slab of lowering
- **body operations**: the actual instructions inside that slab

`@dead` may trim preservation regions.
It must not rewrite arbitrary stack juggling inside the body.

### 9.4 The right internal model

The useful model is the complement of a clobber/result set.

For a compiler-owned slab, the compiler should know:

- which register pairs it intends to clobber or return
- therefore which register pairs it must preserve if it wants to present a preserving interface

Example shape:

- clobber/result set: `HL, AF`
- derived preserve set: `BC, DE`

If a future scope contains:

```zax
@dead DE
```

then the compiler trims only the derived preserve set and emits preservation for `BC` but not `DE`.

This means any future dead-register optimization should operate on compiler-owned preservation metadata, not on raw emitted opcodes.

### 9.5 Why this pairs well with ops-first addressing

This fits the broader direction cleanly:

- compiler-owned `addr` / transitional sugar lowering can use the same internal clobber/preserve model
- future standard-library ops can conceptually follow the same shape
- semantic stack shuffling inside a body remains explicit and untouched

So once `addr` is stable, dead-register metadata can reduce preservation cost without becoming unsafe.

---

## 10. `select` should grow ranges and grouped cases

This is a clear improvement.

The right surface is:

```zax
select A
  case 'A'..'Z', '_'
    ; identifier start
  case '0'..'9'
    ; digit
  case ' ', '\t'
    ; whitespace
  else
    ; other
end
```

This adds:

- range cases
- comma-separated alternatives within one case arm

### 10.1 Why this is worth doing

This matches real Z80 work:

- ASCII classification
- nibble/range dispatch
- protocol/state decoding
- grouped control paths

### 10.2 Minimal grammar growth

The grammar addition is small:

- `case_item = imm_expr | imm_expr ".." imm_expr`
- `case_clause = "case" case_item ("," case_item)*`

That is compact, readable, and worth the complexity.

---

## 11. Other rough edges

### 11.1 Non-pow2 stride should be a codegen choice, not a storage law

If the compiler can synthesize shift/add sequences for arbitrary constant stride, then packed records and arrays should be normal.

Pow2 stride should become:

- an optimization mode
- or an implementation detail of specific fast paths

not a universal storage policy. Packed layout should be the semantic default.

### 11.2 `ptr` remains too raw

A future typed-pointer interpretation surface, via cast syntax, would close much of the usability gap without introducing generic pointer types.

### 11.3 Bit naming is enough for now

Named constants are sufficient for bit positions.
No dedicated bitfield type is needed yet.

---

## 12. Recommended direction

The best direction is:

### Keep in the compiler

- type-aware effective address calculation
- layout
- `sizeof` / `offsetof`
- frame-slot math
- cast-driven typed reinterpretation at the access site

### Move out of compiler magic

- memory-access save/restore policy
- register-preservation templates
- special-case access idioms

### Provide these language features

1. **`addr`** as a first-class keyword
2. **angle-bracket cast syntax** for typed pointer interpretation
   - e.g. `<Sprite>hl.flags`
3. **scoped dead-register pragmas** for optimization metadata
4. **richer `select` cases** with ranges and comma-separated groups
5. **later, if analysis exists:** optional op metadata

### Treat current `ld`-embedded typed EA as transitional

Transition may temporarily keep:

```zax
ld a, arr[C]
```

But stop treating that style as the deepest or most serious programming model.
If `addr` lands well, ZAX should be free to remove that typed EA sugar from `ld`.

The serious model should be:

- `addr`
- well-written ops
- explicit register policy

That is more Z80-like, more transparent, and easier to keep correct.

---

## 13. Bottom line

ZAX is already a strong language.

Its best ideas are:

- structured assembly
- hygienic `op`s
- explicit calling convention
- machine-near abstractions rather than fake high-level language semantics

The rough edge is that addressing has become too magical for its own good.

The way out is not to remove power.
It is to relocate power:

- keep semantic address computation in the compiler
- give tactical control back to the programmer through ops
- make typing-at-point-of-access explicit
- keep optimization hints as pragmas, not semantics

That would make ZAX leaner, more explicit, and more maintainable without giving up what makes it distinctive.
