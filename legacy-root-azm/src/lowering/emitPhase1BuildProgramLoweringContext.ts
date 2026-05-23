/**
 * Assembles {@link createEmitProgramContext} bundles from phase-1 wiring output.
 */

import type { AsmOperandNode } from '../frontend/ast.js';
import { evalImmExpr } from '../semantics/env.js';
import { sizeOfTypeExpr } from '../semantics/layout.js';
import { cloneEaExpr, cloneImmExpr, cloneOperand, flattenEaDottedName } from './asmUtils.js';
import { loadBinInput } from './inputAssets.js';
import {
  diag,
  diagAt,
  diagAtWithId,
  diagAtWithSeverityAndId,
  warnAt,
} from './loweringDiagnostics.js';
import { createEmitProgramContext } from './emitProgramContext.js';
import { alignTo } from './bytePlacement.js';
import type { EmitPhase1HelpersContext } from './emitPhase1Types.js';
import type { EmitPhase1WireResult } from './emitPhase1WirePipeline.js';

export function buildEmitProgramLoweringContext(
  ctx: EmitPhase1HelpersContext,
  wire: EmitPhase1WireResult,
): ReturnType<typeof createEmitProgramContext>['programLoweringContext'] {
  const {
    spTrackingSlot,
    getCurrentCodeOffset,
    traceComment,
    traceLabel,
    currentCodeSegmentTagRef,
    generatedLabelCounterRef,
    emitInstr,
    emitRawCodeBytes,
    emitAbs16Fixup,
    emitAbs16FixupPrefixed,
    emitRel8Fixup,
    callConditionOpcodeFromName,
    conditionNameFromOpcode,
    conditionOpcode,
    conditionOpcodeFromName,
    inverseConditionName,
    jrConditionOpcodeFromName,
    symbolicTargetFromExpr,
    resolveScalarKind,
    resolveEaTypeExpr,
    resolveArrayType,
    typeDisplay,
    sameTypeShape,
    resolveEa,
    resolveAggregateType,
    lowerLdWithEa,
    selectOpOverload,
    formatAsmOperandForOpDiag,
    normalizeFixedToken,
    reg8Names,
    reg16Names,
    activePlacementRef,
    codeOffsetRef,
    dataOffsetRef,
    advanceAlign,
    recordLoweredAsmItem,
    lowerImmExprForLoweredAsm,
  } = wire;

  const { programLoweringContext } = createEmitProgramContext({
    diagnostics: {
      diagnostics: ctx.diagnostics,
      diag,
      diagAt,
      diagAtWithId,
      diagAtWithSeverityAndId,
      warnAt,
    },
    symbolsAndTrace: {
      taken: ctx.workspace.symbols.taken,
      pending: ctx.workspace.symbols.pending,
      traceComment,
      traceLabel,
      currentCodeSegmentTagRef,
      generatedLabelCounterRef,
    },
    spTracking: {
      bindSpTracking: (
        callbacks?:
          | {
              applySpTracking: (headRaw: string, operands: AsmOperandNode[]) => void;
              invalidateSpTracking: () => void;
            }
          | undefined,
      ) => {
        if (callbacks?.applySpTracking) {
          spTrackingSlot.apply = callbacks.applySpTracking;
        } else {
          delete spTrackingSlot.apply;
        }
        if (callbacks?.invalidateSpTracking) {
          spTrackingSlot.invalidate = callbacks.invalidateSpTracking;
        } else {
          delete spTrackingSlot.invalidate;
        }
      },
    },
    emission: {
      getCodeOffset: getCurrentCodeOffset,
      emitInstr,
      emitRawCodeBytes,
      emitAbs16Fixup,
      emitAbs16FixupPrefixed,
      emitRel8Fixup,
    },
    conditions: {
      conditionOpcodeFromName,
      conditionNameFromOpcode,
      callConditionOpcodeFromName,
      jrConditionOpcodeFromName,
      conditionOpcode,
      inverseConditionName,
      symbolicTargetFromExpr,
    },
    types: {
      evalImmExpr,
      env: ctx.env,
      resolveScalarKind,
      resolveAggregateType,
      resolveEaTypeExpr,
      resolveArrayType,
      typeDisplay,
      sameTypeShape,
    },
    addressing: {
      resolveEa,
      lowerLdWithEa,
    },
    opResolution: {
      resolveOpCandidates: ctx.workspace.ops.resolveOpCandidatesForFile,
    },
    opOverload: {
      formatAsmOperandForOpDiag,
      selectOpOverload,
    },
    astUtilities: {
      cloneImmExpr,
      cloneEaExpr,
      cloneOperand,
      flattenEaDottedName,
      normalizeFixedToken,
    },
    registers: {
      reg8: reg8Names,
      reg16: reg16Names,
    },
    program: {
      program: ctx.program,
      includeDirs: ctx.workspace.config.includeDirs,
      localOpsByFile: ctx.workspace.ops.localOpsByFile,
      declaredOpNames: ctx.workspace.ops.declaredOpNames,
      absoluteSymbols: ctx.workspace.symbols.absoluteSymbols,
      symbols: ctx.workspace.symbols.symbols,
      dataBytes: ctx.workspace.emission.dataBytes,
      codeBytes: ctx.workspace.emission.codeBytes,
      activePlacementRef,
      codeOffsetRef,
      dataOffsetRef,
      baseExprs: ctx.workspace.placement.baseExprs,
      advanceAlign,
      alignTo,
      loadBinInput,
      resolveAggregateType,
      sizeOfTypeExpr: (typeExpr) => sizeOfTypeExpr(typeExpr, ctx.env, ctx.diagnostics),
      recordLoweredAsmItem,
      lowerImmExprForLoweredAsm,
      currentCodeSegmentTagRef,
    },
  });

  return programLoweringContext;
}
