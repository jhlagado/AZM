import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, ProgramNode } from '../frontend/ast.js';
import { evalImmExpr } from './env.js';
import type { CompileEnv } from './env.js';
import { diagAt } from './storageView.js';
import { runInstructionAcceptance } from './instructionAcceptance.js';
import type { InstructionValidator } from './instructionAcceptance.js';

type CanonicalStepInstruction = {
  amount: number;
  amountExpr?: Extract<AsmInstructionNode['operands'][number], { kind: 'Imm' }>['expr'];
  target: Extract<AsmInstructionNode['operands'][number], { kind: 'Ea' }>;
};

function getCanonicalStepInstruction(item: AsmInstructionNode): CanonicalStepInstruction | undefined {
  if (item.head !== 'step' || item.operands.length < 1 || item.operands.length > 2) return undefined;
  const target = item.operands[0];
  if (target?.kind !== 'Ea' || target.explicitAddressOf) return undefined;

  if (item.operands.length === 1) {
    return {
      amount: 1,
      target,
    };
  }

  const amountOperand = item.operands[1];
  if (amountOperand?.kind !== 'Imm') return undefined;

  return {
    amount: 1,
    amountExpr: amountOperand.expr,
    target,
  };
}

function createStepValidator(env: CompileEnv): InstructionValidator {
  return {
    validateInstruction(item, _storage, helpers, diagnostics) {
      const step = getCanonicalStepInstruction(item);
      if (!step) return;

      if (step.amountExpr) {
        const diagCount = diagnostics.length;
        const amount = evalImmExpr(step.amountExpr, env, diagnostics);
        if (amount === undefined) {
          if (diagnostics.length === diagCount) {
            diagAt(diagnostics, item.span, '"step" amount must be a compile-time integer expression.');
          }
          return;
        }
        step.amount = amount;
      }

      const typeExpr = helpers.resolveEaTypeExpr(step.target.expr);
      const scalar = helpers.resolveScalarTypeForLd(step.target.expr);
      if (!scalar) {
        const detail = typeExpr ? helpers.typeDisplay(typeExpr) : 'unknown';
        diagAt(diagnostics, item.span, `"step" requires scalar storage; got ${detail}.`);
        return;
      }
      if (scalar !== 'byte' && scalar !== 'word') {
        diagAt(diagnostics, item.span, '"step" only supports byte and word scalar paths in this slice.');
      }
    },

    validateOpInstruction(item, _op, diagnostics) {
      const step = getCanonicalStepInstruction(item);
      if (step) {
        diagAt(diagnostics, item.span, '"step" typed-path forms are not supported inside ops in this slice.');
      }
    },
  };
}

export function validateStepAcceptance(
  program: ProgramNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
): void {
  runInstructionAcceptance(program, env, diagnostics, createStepValidator(env));
}