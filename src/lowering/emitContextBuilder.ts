/**
 * Emit ↔ lowering context wiring (#1084, #1316)
 *
 * Assembler-lowering state is passed as {@link import('./assemblerLoweringContext.js').AssemblerLoweringComponentContexts}
 * — twelve named slices that merge into {@link import('./assemblerLoweringContext.js').AssemblerLoweringSharedContext}.
 * Program-level fields stay on {@link EmitProgramLoweringContextInputs}.
 */

import type {
  AssemblerLoweringComponentContexts,
  AssemblerLoweringSharedContext,
  AssemblerLoweringSymbolContext,
} from './assemblerLoweringContext.js';
import { mergeAssemblerLoweringSharedContext } from './assemblerLoweringContext.js';
import type { Context as ProgramLoweringContext } from './programLowering.js';

/**
 * Program-level fields for {@link createProgramLoweringContext} (merged with shared assembler-lowering hooks).
 */
export type EmitProgramLoweringContextInputs = {
  /** @inheritdoc ProgramLoweringContext */
  program: ProgramLoweringContext['program'];
  /** @inheritdoc ProgramLoweringContext */
  includeDirs: ProgramLoweringContext['includeDirs'];
  /** @inheritdoc ProgramLoweringContext */
  localOpsByFile: ProgramLoweringContext['localOpsByFile'];
  /** @inheritdoc ProgramLoweringContext */
  visibleOpsByName: ProgramLoweringContext['visibleOpsByName'];
  /** @inheritdoc ProgramLoweringContext */
  declaredOpNames: ProgramLoweringContext['declaredOpNames'];
  /** @inheritdoc ProgramLoweringContext */
  deferredExterns: ProgramLoweringContext['deferredExterns'];
  /** @inheritdoc ProgramLoweringContext */
  storageTypes: ProgramLoweringContext['storageTypes'];
  /** @inheritdoc ProgramLoweringContext */
  rawAddressSymbols: ProgramLoweringContext['rawAddressSymbols'];
  /** @inheritdoc ProgramLoweringContext */
  absoluteSymbols: ProgramLoweringContext['absoluteSymbols'];
  /** @inheritdoc ProgramLoweringContext */
  symbols: ProgramLoweringContext['symbols'];
  /** @inheritdoc ProgramLoweringContext */
  dataBytes: ProgramLoweringContext['dataBytes'];
  /** @inheritdoc ProgramLoweringContext */
  codeBytes: ProgramLoweringContext['codeBytes'];
  /** @inheritdoc ProgramLoweringContext */
  activeSectionRef: ProgramLoweringContext['activeSectionRef'];
  /** @inheritdoc ProgramLoweringContext */
  codeOffsetRef: ProgramLoweringContext['codeOffsetRef'];
  /** @inheritdoc ProgramLoweringContext */
  dataOffsetRef: ProgramLoweringContext['dataOffsetRef'];
  /** @inheritdoc ProgramLoweringContext */
  varOffsetRef: ProgramLoweringContext['varOffsetRef'];
  /** @inheritdoc ProgramLoweringContext */
  baseExprs: ProgramLoweringContext['baseExprs'];
  /** @inheritdoc ProgramLoweringContext */
  advanceAlign: ProgramLoweringContext['advanceAlign'];
  /** @inheritdoc ProgramLoweringContext */
  alignTo: ProgramLoweringContext['alignTo'];
  /** @inheritdoc ProgramLoweringContext */
  loadBinInput: ProgramLoweringContext['loadBinInput'];
  /** @inheritdoc ProgramLoweringContext */
  resolveAggregateType: ProgramLoweringContext['resolveAggregateType'];
  /** @inheritdoc ProgramLoweringContext */
  sizeOfTypeExpr: ProgramLoweringContext['sizeOfTypeExpr'];
  /** @inheritdoc ProgramLoweringContext */
  recordLoweredAsmItem: ProgramLoweringContext['recordLoweredAsmItem'];
  /** @inheritdoc ProgramLoweringContext */
  lowerImmExprForLoweredAsm: ProgramLoweringContext['lowerImmExprForLoweredAsm'];
  /** @inheritdoc AssemblerLoweringSymbolContext */
  currentCodeSegmentTagRef: AssemblerLoweringSymbolContext['currentCodeSegmentTagRef'];
};

export type EmitLoweringContextBuilderInput = {
  /** Named assembler-lowering slices (merge to {@link AssemblerLoweringSharedContext}). */
  readonly assemblerLowering: Readonly<AssemblerLoweringComponentContexts>;
  readonly programLowering: Readonly<EmitProgramLoweringContextInputs>;
};

/** @inheritdoc mergeAssemblerLoweringSharedContext */
export const createAssemblerLoweringSharedContext = mergeAssemblerLoweringSharedContext;

export function createProgramLoweringContext(
  shared: Readonly<AssemblerLoweringSharedContext>,
  input: Readonly<EmitProgramLoweringContextInputs>,
): ProgramLoweringContext {
  return {
    ...shared,
    program: input.program,
    includeDirs: input.includeDirs,
    localOpsByFile: input.localOpsByFile,
    visibleOpsByName: input.visibleOpsByName,
    declaredOpNames: input.declaredOpNames,
    deferredExterns: input.deferredExterns,
    storageTypes: input.storageTypes,
    rawAddressSymbols: input.rawAddressSymbols,
    absoluteSymbols: input.absoluteSymbols,
    symbols: input.symbols,
    dataBytes: input.dataBytes,
    codeBytes: input.codeBytes,
    activeSectionRef: input.activeSectionRef,
    codeOffsetRef: input.codeOffsetRef,
    dataOffsetRef: input.dataOffsetRef,
    varOffsetRef: input.varOffsetRef,
    baseExprs: input.baseExprs,
    advanceAlign: input.advanceAlign,
    alignTo: input.alignTo,
    loadBinInput: input.loadBinInput,
    resolveAggregateType: input.resolveAggregateType,
    sizeOfTypeExpr: input.sizeOfTypeExpr,
    recordLoweredAsmItem: input.recordLoweredAsmItem,
    lowerImmExprForLoweredAsm: input.lowerImmExprForLoweredAsm,
  };
}

export function createEmitLoweringContexts(
  input: EmitLoweringContextBuilderInput,
): {
  assemblerLoweringSharedContext: AssemblerLoweringSharedContext;
  programLoweringContext: ProgramLoweringContext;
} {
  const assemblerLoweringSharedContext = createAssemblerLoweringSharedContext(input.assemblerLowering);
  const programLoweringContext = createProgramLoweringContext(
    assemblerLoweringSharedContext,
    input.programLowering,
  );

  return {
    assemblerLoweringSharedContext,
    programLoweringContext,
  };
}
