/**
 * Split {@link FunctionLoweringSharedContext} into named slices (#1316).
 * Lives in its own module so {@link import('./functionLoweringPhases.js')} can import without a
 * circular runtime dependency on {@link import('./functionLowering.js')}.
 */

import type {
  FunctionLoweringComponentContexts,
  FunctionLoweringContext,
  FunctionLoweringSharedContext,
} from './functionLowering.js';

export function splitFunctionLoweringSharedContext(
  shared: FunctionLoweringSharedContext,
): FunctionLoweringComponentContexts {
  return {
    diagnostics: {
      diagnostics: shared.diagnostics,
      diag: shared.diag,
      diagAt: shared.diagAt,
      diagAtWithId: shared.diagAtWithId,
      diagAtWithSeverityAndId: shared.diagAtWithSeverityAndId,
      warnAt: shared.warnAt,
    },
    symbols: {
      taken: shared.taken,
      pending: shared.pending,
      traceComment: shared.traceComment,
      traceLabel: shared.traceLabel,
      currentCodeSegmentTagRef: shared.currentCodeSegmentTagRef,
      generatedLabelCounterRef: shared.generatedLabelCounterRef,
    },
    spTracking: { bindSpTracking: shared.bindSpTracking },
    emission: {
      getCodeOffset: shared.getCodeOffset,
      emitInstr: shared.emitInstr,
      emitRawCodeBytes: shared.emitRawCodeBytes,
      emitAbs16Fixup: shared.emitAbs16Fixup,
      emitAbs16FixupPrefixed: shared.emitAbs16FixupPrefixed,
      emitRel8Fixup: shared.emitRel8Fixup,
    },
    conditions: {
      conditionOpcodeFromName: shared.conditionOpcodeFromName,
      conditionNameFromOpcode: shared.conditionNameFromOpcode,
      callConditionOpcodeFromName: shared.callConditionOpcodeFromName,
      jrConditionOpcodeFromName: shared.jrConditionOpcodeFromName,
      conditionOpcode: shared.conditionOpcode,
      inverseConditionName: shared.inverseConditionName,
      symbolicTargetFromExpr: shared.symbolicTargetFromExpr,
    },
    types: {
      evalImmExpr: shared.evalImmExpr,
      env: shared.env,
      resolveScalarBinding: shared.resolveScalarBinding,
      resolveScalarKind: shared.resolveScalarKind,
      resolveAggregateType: shared.resolveAggregateType,
      resolveEaTypeExpr: shared.resolveEaTypeExpr,
      resolveScalarTypeForEa: shared.resolveScalarTypeForEa,
      resolveScalarTypeForLd: shared.resolveScalarTypeForLd,
      resolveArrayType: shared.resolveArrayType,
      typeDisplay: shared.typeDisplay,
      sameTypeShape: shared.sameTypeShape,
    },
    materialization: {
      resolveEa: shared.resolveEa,
      buildEaWordPipeline: shared.buildEaWordPipeline,
      enforceEaRuntimeAtomBudget: shared.enforceEaRuntimeAtomBudget,
      enforceDirectCallSiteEaBudget: shared.enforceDirectCallSiteEaBudget,
      pushEaAddress: shared.pushEaAddress,
      materializeEaAddressToHL: shared.materializeEaAddressToHL,
      pushMemValue: shared.pushMemValue,
      pushImm16: shared.pushImm16,
      pushZeroExtendedReg8: shared.pushZeroExtendedReg8,
      loadImm16ToHL: shared.loadImm16ToHL,
      emitStepPipeline: shared.emitStepPipeline,
      emitScalarWordLoad: shared.emitScalarWordLoad,
      emitScalarWordStore: shared.emitScalarWordStore,
      lowerLdWithEa: shared.lowerLdWithEa,
    },
    storage: {
      stackSlotOffsets: shared.stackSlotOffsets,
      stackSlotTypes: shared.stackSlotTypes,
      localAliasTargets: shared.localAliasTargets,
      storageTypes: shared.storageTypes,
      moduleAliasTargets: shared.moduleAliasTargets,
      rawTypedCallWarningsEnabled: shared.rawTypedCallWarningsEnabled,
    },
    callableResolution: {
      resolveCallable: shared.resolveCallable,
      resolveOpCandidates: shared.resolveOpCandidates,
      opStackPolicyMode: shared.opStackPolicyMode,
    },
    opOverload: {
      formatAsmOperandForOpDiag: shared.formatAsmOperandForOpDiag,
      selectOpOverload: shared.selectOpOverload,
      summarizeOpStackEffect: shared.summarizeOpStackEffect,
    },
    astUtilities: {
      cloneImmExpr: shared.cloneImmExpr,
      cloneEaExpr: shared.cloneEaExpr,
      cloneOperand: shared.cloneOperand,
      flattenEaDottedName: shared.flattenEaDottedName,
      normalizeFixedToken: shared.normalizeFixedToken,
    },
    registers: {
      reg8: shared.reg8,
      reg16: shared.reg16,
    },
  };
}

export function splitFunctionLoweringContext(
  ctx: FunctionLoweringContext,
): FunctionLoweringComponentContexts {
  const { item: _item, ...shared } = ctx;
  void _item;
  return splitFunctionLoweringSharedContext(shared);
}
