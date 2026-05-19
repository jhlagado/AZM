import type { AsmBlockNode, AsmInstructionNode, FuncDeclNode, SourceSpan, VarBlockNode } from '../frontend/ast.js';
import type { FunctionLoweringContext } from './functionLowering.js';
import {
  createFunctionAsmEmitters,
  prepareFunctionLoweringSetupPhase,
  runNativeModuleAsmFramePhase,
} from './functionLoweringPhases.js';
import type { LoweringContext } from './programLowering.js';

const NATIVE_STUB_FUNC_NAME = '__azm_native__';

function nativeStubSpan(file: string): SourceSpan {
  return {
    file,
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  };
}

function createNativeStubFuncDecl(file: string): FuncDeclNode {
  const span = nativeStubSpan(file);
  const locals: VarBlockNode = { kind: 'VarBlock', scope: 'function', decls: [], span };
  const asm: AsmBlockNode = { kind: 'AsmBlock', items: [], span };
  return {
    kind: 'FuncDecl',
    name: NATIVE_STUB_FUNC_NAME,
    exported: false,
    params: [],
    returnRegs: [],
    locals,
    asm,
    span,
  };
}

type NativeAsmEmitter = ReturnType<typeof createFunctionAsmEmitters>;

const nativeEmitterByContext = new WeakMap<LoweringContext, NativeAsmEmitter>();

function nativeEmitterForContext(ctx: LoweringContext): NativeAsmEmitter {
  let emitter = nativeEmitterByContext.get(ctx);
  if (emitter) return emitter;

  const file = ctx.program.entryFile;
  const fnCtx: FunctionLoweringContext = { ...ctx, item: createNativeStubFuncDecl(file) };
  const setup = prepareFunctionLoweringSetupPhase(fnCtx);
  const frame = runNativeModuleAsmFramePhase(setup);
  emitter = createFunctionAsmEmitters(setup, frame);
  nativeEmitterByContext.set(ctx, emitter);
  return emitter;
}

/** Lowers one module-scope instruction in native `.azm` via op expansion and full ld/ea pipelines. */
export function lowerNativeAsmInstruction(ctx: LoweringContext, item: AsmInstructionNode): void {
  nativeEmitterForContext(ctx).emitAsmInstruction(item);
}
