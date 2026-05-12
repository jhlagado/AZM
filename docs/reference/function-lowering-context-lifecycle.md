# FunctionLoweringContext Lifecycle (Current)

This document summarizes how `FunctionLoweringContext` is constructed and used across
lowering phases, with a focus on which fields are **constructed once**, **mutated during
frame setup**, and **consumed during body/call lowering**.

## Where the context is built

Construction path (read in order):

1. `emitProgramContext.ts` — groups input bundles.
2. `emitContextBuilder.ts` — builds concrete `FunctionLoweringContext` subcontexts.
3. `functionLowering.ts` — assembles the full context and coordinates per-function lowering.

The builder creates **component contexts** (diagnostics, symbols, emission, types, etc.),
then `lowerFunctionDecl` orchestrates use of those fields.

## Lifecycle phases

| Phase         | What happens                                                   | Primary file                                     |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| Construction  | Context fields wired from emit program bundles                 | `emitProgramContext.ts`, `emitContextBuilder.ts` |
| Frame setup   | Stack slots, alias targets, labels, preserve sets, SP tracking | `functionFrameSetup.ts`                          |
| Body lowering | ASM instruction lowering, control-flow lowering                | `functionLowering.ts`, `asmBodyOrchestration.ts` |
| Call lowering | Typed-call arguments, materialization, op expansion            | `functionCallLowering.ts`                        |

## Context family map

These families appear in `FunctionLoweringContext` (see `functionLowering.ts`).

### Diagnostics

- **Constructed once**: `diagnostics`, `diag`, `diagAt`, `diagAtWithId`, `diagAtWithSeverityAndId`, `warnAt`
- **Used in**: frame setup, body setup, call lowering, instruction lowering

### Symbols and trace

- **Constructed once**: `taken`, `pending`, `traceComment`, `traceLabel`
- **Mutated in frame setup**: labels + pending symbols
- **Mutated in body setup**: new labels, pending updates
- **Used in**: frame setup, body lowering, call lowering

### SP tracking

- **Constructed once**: `bindSpTracking`
- **Used in**: frame setup to attach tracking callbacks

### Emission

Read-only APIs used throughout body and call lowering:

- `getCodeOffset`
- `emitInstr`, `emitRawCodeBytes`
- `emitAbs16Fixup`, `emitAbs16FixupPrefixed`, `emitRel8Fixup`

### Conditions

- Condition opcode helpers and name mapping
- Used during control-flow lowering and branch emission

### Types

Scalar and EA typing helpers used by frame setup and call lowering:

- `evalImmExpr`, `env`
- `resolveScalarBinding`, `resolveScalarKind`
- `resolveEaTypeExpr`, `resolveScalarTypeForEa`, `resolveScalarTypeForLd`
- `resolveArrayType`, `typeDisplay`, `sameTypeShape`

### Materialization

Used primarily in call lowering and instruction lowering:

- `resolveEa`
- `buildEaWordPipeline`
- `enforceEaRuntimeAtomBudget`, `enforceDirectCallSiteEaBudget`
- `pushEaAddress`, `pushMemValue`, `pushImm16`, `pushZeroExtendedReg8`
- `materializeEaAddressToHL`, `emitStepPipeline`
- `emitScalarWordLoad`, `emitScalarWordStore`
- `lowerLdWithEa`

### Storage

- **Constructed once**: `stackSlotOffsets`, `stackSlotTypes`, `localAliasTargets`
- **Mutated in frame setup**: locals/aliases are populated and cleared per function
- **Read-only during body/call**: used for resolution and diagnostics
- **Global/shared inputs**: `storageTypes`, `moduleAliasTargets`, `rawTypedCallWarningsEnabled`

### Callable resolution

- `resolveCallable`, `resolveOpCandidates`, `opStackPolicyMode`
- Used during call lowering and op expansion

### Op overload selection

- `formatAsmOperandForOpDiag`, `selectOpOverload`, `summarizeOpStackEffect`
- Used in call lowering and op expansion

### AST utilities

- `cloneImmExpr`, `cloneEaExpr`, `cloneOperand`
- `flattenEaDottedName`, `normalizeFixedToken`
- Used in call lowering and asm rewriting

### Registers

- `reg8`, `reg16` — constant register sets for validation and matching

## Phase ownership (mutability summary)

| Field group          | Constructed        | Mutated                     | Read-only after     |
| -------------------- | ------------------ | --------------------------- | ------------------- |
| Diagnostics          | emit context build | append diagnostics          | never (append-only) |
| Symbols/trace        | emit context build | frame setup + body setup    | after body lowering |
| SP tracking          | emit context build | frame setup binds callbacks | after frame setup   |
| Storage maps         | emit context build | frame setup populates       | after frame setup   |
| Call materialization | emit context build | n/a (read-only)             | always read-only    |

## Narrowed seams you should know

The recent refactor split helper contexts to make future changes safer:

- `FunctionFrameSetupContext` — uses only typing/storage/symbols/emission/SP tracking.
- `FunctionCallMaterializationContext` — used inside `functionCallLowering.ts` for typed-call operands.

If you need to move/split fields, start in:

1. `emitProgramContext.ts` (bundle ownership)
2. `emitContextBuilder.ts` (component wiring)
3. `functionLowering.ts` (caller assembly)

## Related references

- `docs/reference/LOWERING-FLOW.md`
- `docs/reference/ld-lowering-flow.md`
- `docs/reference/ea-pipeline-flow.md`
