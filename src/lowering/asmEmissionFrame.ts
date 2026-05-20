import type { AssemblerLoweringSharedContext } from './assemblerLoweringContext.js';
import type { LoweringContext } from './programLowering.js';
import {
  createAssemblerInstructionEmitters,
  createNativeAssemblerFlowPhase,
  type AssemblerInstructionSetup,
  prepareAssemblerInstructionSetupPhase,
} from './assemblerLoweringPhases.js';

export type NativeAssemblerEmitter = ReturnType<typeof createAssemblerInstructionEmitters>;

function createNativeAssemblerSetup(ctx: AssemblerLoweringSharedContext): AssemblerInstructionSetup {
  return prepareAssemblerInstructionSetupPhase(ctx);
}

export function createNativeAssemblerEmitter(ctx: LoweringContext): NativeAssemblerEmitter {
  const setup = createNativeAssemblerSetup(ctx);
  const flow = createNativeAssemblerFlowPhase(setup);
  return createAssemblerInstructionEmitters(setup, flow);
}
