/**
 * Emit phase 1 wiring: type resolution, emit state, fixups, emission core, EA/op matching,
 * module-alias bootstrap, atom budgets, addressing, value materialization, LD lowering.
 */

import {
  LOAD_RP_EA,
  LOAD_RP_FVAR,
  LOAD_RP_GLOB,
  STORE_RP_EA,
  STORE_RP_FVAR,
  STORE_RP_GLOB,
  TEMPLATE_L_ABC,
  TEMPLATE_LW_HL,
  TEMPLATE_L_HL,
  TEMPLATE_L_DE,
  TEMPLATE_LW_BC,
  TEMPLATE_LW_DE,
  TEMPLATE_SW_DEBC,
  TEMPLATE_SW_HL,
  TEMPLATE_S_ANY,
  TEMPLATE_S_HL,
  type StepPipeline,
} from './emitStepImports.js';
import type { AsmInstructionNode, AsmOperandNode, ImmExprNode, SourceSpan } from '../frontend/ast.js';
import { evalImmExpr } from '../semantics/env.js';
import { sizeOfTypeExpr } from '../semantics/layout.js';
import { encodeInstruction } from '../z80/encode.js';
import { buildEaResolutionContext, createEaResolutionHelpers } from './eaResolution.js';
import { createEaMaterializationHelpers } from './eaMaterialization.js';
import { createAddressingPipelineBuilders } from './addressingPipelines.js';
import { createRuntimeImmediateHelpers } from './runtimeImmediates.js';
import { createRuntimeAtomBudgetHelpers } from './runtimeAtomBudget.js';
import { createScalarWordAccessorHelpers } from './scalarWordAccessors.js';
import { createLdLoweringHelpers } from './ldLowering.js';
import { createOpMatchingHelpers } from './opMatching.js';
import { createEmissionCoreHelpers } from './emissionCore.js';
import { createValueMaterializationHelpers } from './valueMaterialization.js';
import { createFixupEmissionHelpers } from './fixupEmission.js';
import { createAsmUtilityHelpers, flattenEaDottedName } from './asmUtils.js';
import { formatImmExprForAsm, formatIxDisp } from './traceFormat.js';
import { createTypeResolutionHelpers } from './typeResolution.js';
import { createEmitStateHelpers } from './emitState.js';
import { alignTo } from './sectionLayout.js';
import { diagAt } from './loweringDiagnostics.js';
import type { EmitPhase1HelpersContext } from './emitPhase1Types.js';
import { bootstrapModuleAliasStorageTypes } from './emitPhase1ModuleAliasBootstrap.js';

const REG8_NAMES = new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']);
const REG16_NAMES = new Set(['BC', 'DE', 'HL', 'IX', 'IY']);
const REG8_CODES = new Map([
  ['B', 0],
  ['C', 1],
  ['D', 2],
  ['E', 3],
  ['H', 4],
  ['L', 5],
  ['A', 7],
]);

/** Mutable slot so {@link buildEmitProgramLoweringContext} can wire SP tracking without closure over `let`. */
export type SpTrackingSlot = {
  apply?: (headRaw: string, operands: AsmOperandNode[]) => void;
  invalidate?: () => void;
};

/** Intermediate closures and bundles passed to {@link buildEmitProgramLoweringContext}. */
export type EmitPhase1WireResult = {
  spTrackingSlot: SpTrackingSlot;
  namedSectionSinks: ReturnType<typeof createEmitStateHelpers>['namedSectionSinks'];
  flushTrailingUserComments: ReturnType<typeof createEmitStateHelpers>['flushTrailingUserComments'];
  reg8Names: typeof REG8_NAMES;
  reg16Names: typeof REG16_NAMES;
  getCurrentCodeOffset: ReturnType<typeof createEmitStateHelpers>['getCurrentCodeOffset'];
  setCurrentCodeOffset: ReturnType<typeof createEmitStateHelpers>['setCurrentCodeOffset'];
  setCurrentCodeByte: ReturnType<typeof createEmitStateHelpers>['setCurrentCodeByte'];
  recordCodeSourceRange: ReturnType<typeof createEmitStateHelpers>['recordCodeSourceRange'];
  pushCurrentFixup: ReturnType<typeof createEmitStateHelpers>['pushCurrentFixup'];
  pushCurrentRel8Fixup: ReturnType<typeof createEmitStateHelpers>['pushCurrentRel8Fixup'];
  traceLabel: ReturnType<typeof createEmitStateHelpers>['traceLabel'];
  traceComment: ReturnType<typeof createEmitStateHelpers>['traceComment'];
  advanceAlign: ReturnType<typeof createEmitStateHelpers>['advanceAlign'];
  activeSectionRef: ReturnType<typeof createEmitStateHelpers>['activeSectionRef'];
  codeOffsetRef: ReturnType<typeof createEmitStateHelpers>['codeOffsetRef'];
  dataOffsetRef: ReturnType<typeof createEmitStateHelpers>['dataOffsetRef'];
  varOffsetRef: ReturnType<typeof createEmitStateHelpers>['varOffsetRef'];
  currentCodeSegmentTagRef: ReturnType<typeof createEmitStateHelpers>['currentCodeSegmentTagRef'];
  generatedLabelCounterRef: ReturnType<typeof createEmitStateHelpers>['generatedLabelCounterRef'];
  currentNamedSectionSinkRef: ReturnType<typeof createEmitStateHelpers>['currentNamedSectionSinkRef'];
  namedSectionSinksByNode: ReturnType<typeof createEmitStateHelpers>['namedSectionSinksByNode'];
  recordLoweredAsmItem: ReturnType<typeof createEmitStateHelpers>['recordLoweredAsmItem'];
  lowerImmExprForLoweredAsm: ReturnType<typeof createEmitStateHelpers>['lowerImmExprForLoweredAsm'];
  lowerOperandForLoweredAsm: ReturnType<typeof createEmitStateHelpers>['lowerOperandForLoweredAsm'];
  emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
  emitRawCodeBytes: (bs: Uint8Array, file: string, traceText: string) => void;
  emitStepPipeline: (pipe: StepPipeline, span: SourceSpan) => boolean;
  loadImm16ToDE: ReturnType<typeof createRuntimeImmediateHelpers>['loadImm16ToDE'];
  loadImm16ToHL: ReturnType<typeof createRuntimeImmediateHelpers>['loadImm16ToHL'];
  negateHL: ReturnType<typeof createRuntimeImmediateHelpers>['negateHL'];
  pushImm16: ReturnType<typeof createRuntimeImmediateHelpers>['pushImm16'];
  pushZeroExtendedReg8: ReturnType<typeof createRuntimeImmediateHelpers>['pushZeroExtendedReg8'];
  callConditionOpcodeFromName: ReturnType<typeof createFixupEmissionHelpers>['callConditionOpcodeFromName'];
  conditionNameFromOpcode: ReturnType<typeof createFixupEmissionHelpers>['conditionNameFromOpcode'];
  conditionOpcode: ReturnType<typeof createFixupEmissionHelpers>['conditionOpcode'];
  conditionOpcodeFromName: ReturnType<typeof createFixupEmissionHelpers>['conditionOpcodeFromName'];
  emitAbs16Fixup: ReturnType<typeof createFixupEmissionHelpers>['emitAbs16Fixup'];
  emitAbs16FixupEd: ReturnType<typeof createFixupEmissionHelpers>['emitAbs16FixupEd'];
  emitAbs16FixupPrefixed: ReturnType<typeof createFixupEmissionHelpers>['emitAbs16FixupPrefixed'];
  emitRel8Fixup: ReturnType<typeof createFixupEmissionHelpers>['emitRel8Fixup'];
  inverseConditionName: ReturnType<typeof createFixupEmissionHelpers>['inverseConditionName'];
  jrConditionOpcodeFromName: ReturnType<typeof createFixupEmissionHelpers>['jrConditionOpcodeFromName'];
  symbolicTargetFromExpr: ReturnType<typeof createFixupEmissionHelpers>['symbolicTargetFromExpr'];
  normalizeFixedToken: ReturnType<typeof createAsmUtilityHelpers>['normalizeFixedToken'];
  resolveEa: ReturnType<typeof createEaResolutionHelpers>['resolveEa'];
  selectOpOverload: ReturnType<typeof createOpMatchingHelpers>['selectOpOverload'];
  formatAsmOperandForOpDiag: ReturnType<typeof createOpMatchingHelpers>['formatAsmOperandForOpDiag'];
  enforceDirectCallSiteEaBudget: ReturnType<typeof createRuntimeAtomBudgetHelpers>['enforceDirectCallSiteEaBudget'];
  enforceEaRuntimeAtomBudget: ReturnType<typeof createRuntimeAtomBudgetHelpers>['enforceEaRuntimeAtomBudget'];
  buildEaBytePipeline: ReturnType<typeof createAddressingPipelineBuilders>['buildEaBytePipeline'];
  buildEaWordPipeline: ReturnType<typeof createAddressingPipelineBuilders>['buildEaWordPipeline'];
  emitScalarWordLoad: ReturnType<typeof createScalarWordAccessorHelpers>['emitScalarWordLoad'];
  emitScalarWordStore: ReturnType<typeof createScalarWordAccessorHelpers>['emitScalarWordStore'];
  scalarKindOfResolution: ReturnType<typeof createScalarWordAccessorHelpers>['scalarKindOfResolution'];
  isWordCompatibleScalarKind: ReturnType<typeof createScalarWordAccessorHelpers>['isWordCompatibleScalarKind'];
  canUseScalarWordAccessor: ReturnType<typeof createScalarWordAccessorHelpers>['canUseScalarWordAccessor'];
  emitLoadWordFromHlAddress: ReturnType<typeof createValueMaterializationHelpers>['emitLoadWordFromHlAddress'];
  emitStoreSavedHlToEa: ReturnType<typeof createValueMaterializationHelpers>['emitStoreSavedHlToEa'];
  emitStoreWordToHlAddress: ReturnType<typeof createValueMaterializationHelpers>['emitStoreWordToHlAddress'];
  pushEaAddress: ReturnType<typeof createValueMaterializationHelpers>['pushEaAddress'];
  pushMemValue: ReturnType<typeof createValueMaterializationHelpers>['pushMemValue'];
  materializeEaAddressToHL: ReturnType<typeof createEaMaterializationHelpers>['materializeEaAddressToHL'];
  lowerLdWithEa: ReturnType<typeof createLdLoweringHelpers>['lowerLdWithEa'];
  resolveAggregateType: ReturnType<typeof createTypeResolutionHelpers>['resolveAggregateType'];
  resolvePointedToType: ReturnType<typeof createTypeResolutionHelpers>['resolvePointedToType'];
  resolveScalarBinding: ReturnType<typeof createTypeResolutionHelpers>['resolveScalarBinding'];
  resolveScalarKind: ReturnType<typeof createTypeResolutionHelpers>['resolveScalarKind'];
  resolveEaTypeExpr: ReturnType<typeof createTypeResolutionHelpers>['resolveEaTypeExpr'];
  resolveScalarTypeForEa: ReturnType<typeof createTypeResolutionHelpers>['resolveScalarTypeForEa'];
  resolveScalarTypeForLd: ReturnType<typeof createTypeResolutionHelpers>['resolveScalarTypeForLd'];
  resolveArrayType: ReturnType<typeof createTypeResolutionHelpers>['resolveArrayType'];
  typeDisplay: ReturnType<typeof createTypeResolutionHelpers>['typeDisplay'];
  sameTypeShape: ReturnType<typeof createTypeResolutionHelpers>['sameTypeShape'];
};

export function wireEmitPhase1Helpers(ctx: EmitPhase1HelpersContext): EmitPhase1WireResult {
  const spTrackingSlot: SpTrackingSlot = {};

  let emitCodeBytes: (bs: Uint8Array, file: string) => void;
  let emitRawCodeBytes: (bs: Uint8Array, file: string, traceText: string) => void;
  let emitStepPipeline: (pipe: StepPipeline, span: SourceSpan) => boolean;

  const {
    resolveAggregateType,
    resolvePointedToType,
    resolveArrayType,
    resolveEaTypeExpr,
    resolveScalarBinding,
    resolveScalarKind,
    resolveScalarTypeForEa,
    resolveScalarTypeForLd,
    sameTypeShape,
    typeDisplay,
  } = createTypeResolutionHelpers({
    env: ctx.env,
    storageTypes: ctx.workspace.storage.storageTypes,
    stackSlotTypes: ctx.workspace.storage.stackSlotTypes,
    rawAddressSymbols: ctx.workspace.storage.rawAddressSymbols,
    moduleAliasTargets: ctx.workspace.storage.moduleAliasTargets,
    getLocalAliasTargets: () => ctx.workspace.storage.localAliasTargets,
  });

  const evalImmNoDiag = (expr: ImmExprNode): number | undefined => {
    const scratch: import('../diagnosticTypes.js').Diagnostic[] = [];
    return evalImmExpr(expr, ctx.env, scratch);
  };

  const {
    namedSectionSinks,
    namedSectionSinksByNode,
    activeSectionRef,
    codeOffsetRef,
    dataOffsetRef,
    varOffsetRef,
    currentCodeSegmentTagRef,
    generatedLabelCounterRef,
    currentNamedSectionSinkRef,
    getCurrentCodeOffset,
    setCurrentCodeOffset,
    setCurrentCodeByte,
    pushCurrentFixup,
    pushCurrentRel8Fixup,
    recordCodeSourceRange,
    traceLabel,
    traceComment,
    advanceAlign,
    flushTrailingUserComments,
    lowerImmExprForLoweredAsm,
    lowerOperandForLoweredAsm,
    recordLoweredAsmItem,
  } = createEmitStateHelpers({
    ...(ctx.options?.namedSectionKeys ? { namedSectionKeys: ctx.options.namedSectionKeys } : {}),
    ...(ctx.options?.sourceTexts ? { sourceTexts: ctx.options.sourceTexts } : {}),
    ...(ctx.options?.sourceLineComments ? { sourceLineComments: ctx.options.sourceLineComments } : {}),
    codeBytes: ctx.workspace.emission.codeBytes,
    codeSourceSegments: ctx.workspace.emission.codeSourceSegments,
    fixups: ctx.workspace.symbols.fixups,
    rel8Fixups: ctx.workspace.symbols.rel8Fixups,
    loweredAsmStream: ctx.workspace.emission.loweredAsmStream,
    loweredAsmBlocksByKey: ctx.workspace.emission.loweredAsmBlocksByKey,
    alignTo,
    evalImmNoDiag,
    symbolicTargetFromExpr: (expr) => symbolicTargetFromExpr(expr),
    formatImmExprForAsm,
    typeDisplay: (typeExpr) => typeDisplay(typeExpr),
  });

  const emitInstr = (head: string, operands: AsmOperandNode[], span: SourceSpan) => {
    const syntheticInstruction: AsmInstructionNode = {
      kind: 'AsmInstruction',
      span,
      head,
      operands,
    };
    const encoded = encodeInstruction(syntheticInstruction, ctx.env, ctx.diagnostics);
    if (!encoded) return false;
    recordLoweredAsmItem(
      {
        kind: 'instr',
        head,
        operands: operands.map((op) => lowerOperandForLoweredAsm(op)),
        bytes: [...encoded],
      },
      span,
    );
    emitCodeBytes(encoded, span.file);
    spTrackingSlot.apply?.(head, operands);
    return true;
  };

  const { loadImm16ToDE, loadImm16ToHL, negateHL, pushImm16, pushZeroExtendedReg8 } =
    createRuntimeImmediateHelpers({
      emitInstr,
    });

  const {
    callConditionOpcodeFromName,
    conditionNameFromOpcode,
    conditionOpcode,
    conditionOpcodeFromName,
    emitAbs16Fixup,
    emitAbs16FixupEd,
    emitAbs16FixupPrefixed,
    emitRel8Fixup,
    inverseConditionName,
    jrConditionOpcodeFromName,
    symbolicTargetFromExpr,
  } = createFixupEmissionHelpers({
    getCodeOffset: getCurrentCodeOffset,
    setCodeOffset: setCurrentCodeOffset,
    setCodeByte: setCurrentCodeByte,
    recordCodeSourceRange,
    pushFixup: pushCurrentFixup,
    pushRel8Fixup: pushCurrentRel8Fixup,
    traceInstruction: (_offset, _bytesOut, _text) => {},
    recordLoweredInstr: (bytes, _asmText, span) => {
      recordLoweredAsmItem(
        {
          kind: 'instr',
          head: '@raw',
          operands: [],
          bytes: [...bytes],
        },
        span,
      );
    },
    evalImmExpr: (expr) => evalImmExpr(expr, ctx.env, ctx.diagnostics),
  });

  ({ emitCodeBytes, emitRawCodeBytes, emitStepPipeline } = createEmissionCoreHelpers({
    getCodeOffset: getCurrentCodeOffset,
    setCodeOffset: setCurrentCodeOffset,
    setCodeByte: setCurrentCodeByte,
    recordCodeSourceRange,
    traceInstruction: (_offset, _bytesOut, _text) => {},
    emitInstr: (head, operands, span) => emitInstr(head, operands, span),
    loadImm16ToDE: (value, span) => loadImm16ToDE(value, span),
    loadImm16ToHL: (value, span) => loadImm16ToHL(value, span),
    emitAbs16Fixup,
    emitAbs16FixupEd,
  }));

  const emitRawCodeBytesImpl = emitRawCodeBytes;
  emitRawCodeBytes = (bs: Uint8Array, file: string, traceText: string): void => {
    recordLoweredAsmItem({ kind: 'instr', head: '@raw', operands: [], bytes: [...bs] });
    emitRawCodeBytesImpl(bs, file, traceText);
  };

  const { normalizeFixedToken } = createAsmUtilityHelpers({
    isEnumName: (name) => ctx.env.enums.has(name),
  });

  const { resolveEa } = createEaResolutionHelpers(
    buildEaResolutionContext({
      env: ctx.env,
      diagnostics: ctx.diagnostics,
      diagAt,
      workspace: {
        stackSlotOffsets: ctx.workspace.storage.stackSlotOffsets,
        stackSlotTypes: ctx.workspace.storage.stackSlotTypes,
        storageTypes: ctx.workspace.storage.storageTypes,
        moduleAliasTargets: ctx.workspace.storage.moduleAliasTargets,
        localAliasTargets: ctx.workspace.storage.localAliasTargets,
      },
      resolveScalarKind,
      resolveAggregateType,
      resolvePointedToType,
      resolveEaTypeExpr,
      evalImmNoDiag,
    }),
  );

  const isIxIyIndexedMem = (op: AsmOperandNode): boolean =>
    op.kind === 'Mem' &&
    ((op.expr.kind === 'EaName' && /^(IX|IY)$/i.test(op.expr.name)) ||
      ((op.expr.kind === 'EaAdd' || op.expr.kind === 'EaSub') &&
        op.expr.base.kind === 'EaName' &&
        /^(IX|IY)$/i.test(op.expr.base.name)));
  const inferMemWidth = (op: AsmOperandNode): number | undefined => {
    if (op.kind !== 'Mem') return undefined;
    const resolved = resolveEa(op.expr, op.span);
    if (!resolved?.typeExpr) return undefined;
    return sizeOfTypeExpr(resolved.typeExpr, ctx.env, ctx.diagnostics);
  };

  const { selectOpOverload, formatAsmOperandForOpDiag } = createOpMatchingHelpers({
    reg8: REG8_NAMES,
    isIxIyIndexedMem,
    flattenEaDottedName,
    isEnumName: (name) => ctx.env.enums.has(name),
    normalizeFixedToken,
    conditionOpcodeFromName,
    evalImmNoDiag,
    inferMemWidth,
  });

  bootstrapModuleAliasStorageTypes(ctx, resolveEaTypeExpr);

  const { enforceDirectCallSiteEaBudget, enforceEaRuntimeAtomBudget } =
    createRuntimeAtomBudgetHelpers({
      diagnostics: ctx.diagnostics,
      diagAt,
      resolveScalarBinding,
      stackSlotOffsets: ctx.workspace.storage.stackSlotOffsets,
      stackSlotTypes: ctx.workspace.storage.stackSlotTypes,
      storageTypes: ctx.workspace.storage.storageTypes,
    });

  const { buildEaBytePipeline, buildEaWordPipeline } = createAddressingPipelineBuilders({
    diagnostics: ctx.diagnostics,
    diagAt,
    reg8: REG8_NAMES,
    resolveEa,
    resolveEaTypeExpr,
    resolveScalarBinding,
    resolveScalarKind,
    sizeOfTypeExpr: (typeExpr) => sizeOfTypeExpr(typeExpr, ctx.env, ctx.diagnostics),
    evalImmExpr: (expr) => evalImmExpr(expr, ctx.env, ctx.diagnostics),
  });

  const {
    emitScalarWordLoad,
    emitScalarWordStore,
    scalarKindOfResolution,
    isWordCompatibleScalarKind,
    canUseScalarWordAccessor,
  } = createScalarWordAccessorHelpers({
    emitStepPipeline,
    resolveScalarKind,
    resolveAggregateType,
  });

  const {
    emitLoadWordFromHlAddress,
    emitStoreSavedHlToEa,
    emitStoreWordToHlAddress,
    pushEaAddress,
    pushMemValue,
  } = createValueMaterializationHelpers({
    diagnostics: ctx.diagnostics,
    diagAt,
    reg8: REG8_NAMES,
    resolveEa,
    resolveEaTypeExpr,
    resolveAggregateType,
    resolveScalarBinding,
    resolveScalarKind,
    sizeOfTypeExpr: (typeExpr) => sizeOfTypeExpr(typeExpr, ctx.env, ctx.diagnostics),
    evalImmExpr: (expr) => evalImmExpr(expr, ctx.env, ctx.diagnostics),
    evalImmNoDiag,
    emitInstr,
    emitRawCodeBytes,
    emitAbs16Fixup,
    loadImm16ToDE,
    loadImm16ToHL,
    negateHL,
    pushZeroExtendedReg8,
    emitStepPipeline,
    buildEaBytePipeline,
    buildEaWordPipeline,
    emitScalarWordLoad,
    formatIxDisp,
    TEMPLATE_L_ABC,
    TEMPLATE_LW_DE,
    LOAD_RP_EA,
    STORE_RP_EA,
  });

  const { materializeEaAddressToHL } = createEaMaterializationHelpers({
    resolveEa,
    pushEaAddress,
    emitInstr,
    emitAbs16Fixup,
    loadImm16ToDE,
  });

  const { lowerLdWithEa } = createLdLoweringHelpers({
    LOAD_RP_FVAR,
    LOAD_RP_GLOB,
    STORE_RP_FVAR,
    STORE_RP_GLOB,
    TEMPLATE_L_ABC,
    TEMPLATE_L_DE,
    TEMPLATE_L_HL,
    TEMPLATE_LW_BC,
    TEMPLATE_LW_DE,
    TEMPLATE_LW_HL,
    TEMPLATE_S_ANY,
    TEMPLATE_S_HL,
    TEMPLATE_SW_DEBC,
    TEMPLATE_SW_HL,
    buildEaBytePipeline,
    buildEaWordPipeline,
    canUseScalarWordAccessor,
    diagAt,
    diagnostics: ctx.diagnostics,
    emitAbs16Fixup,
    emitAbs16FixupEd,
    emitAbs16FixupPrefixed,
    emitInstr,
    emitLoadWordFromHlAddress,
    emitRawCodeBytes,
    emitScalarWordLoad,
    emitScalarWordStore,
    emitStepPipeline,
    emitStoreSavedHlToEa,
    emitStoreWordToHlAddress,
    env: ctx.env,
    evalImmExpr: (expr: ImmExprNode) => evalImmExpr(expr, ctx.env, ctx.diagnostics),
    formatIxDisp,
    isWordCompatibleScalarKind,
    loadImm16ToHL,
    materializeEaAddressToHL,
    reg8Code: REG8_CODES,
    resolveEa,
    resolveScalarBinding,
    resolveScalarKind,
    resolveScalarTypeForEa,
    resolveScalarTypeForLd,
    scalarKindOfResolution,
    setSpTrackingInvalid: () => {
      spTrackingSlot.invalidate?.();
    },
    stackSlotOffsets: ctx.workspace.storage.stackSlotOffsets,
    storageTypes: ctx.workspace.storage.storageTypes,
  });

  return {
    spTrackingSlot,
    namedSectionSinks,
    flushTrailingUserComments,
    reg8Names: REG8_NAMES,
    reg16Names: REG16_NAMES,
    getCurrentCodeOffset,
    setCurrentCodeOffset,
    setCurrentCodeByte,
    recordCodeSourceRange,
    pushCurrentFixup,
    pushCurrentRel8Fixup,
    traceLabel,
    traceComment,
    advanceAlign,
    activeSectionRef,
    codeOffsetRef,
    dataOffsetRef,
    varOffsetRef,
    currentCodeSegmentTagRef,
    generatedLabelCounterRef,
    currentNamedSectionSinkRef,
    namedSectionSinksByNode,
    recordLoweredAsmItem,
    lowerImmExprForLoweredAsm,
    lowerOperandForLoweredAsm,
    emitInstr,
    emitRawCodeBytes,
    emitStepPipeline,
    loadImm16ToDE,
    loadImm16ToHL,
    negateHL,
    pushImm16,
    pushZeroExtendedReg8,
    callConditionOpcodeFromName,
    conditionNameFromOpcode,
    conditionOpcode,
    conditionOpcodeFromName,
    emitAbs16Fixup,
    emitAbs16FixupEd,
    emitAbs16FixupPrefixed,
    emitRel8Fixup,
    inverseConditionName,
    jrConditionOpcodeFromName,
    symbolicTargetFromExpr,
    normalizeFixedToken,
    resolveEa,
    selectOpOverload,
    formatAsmOperandForOpDiag,
    enforceDirectCallSiteEaBudget,
    enforceEaRuntimeAtomBudget,
    buildEaBytePipeline,
    buildEaWordPipeline,
    emitScalarWordLoad,
    emitScalarWordStore,
    scalarKindOfResolution,
    isWordCompatibleScalarKind,
    canUseScalarWordAccessor,
    emitLoadWordFromHlAddress,
    emitStoreSavedHlToEa,
    emitStoreWordToHlAddress,
    pushEaAddress,
    pushMemValue,
    materializeEaAddressToHL,
    lowerLdWithEa,
    resolveAggregateType,
    resolvePointedToType,
    resolveScalarBinding,
    resolveScalarKind,
    resolveEaTypeExpr,
    resolveScalarTypeForEa,
    resolveScalarTypeForLd,
    resolveArrayType,
    typeDisplay,
    sameTypeShape,
  };
}
