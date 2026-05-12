# Addressing step library (`src/lowering/steps.ts`)

Status: non-normative map of the step-pipeline DSL. The source of truth is the TypeScript module.
This page explains how the step library is structured and how it is used by the EA pipeline.

**Typical register roles:** `DE` holds a base address, `HL` holds an index or computed EA after
`CALC_EA` / `CALC_EA_WIDE`. Templates save/restore registers around nested EA work so that callers
can treat pipelines as pure.

Related docs:

- `docs/reference/ea-pipeline-flow.md`
- `docs/reference/LOWERING-FLOW.md`

---

## 1. What a step pipeline is

A **step pipeline** is a pure list of micro-ops (`StepInstr[]`) that represents a reusable
addressing sequence. Pipelines are composed in `addressingPipelines.ts` based on an EA shape and
element size, then embedded into templates that load/store bytes or words.

`steps.ts` owns:

- the `StepInstr` DSL (push/pop, loads, IX+disp, etc)
- pure helpers that return `StepPipeline`
- small render helpers for tests and doc validation

Pipelines are chosen when the EA can be expressed as:

- a base in `DE` (`LOAD_BASE_*`)
- an index in `HL` (`LOAD_IDX_*`)
- a combination step (`CALC_EA*`)

When a pipeline cannot be built, lowering falls back to materializing an address into `HL` via
`eaMaterialization.ts` and uses general load/store paths.

---

## 2. Pipeline families and ownership

### Types and rendering

- `StepInstr`, `StepPipeline`
- `renderStepInstr`, `renderStepPipeline` (pseudo-assembly, tests only)

### Save/restore and exchange

- `SAVE_HL`, `SAVE_DE`, `RESTORE_HL`, `RESTORE_DE`, `SWAP_HL_DE`

### Base loaders (DE = base)

- `LOAD_BASE_GLOB`, `LOAD_BASE_FVAR`

### Index loaders (HL = index)

- `LOAD_IDX_CONST`, `LOAD_IDX_REG`, `LOAD_IDX_RP`, `LOAD_IDX_GLOB`, `LOAD_IDX_FVAR`

### Combine (HL + DE → EA)

- `CALC_EA` (byte stride)
- `CALC_EA_2`, `CALC_EA_WIDE` (scaled index; may emit shift or exact multiply)

### Direct accessors

- Byte at EA in `HL`: `LOAD_REG_EA`, `STORE_REG_EA`, plus reg↔glob helpers
- Word at EA: `LOAD_RP_EA`, `STORE_RP_EA`, `STORE_RP_EA_FROM_STACK`, plus glob/fvar helpers

### EA builders (`EA_*` / `EAW_*`)

Named for **base × index** shape:

- base: `GLOB` or `FVAR`
- index: `CONST`, `REG`, `RP`, `GLOB`, `FVAR`
- `EA_*` uses byte stride
- `EAW_*` uses `CALC_EA_WIDE` (default `elemSize = 2`)

### Templates

Wrap an inner `ea: StepPipeline` with saves/restores and the right load/store:

- Byte load: `TEMPLATE_L_ABC`, `TEMPLATE_L_HL`, `TEMPLATE_L_DE`
- Byte store: `TEMPLATE_S_ANY`, `TEMPLATE_S_HL`
- Word load: `TEMPLATE_LW_HL`, `TEMPLATE_LW_DE`, `TEMPLATE_LW_BC`
- Word store: `TEMPLATE_SW_DEBC`, `TEMPLATE_SW_HL`

---

## 3. When pipelines are chosen

`addressingPipelines.ts` is the entrypoint for selecting pipelines. It chooses a pipeline when:

- the EA resolves to `abs` or `stack` (not `indirect`)
- index types are supported (`IndexImm`, `IndexReg8`, `IndexReg16`, `IndexEa`)
- element sizes are known and valid for `CALC_EA_WIDE`

If these conditions fail, lowering falls back to address materialization (`eaMaterialization.ts`)
and uses a more general load/store route.

---

## 4. Worked examples

These examples show the **step pipeline** pieces, not the full lowering call sites.

### Example A: Stack slot byte access

Load a byte from a frame slot at `fvar = -4` into `A`.

```ts
const ea = EA_FVAR_CONST(-4, 0);
const pipeline = TEMPLATE_L_ABC('A', ea);
```

Shape: base in `DE` from IX+disp, index constant `0` in `HL`, `CALC_EA`, then `LOAD_REG_EA`.

### Example B: Stack slot word access

Load a word from a frame slot at `fvar = -6` into `HL`.

```ts
const ea = EAW_FVAR_CONST(-6, 0, 2);
const pipeline = TEMPLATE_LW_HL(ea);
```

Uses `CALC_EA_WIDE(2)` so `HL` ends at the word address before `LOAD_RP_EA`.

### Example C: Absolute symbol + constant offset

Load a byte at `glob + 3` into `C`.

```ts
const ea = EA_GLOB_CONST('glob', 3);
const pipeline = TEMPLATE_L_ABC('C', ea);
```

Base comes from `LOAD_BASE_GLOB`, index is `LOAD_IDX_CONST(3)`.

### Example D: Indexed array access with byte index

Load `array[a]` where `array` is a global byte array and `a` is a reg8 index.

```ts
const ea = EA_GLOB_REG('array', 'a');
const pipeline = TEMPLATE_L_ABC('B', ea);
```

Index `a` is widened into `HL` via `LOAD_IDX_REG`.

### Example E: Pipeline not available (fallback to materialization)

If an EA resolves to `indirect` (or the index type/size is not supported), pipelines are skipped.
Lowering materializes the EA into `HL` using `eaMaterialization.ts`, then uses generic loads/stores.

---

## 5. Debugging map

Start here when something is off:

1. `src/lowering/addressingPipelines.ts` — selection logic and which pipeline is used.
2. `src/lowering/steps.ts` — exact pipeline definition and register effects.
3. `src/lowering/eaResolution.ts` — why an EA resolved to `abs`/`stack`/`indirect`.
4. `src/lowering/eaMaterialization.ts` — fallback path when a pipeline is not available.

---

## 6. In-file section markers

`steps.ts` uses `// --- Section: … ---` comments aligned with the groups above. For the exact
export list, search by prefix (`EA_`, `EAW_`, `TEMPLATE_`, …) or follow those section headers.
