/**
 * Emit program context wiring (#1084, #1316)
 *
 * Callers pass named bundles aligned with {@link FunctionLoweringComponentContexts}; the builder
 * forwards them without flattening to {@link createEmitLoweringContexts}.
 */

import type {
  FunctionLoweringAstUtilityContext,
  FunctionLoweringCallableResolutionContext,
  FunctionLoweringComponentContexts,
  FunctionLoweringConditionContext,
  FunctionLoweringDiagnosticsContext,
  FunctionLoweringEmissionContext,
  FunctionLoweringMaterializationContext,
  FunctionLoweringOpOverloadContext,
  FunctionLoweringRegisterContext,
  FunctionLoweringSpTrackingContext,
  FunctionLoweringStorageContext,
  FunctionLoweringSymbolContext,
  FunctionLoweringTypeContext,
} from './functionLowering.js';
import type { EmitProgramLoweringContextInputs, EmitLoweringContextBuilderInput } from './emitContextBuilder.js';
import { createEmitLoweringContexts } from './emitContextBuilder.js';

export type EmitDiagnosticsBundle = FunctionLoweringDiagnosticsContext;

export type EmitSymbolsAndTraceBundle = FunctionLoweringSymbolContext;

export type EmitSpTrackingBundle = FunctionLoweringSpTrackingContext;

export type EmitEmissionBundle = FunctionLoweringEmissionContext;

export type EmitConditionsBundle = FunctionLoweringConditionContext;

export type EmitTypesBundle = FunctionLoweringTypeContext;

export type EmitMaterializationBundle = FunctionLoweringMaterializationContext;

export type EmitStorageBundle = FunctionLoweringStorageContext;

export type EmitCallableResolutionBundle = FunctionLoweringCallableResolutionContext;

export type EmitOpOverloadBundle = FunctionLoweringOpOverloadContext;

export type EmitAstUtilitiesBundle = FunctionLoweringAstUtilityContext;

export type EmitRegistersBundle = FunctionLoweringRegisterContext;

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
  readonly callableResolution: Readonly<EmitCallableResolutionBundle>;
  readonly opOverload: Readonly<EmitOpOverloadBundle>;
  readonly astUtilities: Readonly<EmitAstUtilitiesBundle>;
  readonly registers: Readonly<EmitRegistersBundle>;
  readonly program: Readonly<EmitProgramLoweringContextInputs>;
};

export function emitProgramBundlesToLoweringBuilderInput(
  b: Readonly<EmitProgramContextBundles>,
): EmitLoweringContextBuilderInput {
  const functionLowering: FunctionLoweringComponentContexts = {
    diagnostics: b.diagnostics,
    symbols: b.symbolsAndTrace,
    spTracking: b.spTracking,
    emission: b.emission,
    conditions: b.conditions,
    types: b.types,
    materialization: b.materialization,
    storage: b.storage,
    callableResolution: b.callableResolution,
    opOverload: b.opOverload,
    astUtilities: b.astUtilities,
    registers: b.registers,
  };
  return {
    functionLowering,
    programLowering: b.program,
  };
}

export function createEmitProgramContext(bundles: Readonly<EmitProgramContextBundles>) {
  return createEmitLoweringContexts(emitProgramBundlesToLoweringBuilderInput(bundles));
}
