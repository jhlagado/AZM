# Lowering Subsystem Guide

This README is a **source-near** entrypoint for `src/lowering/`. It is a map of
the current implementation, not an AZM language contract.

## What lowering owns

Lowering turns parsed source and semantic state into:

- emitted bytes (code/data/hex maps)
- fixup queues and resolved symbols
- lowered ASM traces and placed ASM blocks

## Start here (new maintainers)

1. `docs/reference/source-overview.md` — current source map.
2. `src/lowering/emit.ts` — pipeline entrypoint.
3. `src/lowering/emitPipeline.ts` — prescan/lowering/finalization boundaries.
4. `src/lowering/programLowering.ts` — prescan + program-level lowering.
5. `src/lowering/asm80InstructionLowering.ts` — ASM80 instruction compatibility overlay.

## Entry points and boundaries

| File                  | Why it matters                                      |
| --------------------- | --------------------------------------------------- |
| `emit.ts`             | Top-level orchestration for lowering phases.        |
| `emitPipeline.ts`     | Defines prescan, lowering, and finalization phases. |
| `programLowering.ts`  | Program traversal, symbol setup, section offsets.   |
| `functionLowering.ts` | Inherited ZAX function lowering under retirement.   |

## Subsystem groups (where to look)

### Pipeline + orchestration

- `emit.ts`, `emitPipeline.ts`
- `emitPhase1Workspace.ts`, `emitPhase1Helpers.ts`
- `emitProgramContext.ts`, `emitContextBuilder.ts`
- `emitState.ts`, `emissionCore.ts`, `fixupEmission.ts`

### Program-level lowering

- `programLowering.ts`
- `programLoweringTraversal.ts` (module item dispatch, including ASM directive dispatch)
- `programLoweringDeclarations.ts` (bin/raw decls, including ASM raw data)
- `asm80InstructionLowering.ts` (ASM80 instruction compatibility overlay)
- `asmEquResolution.ts` (ASM `EQU` alias resolution)
- `asmRawDataLowering.ts` (ASM raw data directive lowering)
- `asmDirectiveTraversal.ts` (assembler directive traversal/address helpers)
- `emitVisibility.ts` (callable/op visibility)

### Retiring ZAX function-level lowering

- `functionLowering.ts`
- `functionFrameSetup.ts`
- `asmBodyOrchestration.ts`, `asmInstructionLowering.ts`, `asmRangeLowering.ts`
- `functionCallLowering.ts`

These files are inherited ZAX implementation and are not part of the native AZM
surface. Keep changes narrowly scoped unless the work is explicitly removing or
quarantining high-level ZAX behavior.

### EA resolution + addressing steps

- `eaResolution.ts`
- `eaMaterialization.ts`
- `addressingPipelines.ts`
- `steps.ts` (step pipeline library)

### LD lowering

- `ldLowering.ts`
- `ldFormSelection.ts`
- `ldEncoding.ts`

### Finalization, placement, and artifacts

- `emitFinalization.ts`
- `programLoweringFinalize.ts`
- `sectionLayout.ts`
- `loweredAsmPlacement.ts`, `loweredAsmByteEmission.ts`
- `startupInit.ts`

## Read order by task

- **Entry flow + handoffs**: `emit.ts` → `emitPipeline.ts` → `programLowering.ts`
- **ASM80 source lowering**: `programLowering.ts` → `programLoweringTraversal.ts` → `asm80InstructionLowering.ts`
- **ZAX retirement details**: `functionLowering.ts` → `functionFrameSetup.ts` → `asm*`
- **EA behavior**: `eaResolution.ts` → `eaMaterialization.ts` → `addressingPipelines.ts`
- **LD lowering**: `ldLowering.ts` → `ldFormSelection.ts` → `ldEncoding.ts`
- **Placement/fixups**: `emitFinalization.ts` → `programLoweringFinalize.ts`

## Related references

- `docs/reference/addressing-steps-overview.md`
- `docs/reference/source-overview.md`
