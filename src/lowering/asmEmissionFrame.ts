import type { AsmBlockNode, FuncDeclNode, SourceSpan, VarBlockNode } from '../frontend/ast.js';
import type { FunctionLoweringContext } from './functionLowering.js';
import type { LoweringContext } from './programLowering.js';
import {
  createAssemblerInstructionEmitters,
  createNativeAssemblerFramePhase,
  type FunctionLoweringSetupPhase,
  prepareFunctionLoweringSetupPhase,
} from './functionLoweringPhases.js';

const NATIVE_ASSEMBLER_BRIDGE_FUNCTION_NAME = '__azm_native_assembler_bridge__';

function nativeAssemblerSpan(file: string): SourceSpan {
  return {
    file,
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  };
}

function createNativeAssemblerBridgeFunction(file: string): FuncDeclNode {
  const span = nativeAssemblerSpan(file);
  const locals: VarBlockNode = { kind: 'VarBlock', scope: 'function', decls: [], span };
  const asm: AsmBlockNode = { kind: 'AsmBlock', items: [], span };
  return {
    kind: 'FuncDecl',
    name: NATIVE_ASSEMBLER_BRIDGE_FUNCTION_NAME,
    exported: false,
    params: [],
    returnRegs: [],
    locals,
    asm,
    span,
  };
}

export type NativeAssemblerEmissionFrame = ReturnType<typeof createAssemblerInstructionEmitters>;

function createNativeAssemblerBridgeSetup(ctx: LoweringContext): FunctionLoweringSetupPhase {
  const file = ctx.program.entryFile;
  const fnCtx: FunctionLoweringContext = {
    ...ctx,
    item: createNativeAssemblerBridgeFunction(file),
  };
  return prepareFunctionLoweringSetupPhase(fnCtx);
}

export function createNativeAssemblerEmissionFrame(ctx: LoweringContext): NativeAssemblerEmissionFrame {
  const setup = createNativeAssemblerBridgeSetup(ctx);
  const frame = createNativeAssemblerFramePhase(setup);
  return createAssemblerInstructionEmitters(setup, frame);
}
