import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmOperandNode, EaExprNode, ImmExprNode, SourceSpan } from '../frontend/ast.js';

type RuntimeAtomBudgetContext = {
  diagnostics: Diagnostic[];
  diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
};

const runtimeAtomRegisterNames = new Set([
  'A',
  'B',
  'C',
  'D',
  'E',
  'H',
  'L',
  'HL',
  'DE',
  'BC',
  'SP',
  'IX',
  'IY',
  'IXH',
  'IXL',
  'IYH',
  'IYL',
  'AF',
  "AF'",
  'I',
  'R',
]);

export function createRuntimeAtomBudgetHelpers(ctx: RuntimeAtomBudgetContext) {
  const countRuntimeAtomsInImmExpr = (expr: ImmExprNode): number => {
    switch (expr.kind) {
      case 'ImmLiteral':
      case 'ImmCurrentLocation':
      case 'ImmSizeof':
        return 0;
      case 'ImmOffsetof':
        return expr.path.steps.reduce(
          (acc, step) =>
            acc + (step.kind === 'OffsetofIndex' ? countRuntimeAtomsInImmExpr(step.expr) : 0),
          0,
        );
      case 'ImmName':
        return 0;
      case 'ImmUnary':
        return countRuntimeAtomsInImmExpr(expr.expr);
      case 'ImmBinary':
        return countRuntimeAtomsInImmExpr(expr.left) + countRuntimeAtomsInImmExpr(expr.right);
    }
  };

  const countRuntimeAtomsInEaExpr = (ea: EaExprNode): number => {
    switch (ea.kind) {
      case 'EaName':
        return runtimeAtomRegisterNames.has(ea.name.toUpperCase()) ? 1 : 0;
      case 'EaImm':
        return countRuntimeAtomsInImmExpr(ea.expr);
      case 'EaLayoutCast':
        return countRuntimeAtomsInEaExpr(ea.base);
      case 'EaField':
        return countRuntimeAtomsInEaExpr(ea.base);
      case 'EaAdd':
      case 'EaSub':
        return countRuntimeAtomsInEaExpr(ea.base) + countRuntimeAtomsInImmExpr(ea.offset);
      case 'EaIndex': {
        const baseAtoms = countRuntimeAtomsInEaExpr(ea.base);
        switch (ea.index.kind) {
          case 'IndexImm':
            return baseAtoms + countRuntimeAtomsInImmExpr(ea.index.value);
          case 'IndexReg8':
          case 'IndexReg16':
          case 'IndexMemHL':
            return baseAtoms + 1;
          case 'IndexMemIxIy':
            return baseAtoms + 1 + (ea.index.disp ? countRuntimeAtomsInImmExpr(ea.index.disp) : 0);
          case 'IndexEa':
            return baseAtoms + Math.max(1, countRuntimeAtomsInEaExpr(ea.index.expr));
        }
      }
    }
  };

  const enforceEaRuntimeAtomBudget = (operand: AsmOperandNode, context: string): boolean => {
    if (operand.kind !== 'Ea' && operand.kind !== 'Mem') return true;
    const atoms = countRuntimeAtomsInEaExpr(operand.expr);
    if (atoms <= 1) return true;
    ctx.diagAt(
      ctx.diagnostics,
      operand.span,
      `${context} exceeds runtime-atom budget (max 1; found ${atoms}).`,
    );
    return false;
  };

  return {
    countRuntimeAtomsInEaExpr,
    countRuntimeAtomsInImmExpr,
    enforceEaRuntimeAtomBudget,
  };
}
