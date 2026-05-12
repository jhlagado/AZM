/**
 * instructionAcceptance.ts — shared traversal framework for instruction-level
 * semantic validators.
 *
 * `runInstructionAcceptance` walks every function and op in the program once,
 * builds the storage view once per function, and dispatches each
 * `AsmInstructionNode` to every registered `InstructionValidator`.  Individual
 * feature validators (`:=`, step, …) implement `InstructionValidator` and
 * contain only their own policy logic.
 */

import type { Diagnostic } from '../diagnosticTypes.js';
import type {
  AsmInstructionNode,
  FuncDeclNode,
  OpDeclNode,
  ProgramNode,
} from '../frontend/ast.js';
import { visitDeclTree } from './declVisitor.js';
import type { CompileEnv } from './env.js';
import { collectFunctionLocals, collectModuleStorage } from './storageView.js';
import type { ModuleStorageView, FunctionLocalView } from './storageView.js';
import { createTypeResolutionHelpers } from './typeQueries.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The helpers bundle passed to each validator for every instruction. */
export type TypeHelpers = ReturnType<typeof createTypeResolutionHelpers>;

/** Combined storage context for a single instruction site. */
export type StorageContext = ModuleStorageView & FunctionLocalView;

/**
 * A pluggable instruction-level validator.
 *
 * `validateInstruction` is called for every `AsmInstructionNode` inside a
 * function.  `validateOpInstruction` (optional) is called for every
 * `AsmInstructionNode` inside an op body.  Either callback may be omitted.
 */
export type InstructionValidator = {
  validateInstruction?: (
    item: AsmInstructionNode,
    storage: StorageContext,
    helpers: TypeHelpers,
    diagnostics: Diagnostic[],
  ) => void;
  validateOpInstruction?: (
    item: AsmInstructionNode,
    op: OpDeclNode,
    diagnostics: Diagnostic[],
  ) => void;
};

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

function runForFunction(
  func: FuncDeclNode,
  env: CompileEnv,
  moduleStorage: ModuleStorageView,
  diagnostics: Diagnostic[],
  validators: InstructionValidator[],
): void {
  const locals = collectFunctionLocals(func.locals.decls);
  const { stackSlotTypes, localAliasTargets } = locals;

  // Inject parameters into the stack-slot map.
  for (const param of func.params) {
    stackSlotTypes.set(param.name.toLowerCase(), param.typeExpr);
  }

  const storage: StorageContext = {
    ...moduleStorage,
    stackSlotTypes,
    localAliasTargets,
  };

  const helpers = createTypeResolutionHelpers({
    env,
    storageTypes: moduleStorage.storageTypes,
    stackSlotTypes,
    rawAddressSymbols: moduleStorage.rawAddressSymbols,
    moduleAliasTargets: moduleStorage.moduleAliasTargets,
    getLocalAliasTargets: () => localAliasTargets,
  });

  for (const asmItem of func.asm.items) {
    if (asmItem.kind !== 'AsmInstruction') continue;
    for (const v of validators) {
      v.validateInstruction?.(asmItem, storage, helpers, diagnostics);
    }
  }
}

function runForOp(
  op: OpDeclNode,
  diagnostics: Diagnostic[],
  validators: InstructionValidator[],
): void {
  for (const asmItem of op.body.items) {
    if (asmItem.kind !== 'AsmInstruction') continue;
    for (const v of validators) {
      v.validateOpInstruction?.(asmItem, op, diagnostics);
    }
  }
}

/**
 * Run all provided validators over every function and op in the program.
 *
 * Module storage is collected once; per-function locals are collected once per
 * function.  Each validator sees every instruction with the same helpers
 * bundle, so they share the resolution work.
 */
export function runInstructionAcceptance(
  program: ProgramNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
  ...validators: InstructionValidator[]
): void {
  if (validators.length === 0) return;

  const moduleStorage = collectModuleStorage(program, env);

  for (const file of program.files) {
    visitDeclTree(file.items, (item) => {
      if (item.kind === 'FuncDecl') {
        runForFunction(item, env, moduleStorage, diagnostics, validators);
        return;
      }
      if (item.kind === 'OpDecl') {
        runForOp(item, diagnostics, validators);
      }
    });
  }
}
