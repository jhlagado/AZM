# Lowering Subsystem Guide

This README is a **source-near** entrypoint for `src/lowering/`. It complements
`docs/reference/LOWERING-FLOW.md`, which is the phase-by-phase reference for the
pipeline.

## What lowering owns

Lowering turns the typed AST + semantic environment into:

- emitted bytes (code/data/hex maps)
- fixup queues and resolved symbols
- lowered ASM traces and placed ASM blocks

## Start here (new maintainers)

1. `docs/reference/LOWERING-FLOW.md` — end-to-end phase map.
2. `src/lowering/emit.ts` — pipeline entrypoint.
3. `src/lowering/emitPipeline.ts` — phase boundaries and handoffs.
4. `src/lowering/programLowering.ts` — prescan + module-level lowering.
5. `src/lowering/functionLowering.ts` — per-function lowering coordinator.

## Entry points and seams

| File                  | Why it matters                                         |
| --------------------- | ------------------------------------------------------ |
| `emit.ts`             | Top-level orchestration for lowering phases.           |
| `emitPipeline.ts`     | Defines prescan/lowering/finalization seams.           |
| `programLowering.ts`  | Module-level traversal, symbol setup, section offsets. |
| `functionLowering.ts` | Function body lowering and helper wiring.              |

## Subsystem groups (where to look)

### Pipeline + orchestration

- `emit.ts`, `emitPipeline.ts`
- `emitPhase1Workspace.ts`, `emitPhase1Helpers.ts`
- `emitProgramContext.ts`, `emitContextBuilder.ts`
- `emitState.ts`, `emissionCore.ts`, `fixupEmission.ts`

### Program-level lowering

- `programLowering.ts`
- `programLoweringTraversal.ts` (module item dispatch, including classic ASM80 directive dispatch)
- `programLoweringDeclarations.ts` (bin/raw decls, including classic ASM80 raw data)
- `programLoweringData.ts` (data blocks / initializers)
- `classicInstructionLowering.ts` (ASM80 instruction compatibility overlay)
- `classicEquResolution.ts` (classic ASM80 `EQU` alias resolution)
- `classicTraversalHelpers.ts` (classic ASM80 traversal/address helpers)
- `emitVisibility.ts` (callable/op visibility)

### Function-level lowering

- `functionLowering.ts`
- `functionFrameSetup.ts`
- `asmBodyOrchestration.ts`, `asmInstructionLowering.ts`, `asmRangeLowering.ts`
- `functionCallLowering.ts`

### EA resolution + addressing steps

- `eaResolution.ts`
- `eaMaterialization.ts`
- `addressingPipelines.ts`
- `steps.ts` (step pipeline library)

### LD lowering

- `ldLowering.ts`
- `ldFormSelection.ts`
- `ldEncoding.ts`
- `ldTransferPlan.ts`

### Finalization, placement, and artifacts

- `emitFinalization.ts`
- `programLoweringFinalize.ts`
- `sectionLayout.ts`
- `sectionContributions.ts`
- `sectionPlacement.ts`
- `loweredAsmPlacement.ts`, `loweredAsmByteEmission.ts`
- `startupInit.ts`

## Read order by task

- **Entry flow + handoffs**: `emit.ts` → `emitPipeline.ts` → `programLowering.ts`
- **Function lowering details**: `functionLowering.ts` → `functionFrameSetup.ts` → `asm*`
- **EA behavior**: `eaResolution.ts` → `eaMaterialization.ts` → `addressingPipelines.ts`
- **LD lowering**: `ldLowering.ts` → `ldFormSelection.ts` → `ldEncoding.ts`
- **Placement/fixups**: `emitFinalization.ts` → `sectionPlacement.ts` → `programLoweringFinalize.ts`

## Related references

- `docs/reference/LOWERING-FLOW.md`
- `docs/reference/addressing-steps-overview.md`
- `docs/reference/source-overview.md`
