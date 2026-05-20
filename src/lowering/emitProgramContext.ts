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
  AssemblerLoweringAddressingContext,
  AssemblerLoweringOpOverloadContext,
  AssemblerLoweringOpResolutionContext,
  AssemblerLoweringRegisterContext,
  AssemblerLoweringSpTrackingContext,
  AssemblerLoweringSymbolContext,
  AssemblerLoweringTypeContext,
} from './assemblerLoweringContext.js';
import type { EmitProgramLoweringContextInputs, EmitLoweringContextBuilderInput } from './emitContextBuilder.js';
import { createEmitLoweringContexts } from './emitContextBuilder.js';

type EmitDiagnosticsBundle = AssemblerLoweringDiagnosticsContext;

type EmitSymbolsAndTraceBundle = AssemblerLoweringSymbolContext;

type EmitSpTrackingBundle = AssemblerLoweringSpTrackingContext;

type EmitEmissionBundle = AssemblerLoweringEmissionContext;

type EmitConditionsBundle = AssemblerLoweringConditionContext;

type EmitTypesBundle = AssemblerLoweringTypeContext;

type EmitAddressingBundle = AssemblerLoweringAddressingContext;

type EmitOpResolutionBundle = AssemblerLoweringOpResolutionContext;

type EmitOpOverloadBundle = AssemblerLoweringOpOverloadContext;

type EmitAstUtilitiesBundle = AssemblerLoweringAstUtilityContext;

type EmitRegistersBundle = AssemblerLoweringRegisterContext;

/** Named bundles passed from `emitProgram` into lowering context construction. */
type EmitProgramContextBundles = {
  readonly diagnostics: Readonly<EmitDiagnosticsBundle>;
  readonly symbolsAndTrace: Readonly<EmitSymbolsAndTraceBundle>;
  readonly spTracking: Readonly<EmitSpTrackingBundle>;
  readonly emission: Readonly<EmitEmissionBundle>;
  readonly conditions: Readonly<EmitConditionsBundle>;
  readonly types: Readonly<EmitTypesBundle>;
  readonly addressing: Readonly<EmitAddressingBundle>;
  readonly opResolution: Readonly<EmitOpResolutionBundle>;
  readonly opOverload: Readonly<EmitOpOverloadBundle>;
  readonly astUtilities: Readonly<EmitAstUtilitiesBundle>;
  readonly registers: Readonly<EmitRegistersBundle>;
  readonly program: Readonly<EmitProgramLoweringContextInputs>;
};

function emitProgramBundlesToLoweringBuilderInput(
  b: Readonly<EmitProgramContextBundles>,
): EmitLoweringContextBuilderInput {
  const assemblerLowering: AssemblerLoweringComponentContexts = {
    diagnostics: b.diagnostics,
    symbols: b.symbolsAndTrace,
    spTracking: b.spTracking,
    emission: b.emission,
    conditions: b.conditions,
    types: b.types,
    addressing: b.addressing,
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
