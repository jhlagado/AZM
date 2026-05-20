import type { AsmInstructionNode } from '../frontend/ast.js';
import {
  createNativeAssemblerEmitter,
  type NativeAssemblerEmitter,
} from './asmEmissionFrame.js';
import type { LoweringContext } from './programLowering.js';

const nativeEmitterByContext = new WeakMap<LoweringContext, NativeAssemblerEmitter>();

function nativeEmitterForContext(ctx: LoweringContext): NativeAssemblerEmitter {
  let emitter = nativeEmitterByContext.get(ctx);
  if (emitter) return emitter;

  emitter = createNativeAssemblerEmitter(ctx);
  nativeEmitterByContext.set(ctx, emitter);
  return emitter;
}

/** Lowers one top-level instruction in native `.azm` via op expansion and full ld/ea pipelines. */
export function lowerNativeAsmInstruction(ctx: LoweringContext, item: AsmInstructionNode): void {
  nativeEmitterForContext(ctx).emitAsmInstruction(item);
}
