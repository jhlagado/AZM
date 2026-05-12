# Type System Reform Plan

**Date:** 2026-03-07
**Status:** Historical design record with one remaining active thread (Phase D)
**Validated against:** `main` at `2f25068`

This document originally proposed four phases of work to fix the ZAX type
system, layout engine, and addressing pipeline.

On current `main`, the situation has changed:

- Phase A is implemented.
- Phase B is implemented.
- Phase C is implemented.
- Phase D remains the main unfinished item in this document.

This file is therefore no longer a pure forward plan. It is now a mixed design
record:

- Phases A-C explain why those changes were needed and what landed.
- Phase D remains active design/work.

Do not create new implementation tickets from this document without first
checking current `main`. Only Phase D should be treated as live work.

---

## Background and motivation

### What "power of two" is actually for

The Z80 has no hardware multiply instruction. To compute `base + index * elementSize` at runtime using only register operations, element sizes must be powers of two so that multiplication can be replaced by a sequence of left-shifts (`add hl, hl`). This is the only place where power-of-two element sizes are load-bearing.

Specifically:

- **Global array element stride** — the only context where runtime indexing requires shift-based multiplication
- **Local variable slots** — always 2 bytes regardless of declared type (byte/word scalars only); never subject to runtime multiplication
- **Function argument slots** — always 2 bytes; never subject to runtime multiplication
- **Record field offsets** — computed at compile time, not at runtime; can be any value
- **The record itself as a global object** — the outer object occupies its packed size; pow2 rounding is only needed for its element stride if it is used inside an array

The current implementation applies `nextPow2` universally through `src/semantics/layout.ts`. This is safe (it never generates wrong code for single objects) but wastes memory and produces misleading field offset arithmetic. Phase D separates `preRoundSize` (the real packed size) from `storageSize` (the pow2-rounded stride used only when computing array element offsets).

### Original broken areas

The following problems motivated the original plan. On current `main`, items
1-3 are fixed; item 4 remains the live design/work item.

**1. Byte pipeline missing `IndexImm` — fixed on current `main`.** When this
document was written, byte-array indexing with named word variables could fall
through to the wrong fallback path. That gap has since been fixed and covered
by targeted regression tests.

**2. EA resolution for non-scalar function parameters — fixed on current
`main`.** The original wrong-code path has been replaced by explicit indirect EA
resolution and consumer handling.

**3. Wide array element pipelines stop at elemSize 2 — fixed on current
`main`.** Wide `EAW_*` routing now handles broader power-of-two element sizes.

**4. Record field packing wastes memory — still active.** `layout.ts` still
applies `nextPow2` to every composite type's total size. When a record is used
as a field inside another record, its `storageSize` (pow2) is used for the
field-to-field offset. A 3-byte record contributes 4 bytes to any outer
record.

### `push IX; pop HL` — full inventory

A codebase sweep confirmed that the `push IX; pop HL` idiom appears in exactly four lowering locations (plus one correct prologue use). The rest of the codebase (`src/lowering/steps.ts`, `scalarWordAccessors.ts`, `ldEncoding.ts`, `addressingPipelines.ts`) is clean and spec-compliant.

| # | File | Lines | Triggered by | Semantics | Fixed by |
|---|---|---|---|---|---|
| 1 | `src/lowering/valueMaterialization.ts` | 181–182 | IndexReg8/Reg16, fvar base, elemSize > 2 | ❌ wrong address (`IX+ixDisp+idx` not `*(IX+ixDisp)+idx`) | Phase B (indirect EA) / Phase C (wide pipeline) |
| 2 | `src/lowering/valueMaterialization.ts` | 473–474 | General runtime index, fvar base, elemSize > 2 | ❌ wrong address (same) | Phase B / Phase C |
| 3 | `src/lowering/valueMaterialization.ts` | 497–498 | Plain scalar `stack` EA in `pushEaAddress` | ✅ scalar locals only after Phase B; also ❌ reachable for param array slots via byte-pipeline IndexImm gap | Phase A fixes param-array case; scalar case possibly unavoidable (no `LD HL,IX` on Z80) |
| 4 | `src/lowering/eaMaterialization.ts` | 27–28 | `materializeEaAddressToHL`, `resolved.kind === 'stack'` | ⚠️ stack imbalance: `push DE` at line 26 never restored; locked in by `test/lowering/pr509_ea_materialization_helpers.test.ts` lines 51–63 | Phase B eliminates non-scalar case; scalar case needs audit |
| — | `src/lowering/functionLowering.ts` | 341 | Function prologue | ✅ correct (saves IX for frame setup) | N/A |

### Historical wrong golden files

These language-tour examples encode wrong assembly. Tests currently pass against the wrong output.

| Example | Source expression | Generated address | Correct address |
|---|---|---|---|
| `38_byte_fvar_reg8.asm` | `ld b, arr[idx]` — `idx: word` param | `IX+4+idx` | `*(IX+4)+idx` |
| `41_byte_fvar_fvar.asm` | `ld a, arr[idx_word]` — `idx_word: word` param | `IX+4+idx_word` | `*(IX+4)+idx_word` |
| `42_byte_fvar_glob.asm` | `ld a, arr[glob_idx_word]` — global word var | `IX+4+glob_idx_word` | `*(IX+4)+glob_idx_word` |

For comparison: `39_byte_fvar_reg16.asm` (`arr[hl]` — explicit HL register) is **correct** because `IndexReg16` IS handled by `buildEaBytePipeline` and routes through `LOAD_BASE_FVAR`, which correctly dereferences the pointer in slot IX+4. Word array examples (60–69) are all correct because `buildEaWordPipeline` has `IndexImm{ImmName}` handling.

---

## Phase A — Byte pipeline `IndexImm` gap

**Current status:** implemented on `main`

### Root cause

`buildEaBytePipeline` in `src/lowering/addressingPipelines.ts` (lines 59–115) handles `IndexReg8`, `IndexReg16`, and `IndexEa`, but has no `IndexImm` case. Named word variables used as array indices are parsed as `IndexImm { value: ImmName("idx_word") }`. The switch hits `default: return null`.

`buildEaWordPipeline` (lines 117–202) HAS full `IndexImm{ImmName}` handling at lines 127–152: it converts the name to an `EaExprNode`, resolves it as a stack or abs EA, and routes to `EAW_FVAR_FVAR` / `EAW_FVAR_GLOB` / `EAW_GLOB_FVAR` / `EAW_GLOB_GLOB`.

When the byte pipeline returns null, `ldEncoding.ts` falls through to `materializeEaAddressToHL` → `pushEaAddress(arr[idx])` → `pushEaAddress(arr)` → Instance 3 (`push IX; pop HL; add HL, DE(ixDisp)`) → pushes `IX+4` (the address of the pointer slot, not the pointer value). Then the index is added to `IX+4`, producing the wrong stack address.

### Changes required

#### `src/lowering/addressingPipelines.ts` — `buildEaBytePipeline`

Add an `IndexImm` case mirroring lines 127–152 of `buildEaWordPipeline`:

```typescript
if (ea.index.kind === 'IndexImm') {
  const imm = ctx.evalImmExpr(ea.index.value);
  if (imm !== undefined) {
    return baseResolved.kind === 'abs'
      ? EA_GLOB_CONST(baseResolved.baseLower, imm)
      : EA_FVAR_CONST(baseResolved.ixDisp, imm);
  }
  if (ea.index.value.kind === 'ImmName') {
    const idxScalar = ctx.resolveScalarBinding(ea.index.value.name);
    if (idxScalar !== 'word' && idxScalar !== 'addr') return null;
    const idxNameEa: EaExprNode = { kind: 'EaName', span, name: ea.index.value.name };
    const idxResolved = ctx.resolveEa(idxNameEa, span);
    if (!idxResolved) return null;
    if (idxResolved.kind === 'abs') {
      return baseResolved.kind === 'abs'
        ? EA_GLOB_GLOB(baseResolved.baseLower, idxResolved.baseLower)
        : EA_FVAR_GLOB(baseResolved.ixDisp, idxResolved.baseLower);
    }
    if (idxResolved.kind === 'stack') {
      return baseResolved.kind === 'abs'
        ? EA_GLOB_FVAR(baseResolved.baseLower, idxResolved.ixDisp)
        : EA_FVAR_FVAR(baseResolved.ixDisp, idxResolved.ixDisp);
    }
  }
  return null;
}
```

This uses the EA_* byte family (which does `add hl, de` with no shift, correct for elemSize=1) and routes through `LOAD_BASE_FVAR` for fvar bases, which correctly dereferences the pointer slot.

### Implementation steps

1. Add `IndexImm` case to `buildEaBytePipeline` (mirror word pipeline)
2. Regenerate golden files for examples 38, 41, 42
3. Verify regenerated output uses `ld e,(ix+4); ld d,(ix+5)` (LOAD_BASE_FVAR dereference), not `push IX; pop HL`
4. Verify no `push IX` appears in the regenerated output (beyond the prologue)
5. Verify examples 39 (IndexReg16) and 60–69 (word arrays) are unchanged

### Risk

Low. This is a narrow, targeted fix. The byte EA_* pipeline families already exist and are well-tested. The only change is routing `IndexImm{ImmName}` to them instead of falling through to the broken materialization path.

---

## Phase B — Indirect EA resolution (correct reference semantics for non-scalar parameters)

**Current status:** implemented on `main`

### Current behaviour and bug

The caller side of non-scalar parameter passing is already correct. `src/lowering/functionCallLowering.ts` line 237 (`pushArgAddressFromOperand`) detects non-scalar parameter types and emits the address of the argument rather than its value. The programmer writes `render(sprites)` and the compiler emits `ld hl, sprites; push hl`. No annotation required.

The callee side is broken. `src/lowering/eaResolution.ts` lines 36–43 resolve any named stack slot (including non-scalar parameters) using the `stack` kind:

```typescript
if (slotOff !== undefined) {
  const slotType = ctx.stackSlotTypes.get(baseLower);
  return { kind: 'stack', ixDisp: slotOff, typeExpr: slotType };
  //                       ^^^^^^^^^^^^^^^^^^^
  //  This is WRONG for non-scalar params.
  //  IX+4 holds a POINTER to the array, not the array itself.
  //  But the resolution says "the data lives at IX+4".
}
```

Subsequent `EaField` and `EaIndex` operations then add field/element offsets to `ixDisp` directly, placing the final access inside the function's own stack frame at an incorrect offset.

### Solution: `indirect` EaResolution kind

Add a third `EaResolution` kind that explicitly represents "pointer stored in a stack slot":

```typescript
export type EaResolution =
  | { kind: 'abs';      baseLower: string; addend: number; typeExpr?: TypeExprNode }
  | { kind: 'stack';    ixDisp: number;                    typeExpr?: TypeExprNode }
  | { kind: 'indirect'; ixDisp: number;    addend: number; typeExpr?: TypeExprNode };
  //  Meaning: "the 2-byte word at IX+ixDisp is a pointer;
  //            the actual data address is *(IX+ixDisp) + addend"
```

The `addend` accumulates field offsets and element strides from subsequent `EaField` and `EaIndex` operations. The `ixDisp` is fixed — it is always the slot where the pointer lives.

#### `src/lowering/eaResolution.ts` — `EaName` change

```typescript
case 'EaName': {
  const baseLower = expr.name.toLowerCase();
  const slotOff = ctx.stackSlotOffsets.get(baseLower);
  if (slotOff !== undefined) {
    const slotType = ctx.stackSlotTypes.get(baseLower);
    const isScalar = !slotType || ctx.resolveScalarKind(slotType) !== undefined;
    if (isScalar) {
      return { kind: 'stack', ixDisp: slotOff,
               ...(slotType ? { typeExpr: slotType } : {}) };
    }
    return { kind: 'indirect', ixDisp: slotOff, addend: 0,
             ...(slotType ? { typeExpr: slotType } : {}) };
  }
  // ... alias and abs paths unchanged
}
```

#### `src/lowering/eaResolution.ts` — `EaField` change

```typescript
case 'EaField': {
  const base = go(expr.base, visitingAliases);
  // ... type resolution unchanged ...
  if (base.kind === 'indirect') {
    return { kind: 'indirect', ixDisp: base.ixDisp,
             addend: base.addend + off, typeExpr: f.typeExpr };
  }
  // ... abs and stack cases unchanged ...
}
```

Note: currently field offset accumulation uses `storageSize` (line 92). This is correct for now — Phase D will switch it to `preRoundSize`.

#### `src/lowering/eaResolution.ts` — `EaIndex` change (constant index)

```typescript
case 'EaIndex': {
  if (expr.index.kind === 'IndexImm') {
    const delta = idx * elemSize;
    // ... abs and stack cases unchanged ...
    if (base.kind === 'indirect') {
      return { kind: 'indirect', ixDisp: base.ixDisp,
               addend: base.addend + delta, typeExpr: base.typeExpr.element };
    }
  }
  // Runtime index: fall through to valueMaterialization (handled below)
}
```

#### Lowering consumers: handling `indirect`

Every place that consumes an `EaResolution` must handle the new `indirect` kind. The lowering consumers use **if-chains** (not exhaustive switches), so TypeScript will **not** automatically flag missing cases. Each consumer must be audited manually.

| File | Pattern | Handling needed |
|---|---|---|
| `src/lowering/ldEncoding.ts` | 634 lines; imports `EaResolution`; calls `buildEaBytePipeline`/`buildEaWordPipeline` with fallback to `materializeEaAddressToHL` | `indirect` bases must route to materialisation path; pipeline dispatch must return null for `indirect` |
| `src/lowering/valueMaterialization.ts` | `r.kind === 'abs'` / `r.kind === 'stack'` in `pushEaAddress` and `pushMemValue` | Add `indirect` materialisation: load pointer from IX+N, add addend, push result |
| `src/lowering/eaMaterialization.ts` | `resolved.kind === 'abs'` / implicit `stack` | Add `indirect` case or let it fall through to pushEaAddress |
| `src/lowering/addressingPipelines.ts` | `buildEaBytePipeline`, `buildEaWordPipeline` | Add `if (baseResolved.kind === 'indirect') return null` before existing abs/stack dispatch |
| `src/lowering/scalarWordAccessors.ts` | `canUseScalarWordAccessor`, `emitScalarWordLoad/Store` | `indirect` → `canUseScalarWordAccessor` returns false (correct — indirect words need full materialisation) |
| `src/lowering/ldFormSelection.ts` | ld form analysis | May need awareness of indirect for form categorisation |

#### `push IX; pop HL` — instance 3

After Phase B, non-scalar stack slots become `kind: 'indirect'` and will hit the new `indirect` path rather than `kind: 'stack'`. The remaining `kind: 'stack'` cases in `pushEaAddress` will be scalar `addr`-typed locals where `IX + ixDisp` IS the correct address. On Z80 there is no `LD HL, IX` instruction; `push IX; pop HL` is the only mechanism to copy IX into HL. This instance may be inherently unavoidable — flagged for Z80 expert review.

#### `push IX; pop HL` — instance 4 (`eaMaterialization.ts`, lines 26–28)

This has two problems:

**Stack imbalance:** `push DE` at line 26 saves DE onto the stack. The function then does `push HL; pop DE` at lines 44–45, which copies the address into DE but never pops the original saved DE. The net effect is one extra word on the stack. Test `test/lowering/pr509_ea_materialization_helpers.test.ts` lines 51–63 locks in this exact sequence as expected output — the test must be updated.

**Semantics for non-scalar slots:** After Phase B, `kind: 'stack'` will no longer be returned for non-scalar parameter slots. If this code path was ever reached for a parameter array before Phase B, it suffered the same wrong-address error. After Phase B that path becomes `indirect` instead.

#### Materialisation sequences

**Loading from an indirect EA:**

```asm
; indirect { ixDisp: 4, addend: 18 }
ld l, (ix+4)      ; load pointer low byte
ld h, (ix+5)      ; load pointer high byte  → HL = base pointer
ld de, 18          ; (if addend != 0)
add hl, de         ; HL = base pointer + addend = final address
ld a, (hl)         ; dereference
```

**Pushing the address of an indirect EA:**

```typescript
if (r.kind === 'indirect') {
  ctx.emitInstr('ld', [Reg('L'), Mem(IxDisp(r.ixDisp))], span);
  ctx.emitInstr('ld', [Reg('H'), Mem(IxDisp(r.ixDisp + 1))], span);
  if (r.addend !== 0) {
    ctx.loadImm16ToDE(r.addend, span);
    ctx.emitInstr('add', [Reg('HL'), Reg('DE')], span);
  }
  ctx.emitInstr('push', [Reg('HL')], span);
  return true;
}
```

#### Runtime index into indirect EA (e.g. `s[C].flags` where C is a register)

```asm
; Step 1: scale the index into HL
ld h, $00
ld l, c
add hl, hl; ... (N shifts for elemSize)

; Step 2: add field offset (compile-time constant)
ld de, flagsOffset
add hl, de         ; HL = C * elemSize + flagsOffset

; Step 3: add base pointer from stack slot
ld e, (ix+4)
ld d, (ix+5)       ; DE = *(IX+4) = &sprites[0]
add hl, de         ; HL = &sprites[C].flags

; Step 4: dereference
ld a, (hl)
```

12 instructions for a runtime-indexed non-scalar parameter field access — slightly more than the direct global case (8 instructions), which is the expected cost of indirection.

### Implementation steps

1. Add `indirect` to `EaResolution` type in `src/lowering/eaResolution.ts`
2. Add `resolveScalarKind` to `EaResolutionContext` (thread from outer lowering context)
3. Change `EaName` case: detect non-scalar slot → return `indirect`
4. Change `EaField`: propagate `indirect` (add to addend)
5. Change `EaIndex` (constant): propagate `indirect`
6. Audit all six consumers (see table above): `ldEncoding.ts`, `valueMaterialization.ts`, `eaMaterialization.ts`, `addressingPipelines.ts`, `scalarWordAccessors.ts`, `ldFormSelection.ts`
7. Handle `indirect` in `ldEncoding.ts` load path
8. Handle `indirect` in `valueMaterialization.ts` `pushEaAddress` path
9. Return `null` from both `buildEaBytePipeline` and `buildEaWordPipeline` for `indirect` bases
10. Update `test/lowering/pr509_ea_materialization_helpers.test.ts` (currently locks in buggy sequence)
11. Add golden test: `func render(s: Sprite[8]): void` with `ld a, (s[2].flags)`

### Risk

Moderate. The `indirect` kind must be handled in every consumer. TypeScript's exhaustive type checks will NOT surface missing cases because consumers use `if`-chains, not exhaustive switches. Manual audit of every consumer is required. The most complex part is the runtime-indexed indirect case. Start with constant-indexed access, verify with tests, then extend to register-indexed access.

---

## Phase C — Wide EAW pipeline (any pow2 element size up to $8000)

**Current status:** implemented on `main`

### Current behaviour

The structured addressing pipeline only handles element sizes 1 (byte, `EA_*` family) and 2 (word, `EAW_*` family). The guards are:

- `src/lowering/addressingPipelines.ts` line 125: `if (elemSize !== 2) return null;` (runtime-indexed EaIndex case)
- `src/lowering/addressingPipelines.ts` line 198: `if (elemSize !== 2) return null;` (resolved constant-index fallback)

Sizes other than 1 and 2 fall through to `valueMaterialization.ts` where they are handled by an unstructured shift loop that:
1. Emits N `add hl, hl` shifts
2. Saves the scaled offset with `push hl`
3. Loads the base address into HL
4. Pops the scaled offset into DE
5. Emits `add hl, de`
6. Pushes the result

That is 10 instructions with 2 push/pop round-trips. The pipeline approach emits 8 instructions with no stack use, because it can interleave the base load (`ld de, base`) with the shifts in the correct order.

For frame-slot bases (function parameters), the fallback also contains Instances 1 and 2 of `push IX; pop HL`, which produce the wrong address. Once Phase B adds the `indirect` kind, those paths become unreachable for non-scalar parameters — but the unstructured fallback remains slower than necessary for global-base wide arrays.

### Design: parametric `CALC_EA_WIDE(shiftCount)`

The pipeline should support **any power-of-two element size from 2 up to $8000** (32768). That is shiftCount 1 through 15. The Z80 scaling is just repeated `add hl, hl` — there is nothing special about 4 shifts versus 15 shifts except code size and runtime cost. The type system should not impose an arbitrary implementation ceiling on element sizes.

#### `src/lowering/steps.ts` — `CALC_EA_WIDE(shiftCount)` factory

Replace the hardcoded constant:

```typescript
// Before
const CALC_EA_2 = () => [step({ kind: 'addHlHl' }), step({ kind: 'addHlDe' })]

// After
function CALC_EA_WIDE(shiftCount: number): Step[] {
  const shifts = Array.from({ length: shiftCount }, () => step({ kind: 'addHlHl' }));
  return [...shifts, step({ kind: 'addHlDe' })];
}

// Backward-compatible alias
const CALC_EA_2 = () => CALC_EA_WIDE(1);
```

`CALC_EA_WIDE(0)` = byte (one `add hl, de`, no shifts). This makes byte and wide pipelines a single parameterised family.

#### `src/lowering/steps.ts` — `makeEawPipelines(shiftCount)` generator

Replace the ten hand-written `EAW_*` closures with a factory:

```typescript
function makeEawPipelines(shiftCount: number) {
  const stride = 1 << shiftCount;
  const calc = () => CALC_EA_WIDE(shiftCount);
  return {
    GLOB_CONST: (base: string, imm: number)  => [...LOAD_GLOB(base),  ...LOAD_CONST(imm), ...calc()],
    GLOB_REG:   (base: string, reg: string)  => [...LOAD_GLOB(base),  ...LOAD_REG8(reg),  ...calc()],
    GLOB_RP:    (base: string, rp: string)   => [...LOAD_GLOB(base),  ...LOAD_RP(rp),     ...calc()],
    FVAR_CONST: (off: number,  imm: number)  => {
      const folded = foldFvar(off, imm * stride);
      return [...LOAD_BASE_FVAR(folded.base), ...LOAD_IDX_CONST(folded.idx), ...calc()];
    },
    FVAR_REG:   (off: number,  reg: string)  => [...LOAD_FVAR(off),   ...LOAD_REG8(reg),  ...calc()],
    FVAR_RP:    (off: number,  rp: string)   => [...LOAD_FVAR(off),   ...LOAD_RP(rp),     ...calc()],
    GLOB_FVAR:  (base: string, off: number)  => [...LOAD_GLOB(base),  ...LOAD_FVAR_IDX(off), ...calc()],
    FVAR_FVAR:  (off1: number, off2: number) => [...LOAD_FVAR(off1),  ...LOAD_FVAR_IDX(off2), ...calc()],
    FVAR_GLOB:  (off: number,  base: string) => [...LOAD_FVAR(off),   ...LOAD_GLOB_IDX(base), ...calc()],
    GLOB_GLOB:  (b1: string,   b2: string)   => [...LOAD_GLOB(b1),    ...LOAD_GLOB_IDX(b2), ...calc()],
  };
}

// Backward-compatible named exports (callers in addressingPipelines.ts do not change)
const EAW = makeEawPipelines(1);
export const EAW_GLOB_REG   = EAW.GLOB_REG;
export const EAW_GLOB_CONST = EAW.GLOB_CONST;
// ... (all ten)
```

Note: `FVAR_CONST` requires special treatment because the existing `EAW_FVAR_CONST` folds the scaled constant offset (`imm * stride`) into the IX displacement via `foldFvar` when it fits in a signed byte.

#### `src/lowering/addressingPipelines.ts` — `buildEaWidePipeline`

Rename `buildEaWordPipeline` to `buildEaWidePipeline`. Replace the size-2 guards with a shiftCount lookup:

```typescript
function shiftCountForSize(n: number): number | null {
  if (n < 2 || n > 0x8000) return null;
  const log = Math.log2(n);
  return Number.isInteger(log) ? log : null;
}

function buildEaWidePipeline(
  ea: EaExprNode, span: SourceSpan
): StepPipeline | null {
  // ... same structure as current buildEaWordPipeline ...
  const sc = shiftCountForSize(elemSize);
  if (sc === null) return null;
  const pipelines = makeEawPipelines(sc);
  // ... use pipelines.GLOB_REG etc. instead of EAW_GLOB_REG ...
}
```

This replaces both guards:
- Line 125: `if (elemSize !== 2) return null;` → `if (sc === null) return null;`
- Line 198: `if (elemSize !== 2) return null;` → same

#### `src/lowering/valueMaterialization.ts` — shiftCount guards

The guards at lines 131 and 382 (`if (shiftCount < 0 || shiftCount > 4)`) serve two purposes:
- `shiftCount < 0`: rejects non-pow2 sizes. Dead code — the type system already guarantees pow2. Can be removed.
- `shiftCount > 4`: rejects sizes > 16. This is the arbitrary ceiling. Change to `shiftCount > 15` or remove entirely (since the pipeline now handles all valid sizes and this code is the fallback safety net).

After Phase C, these fallback paths should be unreachable for any valid pow2 element size — the pipeline intercepts first. Add assertion comments documenting this.

### The rename: W means Wide, not Word

The `EAW_` prefix currently means "Effective Address Word" (element size 2). After this phase it means "Effective Address Wide" (element size = any power of 2 ≥ 2). The existing `EAW_*` export names remain identical in signature — they are backward-compatible aliases for the shiftCount=1 case.

### Codegen comparison: global vs parameter, Sprite[C] with Sprite = 16 bytes

```asm
; Global base — current code (correct, but unstructured fallback)
ld h, $00          ; 7
ld l, c            ; 4
add hl, hl         ; 11 ×4 shifts = 44
add hl, hl
add hl, hl
add hl, hl
push hl            ; 11 — save scaled index
ld hl, sprites     ; 10 — load base
pop de             ; 10 — recover scaled index
add hl, de         ; 11 — HL = sprites + C*16
push hl            ; 11
                   ; = 108 T-states, 10 instructions

; After Phase C — structured pipeline (LOAD_GLOB + LOAD_REG8(C) + CALC_EA_WIDE(4))
ld de, sprites     ; 10 — load base
ld h, $00          ; 7
ld l, c            ; 4
add hl, hl         ; 11 ×4
add hl, hl
add hl, hl
add hl, hl
add hl, de         ; 11 — HL = sprites + C*16
push hl            ; 11
                   ; = 87 T-states, 9 instructions — no stack round-trip
```

### Implementation steps

1. Add `CALC_EA_WIDE(shiftCount)` in `src/lowering/steps.ts`; keep `CALC_EA_2` as alias
2. Add `makeEawPipelines(shiftCount)`; keep backward-compatible named exports
3. Rename `buildEaWordPipeline` → `buildEaWidePipeline`; replace elemSize-2 guards with `shiftCountForSize`
4. Export `buildEaWidePipeline` from `addressingPipelines.ts`; update all call sites (`ldEncoding.ts`)
5. Remove or widen shiftCount ceiling in `valueMaterialization.ts` (lines 131, 382)
6. Verify Instances 1 and 2 (`push IX; pop HL` at lines 181–182, 473–474) are now unreachable for valid pow2 element sizes; add assertion comments
7. Add golden test: `Sprite[C]` with Sprite = 4, 8, 16, 256 bytes — confirm no `push IX` in output

### Risk

Low–moderate. The ten `EAW_*` export names are preserved. `buildEaWordPipeline` callers need updating to `buildEaWidePipeline`. The fallback in `valueMaterialization.ts` stays as a safety net during the transition.

---

## Phase D — Layout: separate packed size from array element stride

**Current status:** still active design/work

### Current behaviour

`src/semantics/layout.ts` applies `nextPow2` to every composite type's total size via `storageSize`. When a record is used as a field inside another record, its `storageSize` (pow2) is used for both the field's size contribution and the field-to-field offset.

```
type Inner  a: byte; b: byte; c: byte  end
  → preRoundSize = 3, storageSize = 4

type Outer  x: Inner; y: byte  end
  field x at offset 0, occupies 4 bytes  (wastes 1 byte between x and y)
  field y at offset 4
  → preRoundSize = 5, storageSize = 8

Inner[4]   element stride = 4  (correct — shift-based indexing needs pow2)
           total = 16, storageSize = 16  (correct)
```

The waste comes from using `storageSize` for record field packing. The fix: use `preRoundSize` for field offsets within records; keep `storageSize` for array element strides only.

Key locations in `src/semantics/layout.ts`:
- Line 92: record field accumulation uses `fs.storageSize` — change to `fs.preRoundSize`
- Line 135: array `preRound` computation
- Lines 83, 94, 136, 145: `nextPow2` applications

### Changes required

1. Change `typeStorageInfoForDecl` and `storageInfoForTypeExpr` RecordType sum from `storageSize` → `preRoundSize` (line 92)
2. Add `preRoundSizeOfTypeExpr` export
3. Change field offset walking in `eaResolution.ts` `EaField` case to use `preRoundSizeOfTypeExpr` (currently uses `storageSize` at line 92 of `eaResolution.ts`)
4. Find data emitter; add zero-padding for the `storageSize - preRoundSize` gap after each array element
5. Update all golden files — field offsets for nested records will change

### After Phase D

```
type Inner  a: byte; b: byte; c: byte  end
  → preRoundSize = 3, storageSize = 4  (unchanged)

type Outer  x: Inner; y: byte  end
  field x at offset 0, occupies 3 bytes  (no padding)
  field y at offset 3                    (was 4)
  → preRoundSize = 4, storageSize = 4   (was 5/8)

Inner[4]   element stride = 4  (unchanged — still pow2)
           total = 16           (unchanged)
```

### Risk

Low–moderate. Only affects composite types used as record fields. Scalar types, array strides, and function argument slots are unchanged. The main risk is updating all golden files correctly.

---

## Implementation sequence

Phases are ordered by severity — correctness bugs first, then generalisation and cleanup.

| Phase | What | Current state | Key files |
|---|---|---|---|
| A | Byte pipeline `IndexImm` gap | Done on `main` | `src/lowering/addressingPipelines.ts` |
| B | Indirect EA resolution | Done on `main` | `src/lowering/eaResolution.ts`, lowering consumers |
| C | Wide EAW pipeline (2–$8000) | Done on `main` | `src/lowering/steps.ts`, `src/lowering/addressingPipelines.ts` |
| D | Packed layout for record fields | Still pending | `src/semantics/layout.ts`, `src/lowering/eaResolution.ts` |

Only Phase D should be treated as live unfinished work from this document.

---

## Invariants after all four phases

1. **pow2 only where needed.** `nextPow2` is applied to record/array `storageSize` only for use as array element stride. Field-to-field offsets within records use `preRoundSize`. No wasted memory from internal padding inside nested record fields.

2. **Wide EA pipeline for all pow2 element sizes.** Arrays of any power-of-two element size from 2 to $8000 use the structured pipeline, producing 8 + shiftCount instructions with no stack spill. The unstructured fallback in `valueMaterialization.ts` remains as a safety net but is not the primary path for any valid power-of-two element size.

3. **Transparent reference semantics, both sides.** Passing a non-scalar (array or record) as a function argument silently passes its address (call-site, already correct). Accessing a non-scalar parameter inside the callee correctly loads the pointer from the parameter slot before computing field/index offsets (callee-side, fixed by Phase B). The programmer writes `render(sprites)` and `s[C].flags` — no `addr` casts, no explicit dereference syntax.

4. **Non-scalar locals remain alias-only.** The existing enforcement (local typed non-scalar decls require alias form) is unchanged. Scalar locals (`byte`, `word`, `addr`) occupy 2-byte IX-relative slots as before.

5. **Byte pipeline parity with word pipeline.** Both `buildEaBytePipeline` and `buildEaWidePipeline` handle `IndexImm{ImmName}` named-variable indices. No addressing cases silently fall through to broken materialisation paths.
