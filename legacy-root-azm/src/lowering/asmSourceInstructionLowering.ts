import type { AsmInstructionNode } from '../frontend/ast.js';
import { createAsmSourceEmitter, type AsmSourceEmitter } from './asmSourceEmitter.js';
import type { LoweringContext } from './programLowering.js';

const asmSourceEmitterByContext = new WeakMap<LoweringContext, AsmSourceEmitter>();

function asmSourceEmitterForContext(ctx: LoweringContext): AsmSourceEmitter {
  let emitter = asmSourceEmitterByContext.get(ctx);
  if (emitter) return emitter;

  emitter = createAsmSourceEmitter(ctx);
  asmSourceEmitterByContext.set(ctx, emitter);
  return emitter;
}

/** Lowers one top-level instruction in ASM source via op expansion and full ld/ea pipelines. */
export function lowerAsmSourceInstruction(ctx: LoweringContext, item: AsmInstructionNode): void {
  asmSourceEmitterForContext(ctx).emitAsmInstruction(item);
}
