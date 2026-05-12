/**
 * Assembles {@link createEmitProgramContext} bundles from phase-1 wiring output.
 */

import type { AsmOperandNode } from '../frontend/ast.js';
import { evalImmExpr } from '../semantics/env.js';
import { sizeOfTypeExpr } from '../semantics/layout.js';
import { lowerFunctionDecl } from './functionLowering.js';
import {
  cloneEaExpr,
  cloneImmExpr,
  cloneOperand,
  flattenEaDottedName,
} from './asmUtils.js';
import { loadBinInput, loadHexInput } from './inputAssets.js';
import {
  diag,
  diagAt,
  diagAtWithId,
  diagAtWithSeverityAndId,
  warnAt,
} from './loweringDiagnostics.js';
import { createEmitProgramContext } from './emitProgramContext.js';
import { alignTo } from './sectionLayout.js';
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
    resolveScalarBinding,
    resolveScalarKind,
    resolveEaTypeExpr,
    resolveScalarTypeForEa,
    resolveScalarTypeForLd,
    resolveArrayType,
    typeDisplay,
    sameTypeShape,
    resolveEa,
    resolveAggregateType,
    buildEaWordPipeline,
    enforceEaRuntimeAtomBudget,
    enforceDirectCallSiteEaBudget,
    pushEaAddress,
    materializeEaAddressToHL,
    pushMemValue,
    pushImm16,
    pushZeroExtendedReg8,
    loadImm16ToHL,
    emitStepPipeline,
    emitScalarWordLoad,
    emitScalarWordStore,
    lowerLdWithEa,
    selectOpOverload,
    formatAsmOperandForOpDiag,
    normalizeFixedToken,
    reg8Names,
    reg16Names,
    activeSectionRef,
    codeOffsetRef,
    dataOffsetRef,
    varOffsetRef,
    advanceAlign,
    recordLoweredAsmItem,
    lowerImmExprForLoweredAsm,
    namedSectionSinksByNode,
    currentNamedSectionSinkRef,
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
      resolveScalarBinding,
      resolveScalarKind,
      resolveAggregateType,
      resolveEaTypeExpr,
      resolveScalarTypeForEa,
      resolveScalarTypeForLd,
      resolveArrayType,
      typeDisplay,
      sameTypeShape,
    },
    materialization: {
      resolveEa,
      buildEaWordPipeline,
      enforceEaRuntimeAtomBudget,
      enforceDirectCallSiteEaBudget,
      pushEaAddress,
      materializeEaAddressToHL,
      pushMemValue,
      pushImm16,
      pushZeroExtendedReg8,
      loadImm16ToHL,
      emitStepPipeline,
      emitScalarWordLoad,
      emitScalarWordStore,
      lowerLdWithEa,
    },
    storage: {
      stackSlotOffsets: ctx.workspace.storage.stackSlotOffsets,
      stackSlotTypes: ctx.workspace.storage.stackSlotTypes,
      localAliasTargets: ctx.workspace.storage.localAliasTargets,
      storageTypes: ctx.workspace.storage.storageTypes,
      moduleAliasTargets: ctx.workspace.storage.moduleAliasTargets,
      rawTypedCallWarningsEnabled: ctx.workspace.config.rawTypedCallWarningsEnabled,
    },
    callableResolution: {
      resolveCallable: ctx.workspace.callables.resolveVisibleCallable,
      resolveOpCandidates: ctx.workspace.callables.resolveVisibleOpCandidates,
      opStackPolicyMode: ctx.workspace.config.opStackPolicyMode,
    },
    opOverload: {
      formatAsmOperandForOpDiag,
      selectOpOverload,
      summarizeOpStackEffect: ctx.workspace.callables.summarizeOpStackEffect,
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
      localCallablesByFile: ctx.workspace.callables.localCallablesByFile,
      visibleCallables: ctx.workspace.callables.visibleCallables,
      localOpsByFile: ctx.workspace.callables.localOpsByFile,
      visibleOpsByName: ctx.workspace.callables.visibleOpsByName,
      declaredOpNames: ctx.workspace.callables.declaredOpNames,
      declaredBinNames: ctx.workspace.callables.declaredBinNames,
      deferredExterns: ctx.workspace.symbols.deferredExterns,
      storageTypes: ctx.workspace.storage.storageTypes,
      moduleAliasTargets: ctx.workspace.storage.moduleAliasTargets,
      moduleAliasDecls: ctx.workspace.storage.moduleAliasDecls,
      rawAddressSymbols: ctx.workspace.storage.rawAddressSymbols,
      absoluteSymbols: ctx.workspace.symbols.absoluteSymbols,
      symbols: ctx.workspace.symbols.symbols,
      dataBytes: ctx.workspace.emission.dataBytes,
      codeBytes: ctx.workspace.emission.codeBytes,
      hexBytes: ctx.workspace.emission.hexBytes,
      activeSectionRef,
      codeOffsetRef,
      dataOffsetRef,
      varOffsetRef,
      baseExprs: ctx.workspace.storage.baseExprs,
      advanceAlign,
      alignTo,
      loadBinInput,
      loadHexInput,
      resolveAggregateType,
      sizeOfTypeExpr: (typeExpr) => sizeOfTypeExpr(typeExpr, ctx.env, ctx.diagnostics),
      lowerFunctionDecl,
      recordLoweredAsmItem,
      lowerImmExprForLoweredAsm,
      namedSectionSinksByNode,
      currentNamedSectionSinkRef,
      currentCodeSegmentTagRef,
    },
  });

  return programLoweringContext;
}
