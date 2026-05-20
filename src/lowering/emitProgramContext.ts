/**
 * Emit program context wiring (#1084, #1316)
 *
 * Callers pass named bundles aligned with {@link AssemblerLoweringComponentContexts}; the builder
 * forwards them without flattening to {@link createEmitLoweringContexts}.
 */

import type {
  AssemblerLoweringAstUtilityContext,
  AssemblerLoweringComponentContexts,
  AssemblerLoweringConditionContext,
  AssemblerLoweringDiagnosticsContext,
  AssemblerLoweringEmissionContext,
  AssemblerLoweringMaterializationContext,
  AssemblerLoweringOpOverloadContext,
  AssemblerLoweringOpResolutionContext,
  AssemblerLoweringRegisterContext,
  AssemblerLoweringSpTrackingContext,
  AssemblerLoweringStorageContext,
  AssemblerLoweringSymbolContext,
  AssemblerLoweringTypeContext,
} from './assemblerLoweringContext.js';
import type { EmitProgramLoweringContextInputs, EmitLoweringContextBuilderInput } from './emitContextBuilder.js';
import { createEmitLoweringContexts } from './emitContextBuilder.js';

export type EmitDiagnosticsBundle = AssemblerLoweringDiagnosticsContext;

export type EmitSymbolsAndTraceBundle = AssemblerLoweringSymbolContext;

export type EmitSpTrackingBundle = AssemblerLoweringSpTrackingContext;

export type EmitEmissionBundle = AssemblerLoweringEmissionContext;

export type EmitConditionsBundle = AssemblerLoweringConditionContext;

export type EmitTypesBundle = AssemblerLoweringTypeContext;

export type EmitMaterializationBundle = AssemblerLoweringMaterializationContext;

export type EmitStorageBundle = AssemblerLoweringStorageContext;

export type EmitOpResolutionBundle = AssemblerLoweringOpResolutionContext;

export type EmitOpOverloadBundle = AssemblerLoweringOpOverloadContext;

export type EmitAstUtilitiesBundle = AssemblerLoweringAstUtilityContext;

export type EmitRegistersBundle = AssemblerLoweringRegisterContext;

/** Named bundles passed from `emitProgram` into lowering context construction. */
export type EmitProgramContextBundles = {
  readonly diagnostics: Readonly<EmitDiagnosticsBundle>;
  readonly symbolsAndTrace: Readonly<EmitSymbolsAndTraceBundle>;
  readonly spTracking: Readonly<EmitSpTrackingBundle>;
  readonly emission: Readonly<EmitEmissionBundle>;
  readonly conditions: Readonly<EmitConditionsBundle>;
  readonly types: Readonly<EmitTypesBundle>;
  readonly materialization: Readonly<EmitMaterializationBundle>;
  readonly storage: Readonly<EmitStorageBundle>;
  readonly opResolution: Readonly<EmitOpResolutionBundle>;
  readonly opOverload: Readonly<EmitOpOverloadBundle>;
  readonly astUtilities: Readonly<EmitAstUtilitiesBundle>;
  readonly registers: Readonly<EmitRegistersBundle>;
  readonly program: Readonly<EmitProgramLoweringContextInputs>;
};

export function emitProgramBundlesToLoweringBuilderInput(
  b: Readonly<EmitProgramContextBundles>,
): EmitLoweringContextBuilderInput {
  const assemblerLowering: AssemblerLoweringComponentContexts = {
    diagnostics: b.diagnostics,
    symbols: b.symbolsAndTrace,
    spTracking: b.spTracking,
    emission: b.emission,
    conditions: b.conditions,
    types: b.types,
    materialization: b.materialization,
    storage: b.storage,
    opResolution: b.opResolution,
    opOverload: b.opOverload,
    astUtilities: b.astUtilities,
    registers: b.registers,
  };
  return {
    assemblerLowering,
    programLowering: b.program,
  };
}

export function createEmitProgramContext(bundles: Readonly<EmitProgramContextBundles>) {
  return createEmitLoweringContexts(emitProgramBundlesToLoweringBuilderInput(bundles));
}
