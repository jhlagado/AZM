import type { AsmInstructionNode } from '../frontend/ast.js';
import {
  createNativeAssemblerEmissionFrame,
  type NativeAssemblerEmissionFrame,
} from './asmEmissionFrame.js';
import type { LoweringContext } from './programLowering.js';

const nativeEmitterByContext = new WeakMap<LoweringContext, NativeAssemblerEmissionFrame>();

function nativeEmitterForContext(ctx: LoweringContext): NativeAssemblerEmissionFrame {
  let emitter = nativeEmitterByContext.get(ctx);
  if (emitter) return emitter;

  emitter = createNativeAssemblerEmissionFrame(ctx);
  nativeEmitterByContext.set(ctx, emitter);
  return emitter;
}

/** Lowers one top-level instruction in native `.azm` via op expansion and full ld/ea pipelines. */
export function lowerNativeAsmInstruction(ctx: LoweringContext, item: AsmInstructionNode): void {
  nativeEmitterForContext(ctx).emitAsmInstruction(item);
}
