/**
 * Emit ↔ lowering context wiring (#1084, #1316)
 *
 * Function-lowering state is passed as {@link import('./functionLowering.js').FunctionLoweringComponentContexts}
 * — twelve named slices that merge into {@link import('./functionLowering.js').FunctionLoweringSharedContext}.
 * Program-level fields stay on {@link EmitProgramLoweringContextInputs}.
 */

import type {
  FunctionLoweringComponentContexts,
  FunctionLoweringSharedContext,
  FunctionLoweringSymbolContext,
} from './functionLowering.js';
import { mergeFunctionLoweringSharedContext } from './functionLowering.js';
import type { Context as ProgramLoweringContext } from './programLowering.js';
import type { NamedSectionContributionSink } from './sectionContributions.js';

/**
 * Program-level fields for {@link createProgramLoweringContext} (merged with shared function-lowering hooks).
 */
export type EmitProgramLoweringContextInputs = {
  /** @inheritdoc ProgramLoweringContext */
  program: ProgramLoweringContext['program'];
  /** @inheritdoc ProgramLoweringContext */
  includeDirs: ProgramLoweringContext['includeDirs'];
  /** @inheritdoc ProgramLoweringContext */
  localCallablesByFile: ProgramLoweringContext['localCallablesByFile'];
  /** @inheritdoc ProgramLoweringContext */
  visibleCallables: ProgramLoweringContext['visibleCallables'];
  /** @inheritdoc ProgramLoweringContext */
  localOpsByFile: ProgramLoweringContext['localOpsByFile'];
  /** @inheritdoc ProgramLoweringContext */
  visibleOpsByName: ProgramLoweringContext['visibleOpsByName'];
  /** @inheritdoc ProgramLoweringContext */
  declaredOpNames: ProgramLoweringContext['declaredOpNames'];
  /** @inheritdoc ProgramLoweringContext */
  declaredBinNames: ProgramLoweringContext['declaredBinNames'];
  /** @inheritdoc ProgramLoweringContext */
  deferredExterns: ProgramLoweringContext['deferredExterns'];
  /** @inheritdoc ProgramLoweringContext */
  storageTypes: ProgramLoweringContext['storageTypes'];
  /** @inheritdoc ProgramLoweringContext */
  moduleAliasTargets: ProgramLoweringContext['moduleAliasTargets'];
  /** @inheritdoc ProgramLoweringContext */
  moduleAliasDecls: ProgramLoweringContext['moduleAliasDecls'];
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
  hexBytes: ProgramLoweringContext['hexBytes'];
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
  loadHexInput: ProgramLoweringContext['loadHexInput'];
  /** @inheritdoc ProgramLoweringContext */
  resolveAggregateType: ProgramLoweringContext['resolveAggregateType'];
  /** @inheritdoc ProgramLoweringContext */
  sizeOfTypeExpr: ProgramLoweringContext['sizeOfTypeExpr'];
  /** @inheritdoc ProgramLoweringContext */
  lowerFunctionDecl: ProgramLoweringContext['lowerFunctionDecl'];
  /** @inheritdoc ProgramLoweringContext */
  recordLoweredAsmItem: ProgramLoweringContext['recordLoweredAsmItem'];
  /** @inheritdoc ProgramLoweringContext */
  lowerImmExprForLoweredAsm: ProgramLoweringContext['lowerImmExprForLoweredAsm'];
  /** @inheritdoc ProgramLoweringContext */
  namedSectionSinksByNode: ProgramLoweringContext['namedSectionSinksByNode'];
  /** Current sink for the active named section contribution; `undefined` when not in a named block. */
  currentNamedSectionSinkRef: { current: NamedSectionContributionSink | undefined };
  /** @inheritdoc FunctionLoweringSymbolContext */
  currentCodeSegmentTagRef: FunctionLoweringSymbolContext['currentCodeSegmentTagRef'];
};

export type EmitLoweringContextBuilderInput = {
  /** Named function-lowering slices (merge to {@link FunctionLoweringSharedContext}). */
  readonly functionLowering: Readonly<FunctionLoweringComponentContexts>;
  readonly programLowering: Readonly<EmitProgramLoweringContextInputs>;
};

/** @inheritdoc mergeFunctionLoweringSharedContext */
export const createFunctionLoweringSharedContext = mergeFunctionLoweringSharedContext;

export function createProgramLoweringContext(
  shared: Readonly<FunctionLoweringSharedContext>,
  input: Readonly<EmitProgramLoweringContextInputs>,
): ProgramLoweringContext {
  return {
    ...shared,
    program: input.program,
    includeDirs: input.includeDirs,
    localCallablesByFile: input.localCallablesByFile,
    visibleCallables: input.visibleCallables,
    localOpsByFile: input.localOpsByFile,
    visibleOpsByName: input.visibleOpsByName,
    declaredOpNames: input.declaredOpNames,
    declaredBinNames: input.declaredBinNames,
    deferredExterns: input.deferredExterns,
    storageTypes: input.storageTypes,
    moduleAliasTargets: input.moduleAliasTargets,
    moduleAliasDecls: input.moduleAliasDecls,
    rawAddressSymbols: input.rawAddressSymbols,
    absoluteSymbols: input.absoluteSymbols,
    symbols: input.symbols,
    dataBytes: input.dataBytes,
    codeBytes: input.codeBytes,
    hexBytes: input.hexBytes,
    activeSectionRef: input.activeSectionRef,
    codeOffsetRef: input.codeOffsetRef,
    dataOffsetRef: input.dataOffsetRef,
    varOffsetRef: input.varOffsetRef,
    baseExprs: input.baseExprs,
    advanceAlign: input.advanceAlign,
    alignTo: input.alignTo,
    loadBinInput: input.loadBinInput,
    loadHexInput: input.loadHexInput,
    resolveAggregateType: input.resolveAggregateType,
    sizeOfTypeExpr: input.sizeOfTypeExpr,
    lowerFunctionDecl: input.lowerFunctionDecl,
    recordLoweredAsmItem: input.recordLoweredAsmItem,
    lowerImmExprForLoweredAsm: input.lowerImmExprForLoweredAsm,
    namedSectionSinksByNode: input.namedSectionSinksByNode,
    withNamedSectionSink: <T>(sink: NamedSectionContributionSink, fn: () => T): T => {
      const prevSink = input.currentNamedSectionSinkRef.current;
      input.currentNamedSectionSinkRef.current = sink;
      sink.currentSourceTag = input.currentCodeSegmentTagRef.current;
      try {
        return fn();
      } finally {
        input.currentNamedSectionSinkRef.current = prevSink;
      }
    },
  };
}

export function createEmitLoweringContexts(
  input: EmitLoweringContextBuilderInput,
): {
  functionLoweringSharedContext: FunctionLoweringSharedContext;
  programLoweringContext: ProgramLoweringContext;
} {
  const functionLoweringSharedContext = createFunctionLoweringSharedContext(input.functionLowering);
  const programLoweringContext = createProgramLoweringContext(
    functionLoweringSharedContext,
    input.programLowering,
  );

  return {
    functionLoweringSharedContext,
    programLoweringContext,
  };
}
