import type { AssemblerLoweringSharedContext } from './assemblerLoweringContext.js';
import type { LoweringContext } from './programLowering.js';
import {
  createAssemblerInstructionEmitters,
  createAsmSourceFlowPhase,
  type AssemblerInstructionSetup,
  prepareAssemblerInstructionSetupPhase,
} from './assemblerLoweringPhases.js';

export type AsmSourceEmitter = ReturnType<typeof createAssemblerInstructionEmitters>;

function createAsmSourceSetup(ctx: AssemblerLoweringSharedContext): AssemblerInstructionSetup {
  return prepareAssemblerInstructionSetupPhase(ctx);
}

export function createAsmSourceEmitter(ctx: LoweringContext): AsmSourceEmitter {
  const setup = createAsmSourceSetup(ctx);
  const flow = createAsmSourceFlowPhase(setup);
  return createAssemblerInstructionEmitters(setup, flow);
}
