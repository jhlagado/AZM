# ZAX Array Indexing and Address Lowering — Design Document

Status: design exploration for the lowering appendix. Updated with v0.2 calling/ea semantics and guidance on keeping array addressing simple and fast.
Date: 2026-02-21.

This document works through the concrete lowering strategies for effective-address computation in ZAX, given the decision to use IX as a permanent frame pointer. It covers every combination of base and offset provenance (register, local/arg variable, global symbol), for both 8-bit and 16-bit offsets, with approximate T-state costs and practical guidance for the compiler and the programmer.

The focus is array indexing (`arr[i]`) and field access on records, but the same machinery applies to any `ea + offset` computation used internally by lowering. Examples use the current `:=`-based value-semantics model: `arr[i]` / `rec.field` are source-level storage accesses, while lowered Z80 examples may still show `(addr)` forms to make the emitted code explicit.

---

## 1. The IX Decision and Its Consequences

ZAX uses IX as a dedicated frame pointer for function locals and arguments. Every local and every argument is addressable as `(IX+d)` where `d` is a signed 8-bit displacement. This is a deliberate trade-off: IX-relative instructions are roughly twice as slow as their HL-indirect equivalents, but the frame pointer eliminates register churn, preserves HL/DE/BC for programmer use, and makes the lowering model predictable.

The cost numbers that matter (T-states on a standard Z80):

Loading a byte from a local: `ld r, (IX+d)` is 19 T-states. Compare `ld r, (HL)` at 7 T-states, or `ld a, (nn)` at 13 T-states for an absolute address. The IX form is expensive in isolation.

Loading a 16-bit value from a local requires two IX-relative byte loads plus register assembly. Loading the low byte of a word local into L and the high byte into H costs 38 T-states just for the loads, plus whatever it takes to get them into the right register pair. Compare `ld HL, (nn)` at 16 T-states for an absolute address.

The reason this trade-off is acceptable is that the alternative — using HL as a frame pointer, or computing SP-relative addresses on the fly — imposes a different cost that's harder to see in cycle counts: register pressure. On a machine with seven general-purpose 8-bit registers and three usable 16-bit pairs, tying up HL for frame access means every array operation, every pointer chase, and every 16-bit arithmetic operation has to work around the frame pointer. The result is a cascade of push/pop pairs, exchange instructions, and temporary spills that inflate code size and destroy readability. IX sits outside the main register file's traffic patterns. It costs more per access but it costs nothing in terms of register availability.

Lowering convention (v0.2):

- IX is always the frame pointer; never treat it as a scratch register.
- Prefer **base in DE, offset in HL**. This makes scaling by powers of two cheap (`add hl, hl` chains) while keeping the base stable for the final `add hl, de`.
- BC is the third working pair; use it sparingly so loops can keep counters live.
- IY is not used by the compiler; it remains available to the programmer.

---

## 2. The Lowering Problem

When the programmer writes `a := arr[i]` or `hl := sprites[C].x`, the compiler must produce an instruction sequence that computes the effective address and performs the memory access. The effective address is always `base + offset`, where:

The **base** is the starting address of the storage (an array, a record, a variable). It might be a compile-time constant (a global symbol), a value in a register, or a value stored in a local/arg slot.

The **offset** is the byte distance from the base to the desired element or field. For field access, offsets are always compile-time constants. For array indexing, the offset is `index * element_size`, where the index might be a constant, a register, or a variable.

The challenge is that Z80 has no general base+index addressing mode. The only indirect forms are `(HL)`, `(BC)`, `(DE)` (byte loads only for BC/DE), `(IX+d)` with constant displacement, and absolute `(nn)`. Everything else must be synthesized from register loads and additions. Therefore we intentionally keep allowed runtime complexity modest: prefer constant offsets and register bases; reject or warn on oversized `(IX+d)` needs; and encourage users to hoist address computation out of loops.

---

## 3. Offset Classification

Before enumerating lowering cases, it helps to classify offsets by what's known at compile time.

**Constant offset.** Both the index and the element size are compile-time constants. The offset is a single immediate value. This is the easy case: the compiler folds the multiplication and adds the constant to the base address. Field access is always a constant offset. Array indexing with a literal index (like `arr[3]`) is a constant offset.

**Scaled register offset.** The index is in an 8-bit or 16-bit register and the element size is known at compile time. The offset is `register * element_size`. If the element size is 1, no scaling is needed. If it's a power of two, scaling is shifts or self-additions. Otherwise, the compiler needs a multiply sequence.

**Scaled variable offset.** The index is in a local/arg slot. The compiler must first load it into a register, then scale it. This is strictly worse than the register case because of the IX load overhead.

For the rest of this document, "offset" means the final byte offset after any scaling. The scaling question (how to multiply an index by element size) is addressed separately in Section 8.

---

## 4. The Lowering Matrix

Every effective-address computation falls into one of these cases based on where the base and the offset live. The compiler's job is to get the final address into HL (since `(HL)` is the cheapest and most flexible indirect form) and then perform the access.

### 4.1 Constant Base + Constant Offset

This is the trivial case. The entire address is known at compile time. The compiler folds `base + offset` into a single absolute address and emits an absolute load or store.

```
; arr[3] where arr is a global, element size is 1
; base = arr, offset = 3, address = arr + 3
ld a, (arr + 3)         ; 13 T-states
```

For 16-bit access:

```
hl := arr[3]         ; source-level form; lowering can fold this to an absolute access
```

No address computation at runtime. This is the fastest path and should be the compiler's first check: if both base and offset are constant, fold and emit an absolute access.

### 4.2 Constant Base + Register Offset (the common array case, recommended)

The base is a global symbol (compile-time address), and the index is in a register. This is the bread-and-butter case for array iteration: `arr[C]` where `arr` is module-scope storage and `C` is a loop counter.

**8-bit register offset, element size 1:**

The offset is in a single 8-bit register and needs zero-extension to 16 bits before it can be added to the base.

```
; arr[C] where arr is global, byte elements
ld de, arr              ; 10 T-states — base in DE
ld h, 0                 ;  7 T-states — zero high byte
ld l, c                 ;  4 T-states — offset into HL
add hl, de              ; 11 T-states — HL = arr + C
ld a, (hl)              ;  7 T-states — load the byte
                        ; total: 39 T-states
```

If the offset register is already the low byte of DE (i.e., it's E), the `ld e, c` becomes unnecessary and you save 4 T-states. The compiler can look for this case.

**16-bit register offset, element size 1:**

If the index is already in a 16-bit register pair (say DE), no widening is needed:

```
; arr[DE] — 16-bit index
ld de, arr              ; 10 T-states
; HL already holds offset
add hl, de              ; 11 T-states
ld a, (hl)              ;  7 T-states
                        ; total: 28 T-states
```

This is fast. For loops that index with a 16-bit counter, the programmer should prefer keeping the counter in DE or BC.

**With element scaling (element size > 1):**

Scale in HL, keep base in DE:

```
; wordArr[C] — byte index, word elements
ld h, 0                 ;  7
ld l, c                 ;  4
add hl, hl              ; 11 — HL = index * 2
ld de, wordArr          ; 10 — base in DE
add hl, de              ; 11
                        ; total before access: 43 T-states
```

Guidance: use the same pattern for larger power-of-two element sizes (repeat `add hl, hl` as needed). Avoid shuttling the base through HL; keep it parked in DE.

### 4.3 Local/Arg Base + Register Offset

The base is a pointer stored in a local or argument slot (e.g., a function parameter of type `addr` or `ptr`). It must be loaded from the IX frame before any computation.

**Loading a 16-bit base from a local:**

```
ld l, (ix + d)          ; 19 T-states — low byte
ld h, (ix + d+1)        ; 19 T-states — high byte
                        ; 38 T-states for the base load
```

After this, HL contains the base pointer and the rest proceeds as in 4.2. The total for a byte-element access with an 8-bit register offset:

```
; localPtr[C] where localPtr is an addr local
ld l, (ix + d)          ; 19 — base low
ld h, (ix + d+1)        ; 19 — base high
ld d, 0                 ;  7 — zero-extend offset
ld e, c                 ;  4
add hl, de              ; 11
ld a, (hl)              ;  7
                        ; total: 67 T-states
```

That 38 T-state overhead for the base load is the IX tax. It's real, but it only happens once per access. If this pattern appears inside a loop, the obvious optimization is to hoist the base load out of the loop and keep the pointer in HL across iterations, bumping it with `inc hl` each time instead of recomputing from scratch. The compiler is not required to do this automatically, but the programmer can (and should) do it manually for hot paths:

```
; manual hoist: load base once, iterate with HL
ld l, (ix + d)
ld h, (ix + d+1)
ld b, count
repeat
  ld a, (hl)
  ; ... process element ...
  inc hl
  dec b
until Z
```

### 4.4 Register Base + Local/Arg Offset

This is the reverse: the base is in a register (HL) and the offset is stored in a local/arg variable. This pattern is less common but arises when the programmer has a pointer in a register and an index stored as a function parameter.

The offset must be loaded from the IX frame into a register pair, which means the compiler needs a free pair. If the offset is a byte variable:

```
; (HL + localIndex) where localIndex is a byte local
ld e, (ix + d)          ; 19 — load offset byte
ld d, 0                 ;  7 — zero-extend
add hl, de              ; 11
ld a, (hl)              ;  7
                        ; total: 44 T-states (plus whatever HL already cost)
```

If the offset is a word variable:

```
ld e, (ix + d)          ; 19
ld d, (ix + d+1)        ; 19
add hl, de              ; 11
ld a, (hl)              ;  7
                        ; total: 56 T-states
```

This is expensive. When the compiler sees this pattern, the main question is whether DE is free. If DE already holds a value the programmer needs, the compiler must save and restore it (adding push/pop overhead), or reject the lowering as not expressible without clobbering. ZAX's current lowering policy (Section 6.1.1 of the spec) requires that lowered sequences preserve registers other than the instruction's explicit destinations, which means the compiler must save DE if it's live. That turns a 44 T-state sequence into a 77 T-state sequence (adding `push de` at 11 T-states and `pop de` at 10 T-states).

### 4.5 Register Base + Register Offset

This is the fast path. Both values are already in registers, so the only cost is the addition.

```
; HL + DE
add hl, de              ; 11 T-states
ld a, (hl)              ;  7
                        ; total: 18 T-states
```

If the base is in HL and the offset is in BC:

```
add hl, bc              ; 11
ld a, (hl)              ;  7
                        ; total: 18 T-states
```

If the offset is in an 8-bit register that isn't already the low byte of a pair, widening is needed:

```
; HL + C (8-bit offset)
ld d, 0                 ;  7
ld e, c                 ;  4
add hl, de              ; 11
ld a, (hl)              ;  7
                        ; total: 29 T-states
```

This is the case the programmer should aim for in hot loops. If both the base pointer and the index counter are in registers, address computation is cheap. ZAX's register-first philosophy supports this naturally: the programmer can explicitly place values in registers and write the indexing expression using those registers.

### 4.6 Local/Arg Base + Local/Arg Offset

Both values live in the IX frame. This is the worst case: two IX-relative loads before any computation. In v0.2 this should be treated as a **discouraged** form and may be rejected by a future runtime-atom budget:

- If allowed, the compiler must preserve DE (or BC) if used as scratch: push/pop adds ~21 T-states on top of the ~82 T-state baseline, pushing it over 100 T-states per access.
- Recommended alternative: load one operand (base or index) into a register outside the hot loop, turning the pattern into Section 4.2/4.3/4.5.
- Consider making “local + local” lowerings opt-in (warning) or rejected when inside the runtime-atom budget for array expressions.

### 4.7 Recommended vs. discouraged patterns (summary)

**Recommended (fast, predictable)**

- Constant base + register index; base in DE, scaled offset in HL; power-of-two element sizes so scaling is `add hl, hl` chains.
- Constant base + constant index (fully folded).
- Register base + register offset already in a 16-bit pair; just `add hl, de` then access.
- Hoisted base pointer in a register across loop iterations; bump with `inc hl` or `add hl, de`.

**Discouraged (slow / complex)**

- Local/arg base plus local/arg index: double IX loads per access.
- Multi-stage indirection (`arr[(HL)]`) inside hot loops.
- Element sizes that require long multiply sequences (non–power-of-two, especially odd sizes) in hot loops.
- Relying on `(IX+d)` to fetch every byte of an index or base each iteration.

```
; localPtr[localIndex] — both are locals
; Load base into HL
ld l, (ix + d1)         ; 19
ld h, (ix + d1+1)       ; 19
; Load offset into DE
ld e, (ix + d2)         ; 19
ld d, 0                 ;  7 (or ld d, (ix+d2+1) for word index: 19)
add hl, de              ; 11
ld a, (hl)              ;  7
                        ; total: 82 T-states (byte index)
                        ;     or 94 T-states (word index)
```

This is genuinely slow, and there's no way to make it cheaper without changing where the values live. The compiler emits it correctly, but programmers who care about performance will restructure their code to keep at least one of these values in a register. The compiler doesn't need to optimize this case — it needs to lower it correctly and let the programmer decide when to optimize.

### 4.7 Global Base + Variable Offset and Vice Versa

Global symbols resolve to absolute 16-bit addresses at compile time. A global base is equivalent to a constant base (Section 4.2) — the compiler can load it with `ld hl, symbol` (10 T-states) instead of the 38 T-state IX-relative pair.

A global offset (a value stored at a global `var` address) is loaded with absolute addressing:

```
ld a, (globalIndex)     ; 13 T-states for byte
; or
ld hl, (globalAddr)     ; 16 T-states for word
```

Both are cheaper than IX-relative loads. For the specific case of a global base plus a global offset:

```
; globalArr[globalIndex] — byte elements, byte index
ld a, (globalIndex)     ; 13 — load index
ld e, a                 ;  4 — into DE low
ld d, 0                 ;  7 — zero-extend
ld hl, globalArr        ; 10 — base
add hl, de              ; 11 — compute address
ld a, (hl)              ;  7 — access
                        ; total: 52 T-states
```

Compare the all-local version at 82 T-states. Globals are substantially cheaper for address computation because absolute loads avoid the IX overhead. This is the Z80 reality: memory-mapped global state is faster to access than stack-local state. ZAX's distinction between `var` (global) and function-local `var` is not just semantic — it has real performance implications that the programmer should understand.

---

## 5. Summary Table

Each row assumes byte-sized elements (no scaling) and a final `ld a, (hl)` as the access. "Free pair" means a 16-bit register pair is available for the offset without save/restore.

| Base source       | Offset source  | Offset width | Approx. T-states | Notes                        |
| ----------------- | -------------- | ------------ | ---------------- | ---------------------------- |
| Constant (global) | Constant       | —            | 13–16            | Folded to absolute address   |
| Constant (global) | reg8           | 8            | 39               | Widen + add                  |
| Constant (global) | reg16          | 16           | 28               | Direct add                   |
| Constant (global) | Local/arg byte | 8            | 58               | IX load + widen + add        |
| Constant (global) | Global byte    | 8            | 52               | Absolute load + widen + add  |
| Local/arg (ptr)   | reg8           | 8            | 67               | IX base load + widen + add   |
| Local/arg (ptr)   | reg16          | 16           | 56               | IX base load + add           |
| Local/arg (ptr)   | Local/arg byte | 8            | 82               | Two IX loads + widen + add   |
| reg16 (HL)        | reg8           | 8            | 29               | Widen + add                  |
| reg16 (HL)        | reg16 (DE/BC)  | 16           | 18               | Single add                   |
| reg16 (HL)        | Local/arg byte | 8            | 44               | IX offset load + widen + add |

---

## 6. Practical Guidance for the Programmer

The table above leads to a few rules of thumb that ZAX programmers should internalize:

**Keep loop-hot values in registers.** The difference between register-to-register address computation (18 T-states) and local-to-local (82+ T-states) is a factor of 4.5x. In a tight loop iterating over an array, loading the base pointer into DE/HL once before the loop and keeping the index counter in a register (B for `djnz`, or DE/BC for 16-bit counts) eliminates per-iteration IX overhead.

**Prefer pointer iteration over indexed access inside loops.** Instead of recomputing `arr[i]` each iteration, load the base address into HL once and `inc hl` (or `add hl, de` for word stride) after each element. For byte arrays this collapses address computation to a single 6 T-state `inc hl`; for word arrays, two `inc hl` are still far cheaper than recomputing via IX.

**Use module-scope data symbols for hot scalar state.** If a value is accessed frequently from multiple functions and doesn't need to be reentrant, a module-scope symbol in a named `data` section is cheaper to access than a function-local. The difference is 13 T-states (absolute byte load) versus 19 T-states (IX-relative byte load) per access, and 16 versus 38 T-states for word loads. This adds up in inner loops.

**Let the compiler handle cold paths.** For code that runs once (initialization, configuration, error handling), the IX overhead doesn't matter. Write clean, structured code using locals and let the compiler emit the straightforward lowering. Save the register-management effort for the paths where cycles actually matter.

**Loop hot-path checklist (do this)**

- Base in DE, offset/scale in HL; add at the end.
- Hoist base/stride before the loop; bump pointer per-iteration (`inc hl` / `add hl, de`).
- Keep index in B/DE/BC; prefer power-of-two element sizes.
- Avoid IX-relative loads inside the loop when a hoisted pointer will do.

**Not recommended in hot loops**

- Local+local base/index (double IX loads per access; also triggers extra push/pop for scratch preservation if allowed).
- Nested `(HL)` indirection for indices inside the loop.
- Odd element sizes that need long multiply chains.

---

## 7. Practical Guidance for the Compiler

The compiler's lowering strategy for effective-address expressions should follow a priority order based on what's known at compile time:

**First: fold constants.** If both base and offset are compile-time constants, fold to an absolute address. No runtime computation.

**Second: prefer HL for the final address.** The access instruction will be `ld r, (hl)` or `ld (hl), r` in almost all cases, so the lowering sequence should target HL as the result register.

**Third: use DE or BC for the offset.** `add hl, de` and `add hl, bc` are the only 16-bit add forms (besides `add hl, hl` and `add hl, sp`). The compiler should route the offset through whichever pair is free.

**Fourth: choose load order based on scaling.** If the element size is 1 (no scaling), load the base into HL first, then load/widen the offset into DE and add. If the element size requires scaling (shift/add), load the offset into HL first (so `add hl, hl` can do the doubling), then load the base into DE and add at the end. This avoids an extra exchange instruction.

**Fifth: widen 8-bit offsets cheaply.** For unsigned 8-bit indices (the normal case for array indexing), zero-extension is `ld d, 0; ld e, r` — two instructions, 11 T-states. For the `(HL)` index form allowed by the spec (where the index is a byte read from memory at HL), the compiler must emit the load and widening as part of the sequence.

**Sixth: preserve registers per the lowering contract.** If the lowering sequence uses DE or BC as scratch, and the programmer's code has a live value in that pair, the compiler must save and restore it. This adds push/pop overhead but is required by the preservation guarantee in Section 6.1.1 of the spec.

---

## 8. Element Scaling

Array indexing computes `base + index * element_size`. When the element size is not 1, the compiler must scale the index before adding it to the base.

**Element size 1 (byte arrays).** No scaling. The index is the offset directly.

**Element size 2 (word arrays, addr arrays, ptr arrays, 2-byte records).** Scale by left-shifting once. The cheapest form is `add hl, hl` (11 T-states) with the index in HL. If the index is in DE, the compiler must move it to HL first (`ex de, hl` at 4 T-states), scale, then move it back or adjust the load order to keep the base in DE.

**Element size 4.** Two left-shifts: `add hl, hl; add hl, hl` (22 T-states).

**Element size 3, 5, 6, 7 (odd-sized records).** These require a multiply-by-constant sequence. For element size 3: `add hl, hl` (×2) then `add hl, de` where DE holds the original index (×2 + ×1 = ×3). This requires keeping the original index in a second register, which costs a register pair. For element size 5: `add hl, hl; add hl, hl` (×4) then `add hl, de` (×4 + ×1 = ×5). The general pattern is shift-and-add decomposition.

Current lowering implements exact constant-size scaling for any positive element size using an unrolled shift/add chain. Power-of-two sizes stay on the shorter pure-shift fast path; non-power-of-two sizes preserve `DE` while materializing the longer exact sequence. Programmers should still prefer power-of-two element sizes in hot loops when the extra instructions matter, but exact semantic layout is no longer constrained by that performance consideration.

---

## 9. The `(HL)` Index Form

The spec (Section 5.1) allows `(HL)` as a special-case index form: `arr[(HL)]` means "read a byte from the address in HL, use that byte as the index." This is a two-stage indirection: first a memory load, then an address computation.

The lowering is:

```
; arr[(HL)] — byte element
ld e, (hl)              ;  7 — read index byte from memory
ld d, 0                 ;  7 — zero-extend
ld hl, arr              ; 10 — base
add hl, de              ; 11 — compute address
ld a, (hl)              ;  7 — access
                        ; total: 42 T-states
```

This form is useful for table-driven dispatch and indirect indexing patterns common in game engines and interpreters. The HL value is consumed by the index load, so it's not available afterward — the compiler routes the base through `ld hl, arr` after the index is safely in DE.

---

## 10. The Module-Scope Memory Question

The discussion above treats module-scope symbols and locals as having different access costs, which they do. But the difference goes deeper than just T-states.

**Module-scope symbols are position-independent of the stack.** A module-scope symbol is at a fixed absolute address throughout program execution. It can be accessed from any function without any frame pointer. There is no stack-depth sensitivity, no SP-tracking interaction, no epilogue concern. An absolute load/store is a single instruction with a fixed cost.

**Module-scope mutable symbols are not reentrant.** Because they occupy fixed addresses, two concurrent invocations of a function that updates shared module-scope state will conflict. This matters less on Z80 (which has no hardware threading) but matters if the programmer uses interrupt handlers. A function that accesses shared module-scope state and can be called from both mainline code and an ISR must be designed with that sharing in mind.

**Module-scope symbols interact with section placement.** Named `data` sections carry module storage declarations that are later placed/merged by section key and anchors. The programmer must understand which placed region a symbol lands in, because mutability assumptions depend on target memory mapping. This isn't an address-computation concern but it affects how the programmer thinks about where to put mutable state.

**Lowering for module-scope base + register offset** is the same as Section 4.2 (constant base + register offset), since a module-scope symbol's address is a compile-time constant. This is the cheapest non-trivial address computation and is the natural choice for module arrays and tables that are indexed in tight loops.

**Lowering for module-scope offset** (reading an index from a module-scope variable) costs 13 T-states for a byte (`ld a, (nn)`) or 16 T-states for a word (`ld hl, (nn)`), both cheaper than the IX-relative equivalents. For patterns where both the array and the index are module-scope, the all-module-scope computation (52 T-states, from Section 4.7) is significantly cheaper than the all-local version (82 T-states).

**The compiler does not need to treat module-scope symbols specially in lowering logic.** A module-scope symbol resolves to a compile-time `imm16` address, which means module-scope bases fall into the "constant base" cases automatically. The only compiler concern is ensuring that `ld a, (symbol)` and `ld hl, (symbol)` emit the correct absolute addressing forms rather than attempting IX-relative or HL-indirect access.

---

## 11. Position Summary

ZAX's lowering strategy for array indexing and effective-address computation is shaped by three interlocking decisions:

**IX is the frame pointer.** This costs roughly 2× per local/arg access compared to HL-indirect, but frees HL, DE, and BC for the programmer and for address computation. The cost is predictable and consistent, which matters more in a structured assembler than raw cycle minimality.

**The programmer manages register placement.** ZAX does not allocate registers. If the programmer wants a loop counter in B and a base pointer in HL, they put them there explicitly. The compiler lowers `arr[B]` using whatever registers are available, but the programmer's choice of which values live in registers versus locals is the primary performance lever.

**The compiler lowers correctly and predictably.** The lowering sequences described in this document are not optimized for minimum cycle count in every case — they are optimized for correctness, register preservation, and predictability. The compiler folds constants, picks reasonable register routing, and emits the straightforward sequence. The programmer optimizes hot paths by promoting locals to registers, hoisting base loads out of loops, and preferring pointer iteration over indexed access.

This division of responsibility is the ZAX philosophy applied to address computation: the language provides structure and correctness, the programmer provides performance judgment, and the hardware is never hidden.
