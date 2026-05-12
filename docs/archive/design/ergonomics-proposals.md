# ZAX Ergonomics Proposals

**Status:** Draft — revised after designer review of PR #890
**Based on:** Analysis of all language-tour and codegen-corpus examples after the `:=` migration

---

## Core design principle

The language is best when this line stays clear:

- **ZAX** manages named storage, typed paths, and structured control flow
- **Z80 mnemonics** manage arithmetic, flags, and raw machine operations

Expanding `:=` for better transfer ergonomics is coherent with that boundary.
Adding dedicated ZAX built-ins for successor / predecessor on typed paths is coherent with that boundary.
Adding a general expression evaluator inside assignment is not.

---

## What the corpus shows

The dominant noise pattern after the `:=` migration is the **register shuttle**: load a typed value into a register, do one small thing or nothing, write it back to another typed path. The intermediate register contributes nothing to the programmer's intent.

```zax
; 02_fibonacci_args_locals.zax — four shuttles in a row:
move hl, curr_value
move prev_value, hl      ; intent: prev_value := curr_value

move hl, next_value
move curr_value, hl      ; intent: curr_value := next_value
```

```zax
; Incrementing a named counter — three lines for one logical operation:
move hl, count
inc hl
move count, hl
```

The biggest source noise is not a lack of arithmetic syntax. It is forced register shuttling for obvious typed transfers.

---

## Priority order

1. Scalar path-to-path `:=`
2. `step` on typed paths
3. Pascal-style counted `for`

---

## Proposal 1: Path-to-path assignment

### Rule

- `:=` may accept any scalar source expression that can be lowered as a typed value.
- `:=` may accept any scalar destination expression that can be lowered as a typed storage location.
- If both sides are paths, the compiler shuttles through a register internally.
- Evaluation order is fixed: **RHS value is fully evaluated and loaded first, then LHS destination is written.** This is deterministic and normative.
- The hidden transfer register is compiler-owned, not programmer-owned. Therefore path-to-path `:=` must preserve programmer-visible registers around the transfer sequence.

### What becomes valid

Simple scalar copies:

```zax
dst := src
player.x := enemy.x
current.value := next.value
arr[i] := arr[j]
rec_a.inner.count := rec_b.inner.count
```

Typed reinterpretation in the chain:

```zax
<ListNode>dst_ptr.value := <ListNode>src_ptr.value
sprite.flags := <Sprite>hl.flags
```

Nested paths:

```zax
<Outer>dst_ptr.items[idx].count := <Outer>src_ptr.items[j].count
```

These all remain fundamentally transfers between two scalar places.

### Compatibility boundary

Path-to-path `:=` is a **scalar transfer** feature, not a general object-copy or implicit-address feature.

Accepted in this slice:

```zax
arr2[0] := arr1[1]               ; scalar byte -> scalar byte
dst_word := src_word             ; scalar word -> scalar word
ptr_slot := @arr1[1]             ; explicit address acquisition into compatible scalar
```

Rejected in this slice:

```zax
arr2[0] := arr1                  ; invalid: composite object on RHS
dst_rec := src_rec               ; invalid: composite copy is out of scope
ptr_slot := arr1                 ; invalid: no implicit object-to-address decay
```

So the rule is:

- valid: scalar destination `:=` scalar value source
- invalid: scalar destination `:=` composite path
- invalid: implicit array/record/union-to-address decay
- valid only with explicit `@`: address acquisition into a compatible scalar destination

This keeps the language explicit and avoids C-style array decay.

### Aliasing and self-copy

`x := x` is valid. Because evaluation order is fixed (load RHS into register, then store to LHS), the scalar value is captured before the write. Self-copy is therefore a no-op in effect. Overlapping typed locations behave as "load scalar RHS value, then store scalar LHS value" — no special aliasing rules are needed beyond the fixed evaluation order.

### Hidden transfer registers and conflict table

The pipeline must choose an intermediate register that does not conflict with the index registers required by either path. The transfer register is hidden compiler state and therefore must be preserved before use and restored afterward. The cheapest hidden transfer register is not the same for byte and word values.

**Byte copies default to `A`.**
For plain assignment this is acceptable because `AF` can be preserved around the transfer sequence. The compiler should prefer the shortest direct load/store shape first and only promote away from `A` when the path itself needs `A` for indexing.

**Byte copies:**

| Destination index | Source index | Safe intermediate | Rationale |
|-------------------|-------------|-------------------|-----------|
| not A             | any         | A                 | A is free for the value |
| A                 | not A       | B                 | Dest needs A for addressing; load source into B |
| A                 | A           | B                 | Both paths use A; hold value in B throughout |

If B is also occupied as an index in one of the paths, promote to C (then D, E, in order). In practice, a single path cannot use more than one index register simultaneously, so one promotion level is sufficient.

**Word copies default to `DE`, not `HL`.**
This is an important codegen choice. In the current lowering, `HL` is primarily the effective-address register. Loading or storing a word frame variable through `HL` is more expensive than using `DE`, because `LOAD_RP_FVAR('HL', ...)` and `STORE_RP_FVAR('HL', ...)` have to shuttle through `DE` with `ex de, hl`. `BC` is a valid fallback. `HL` should be treated as the EA-building register first and only as a hidden value register in narrow direct-access fast paths.

**Word copies:**

| Destination index register | Safe intermediate | Rationale |
|---------------------------|-------------------|-----------|
| DE free                   | DE                | Natural hidden value pair; avoids HL shuttle cost |
| DE conflicts              | BC                | Valid whole-pair fallback |
| direct scalar fast path only | HL             | Use only when demonstrably cheaper than DE/BC |

The conflict that must be avoided for word copies: `LOAD_RP_FVAR` targeting `HL` uses `ex de, hl / ld e, (ix+d) / ld d, (ix+d+1) / ex de, hl`, which necessarily clobbers `L`. If the destination path indexes via `L`, the index is destroyed before the store can execute. This is why `DE` is the natural hidden transfer pair and `HL` is not.

### Codegen shape

For direct scalar locations, the feature should compile to the shortest direct load/store sequence plus preservation of the hidden transfer register. Example:

```zax
arr2[0] := arr1[1]
```

ideal lowering:

```z80
push af
ld a, (arr1 + 1)
ld (arr2), a
pop af
```

For EA-shaped transfers, the compiler may still need the existing staged EA pipelines, but the same principle holds: preserve the hidden transfer register, build each side through the current step system, and avoid unnecessary re-materialization when a direct scalar accessor exists.

### Implementation staging

Implementation should be split into two slices:

1. **Acceptance slice**
   - allow scalar `Ea := Ea`
   - reject composite RHS paths
   - reject implicit object-to-address decay
   - keep arithmetic RHS out of scope

2. **Lowering slice**
   - implement hidden-register-preserving scalar transfer
   - prefer direct scalar accessors first
   - fall back to staged EA pipelines second
   - add regression coverage for source/destination index conflicts, self-copy, and explicit `@` forms

### What stays out of scope

```zax
; Not valid — arithmetic on RHS:
x := a + b
arr[i] := x + 1
```

These require hidden temporary selection, sequencing rules, and possible spill behaviour. That is a different language tier.

---

## Proposal 2: `step` on typed paths

### Rule

`step path` and `step path, -1` are valid wherever `path` resolves to a scalar byte or word storage location.

These are **ZAX built-ins**, not overloads of the raw Z80 `inc` / `dec` mnemonics.

They lower as a read-modify-write sequence over typed storage:
- load value into a hidden register
- apply the signed delta
- store back to the same place
- leave a meaningful final `Z` flag based on the resulting value

The built-in preserves programmer-visible registers. It does **not** promise full flag parity with Z80 `inc` / `dec`; it promises a meaningful final `Z` only.

### Examples

```zax
step count
step used_slots, -1
step entries[B].version
```

### Lowering

| Type  | Hidden value register | Notes |
|-------|------------------------|-------|
| byte  | `E`                    | Avoids `AF` save/restore problem; `inc e` / `dec e` sets flags directly |
| word  | `DE`                   | Natural hidden word pair; `A` is used only for final zero test |

For byte paths, the preferred pattern is:

```z80
push de
ld e, <value>
inc e        ; or dec e
ld <place>, e
pop de
```

For word paths, the preferred pattern is:

1. preserve `BC`
2. save old `A` in `B` or `C`
3. preserve `DE`
4. load word value into `DE`
5. `inc de` / `dec de`
6. store `DE` back
7. set final `Z` with `ld a, e / or d`
8. restore `A` from the saved byte register with `ld a, b` or `ld a, c` (this does not change flags)
9. restore `DE`
10. restore `BC`

This avoids `push af` / `pop af`, which would incorrectly restore old flags.

### Flag behaviour

The final `Z` flag is meaningful: `step` leaves `Z` set iff the resulting value is zero.

This makes the built-ins composable with existing flag-driven control flow without pretending to reproduce the full Z80 flag model for all scalar sizes.

```zax
step count
if Z
  ; count wrapped to zero
end
```

### Single-EA read-modify-write

For EA-shaped paths, the effective address should be calculated once and kept live across the whole read-modify-write sequence. The compiler should not recalculate the same effective address for the store.

So for something like:

```zax
step arr[L]
```

the lowering model is:

1. compute EA into `HL`
2. load value from `(HL)` into the hidden value register
3. update the hidden value register
4. store back through the same `HL`
5. establish final `Z`

This is a distinct lowering shape from path-to-path `:=`, which usually has separate source and destination plans.

---

## Proposal 3: Counted `for` loop

### Design

Pascal-style counted iteration:

```zax
for idx := 0 to last_index
  ; body
end
for row := height downto 1
  ; body
end
```

### Normative rules

- **Loop variable class:** the loop variable is a named scalar lvalue of type `byte` or `word`.
  Allowed: local variables, parameters, and globals.
  Not included: registers, partial registers (`IXH` / `IXL` / `IYH` / `IYL`), indirect operands, or composite paths.
- **Bounds are evaluated once on entry.** Neither the start nor the end expression is re-evaluated on each iteration. Both `start` and `end` may be variables or other scalar expressions of compatible width.
- **Inclusive bounds:** `for idx := start to end` iterates over `start, start+1, ..., end`. `for idx := start downto end` iterates over `start, start-1, ..., end`.
- **Step is fixed:** `to` increments by 1; `downto` decrements by 1.
- **Zero-trip safe.** If the initial value already lies beyond the bound (`start > end` for `to`, `start < end` for `downto`), the body is skipped entirely.
- **Direction is explicit.** `to` and `downto` are part of the syntax. Direction is not inferred from runtime bound values.
- **Captured bounds do not drift.** If variables used in `start` or `end` are modified inside the loop body, the running loop is unaffected because the bound and initial value were already captured on entry.
- **Loop-variable mutation inside the body is not part of the model.** The loop variable is controlled by the loop construct itself. Direct assignment to it inside the body should be rejected when practical; otherwise it is unsupported.

### Lowering

The canonical lowering uses one shared compare block so the entry test and back-edge test are not duplicated:

```
idx := start
limit := end
jp @compare
@L:
  <body>
  step idx
@compare:
  if idx <= limit: goto @L     ; `to`
  if idx >= limit: goto @L     ; `downto`
```

This is conceptually closer to a counted `while` than to `repeat ... until`: initialization happens before the loop, control jumps into a shared compare block, and the body executes zero times when the initial value is already outside the inclusive range.

`DJNZ` remains an internal optimisation opportunity only in narrow cases. It is not part of the surface design and it does not define the loop semantics.

**Not in scope:** C-style `for(init; cond; step)`. That is too broad and drags in statement expressions, loop-local side effects, and a miniature control language. It is not minimal.

### Status

Design is settled but deferred. It is not part of the current implementation priority.

---

## Non-proposal: general RHS arithmetic

Not planned.

```zax
; Not valid — different language tier:
next_value := prev_value + curr_value
dst := (a + b) ^ ((c << 1) - d)
```

Allowing arithmetic on the RHS requires hidden temporary selection, sequencing rules, possible spill behaviour, and substantially broader diagnostics. That changes ZAX from a structured assembler into an expression compiler. The boundary stays: **path-to-path copies (no computation) are ZAX-layer; arithmetic between loads and stores remains Z80-layer.**

---

## Summary

| Proposal                         | Verdict              |
|----------------------------------|----------------------|
| Scalar path-to-path `:=`         | Yes — implement next |
| `step` on typed paths            | Yes — implement      |
| Pascal-style counted `for`       | Deferred — design settled, not active work |
| General RHS arithmetic           | No, for now          |
| C-style `for`                    | No                   |
