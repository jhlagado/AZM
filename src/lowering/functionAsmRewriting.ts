import type { Diagnostic } from '../diagnosticTypes.js';
import type {
  AsmOperandNode,
  EaExprNode,
  ImmExprNode,
  SourceSpan,
  TypeExprNode,
} from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { ScalarKind } from './typeResolution.js';

type FrameOffsetMode = 'general' | 'ix_disp';

export type FunctionAsmRewritingContext = {
  diagnostics: Diagnostic[];
  diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
  evalImmExpr: (
    expr: ImmExprNode,
    env: CompileEnv,
    diagnostics: Diagnostic[],
  ) => number | undefined;
  env: CompileEnv;
  stackSlotOffsets: Map<string, number>;
  stackSlotTypes: Map<string, TypeExprNode>;
  localAliasTargets: Map<string, EaExprNode>;
  resolveScalarKind: (typeExpr: TypeExprNode) => ScalarKind | undefined;
  symbolicTargetFromExpr: (
    expr: ImmExprNode,
  ) => { baseLower: string; addend: number } | undefined;
  emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
};

export type FunctionAsmRewritingHelpers = {
  resolveLocalAliasTargetName: (nameLower: string) => string | undefined;
  evalImmExprForAsm: (expr: ImmExprNode) => number | undefined;
  symbolicTargetFromExprForAsm: (
    expr: ImmExprNode,
  ) => { baseLower: string; addend: number } | undefined;
  emitInstrForAsm: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
};

export function createFunctionAsmRewritingHelpers(
  ctx: FunctionAsmRewritingContext,
): FunctionAsmRewritingHelpers {
  const {
    diagnostics,
    diagAt,
    evalImmExpr,
    env,
    stackSlotOffsets,
    stackSlotTypes,
    localAliasTargets,
    resolveScalarKind,
    symbolicTargetFromExpr,
    emitInstr,
  } = ctx;

  const resolveLocalAliasTargetName = (nameLower: string): string | undefined => {
    const target = localAliasTargets.get(nameLower);
    return target && target.kind === 'EaName' ? target.name : undefined;
  };

  const rewriteImmExprForRawAliases = (
    expr: ImmExprNode,
  ): { expr: ImmExprNode; ok: boolean } => {
    switch (expr.kind) {
      case 'ImmLiteral':
      case 'ImmCurrentLocation':
      case 'ImmSizeof':
        return { expr, ok: true };
      case 'ImmName': {
        const aliasTarget = resolveLocalAliasTargetName(expr.name.toLowerCase());
        if (aliasTarget) {
          return { expr: { ...expr, name: aliasTarget }, ok: true };
        }
        return { expr, ok: true };
      }
      case 'ImmUnary': {
        const inner = rewriteImmExprForRawAliases(expr.expr);
        return { expr: { ...expr, expr: inner.expr }, ok: inner.ok };
      }
      case 'ImmBinary': {
        const left = rewriteImmExprForRawAliases(expr.left);
        const right = rewriteImmExprForRawAliases(expr.right);
        return {
          expr: { ...expr, left: left.expr, right: right.expr },
          ok: left.ok && right.ok,
        };
      }
      case 'ImmOffsetof': {
        let ok = true;
        const steps = expr.path.steps.map((step) => {
          if (step.kind !== 'OffsetofIndex') return step;
          const rewritten = rewriteImmExprForRawAliases(step.expr);
          ok = ok && rewritten.ok;
          return { ...step, expr: rewritten.expr };
        });
        return { expr: { ...expr, path: { ...expr.path, steps } }, ok };
      }
    }
  };

  const rewriteImmExprForFrameOffsets = (
    expr: ImmExprNode,
    mode: FrameOffsetMode,
  ): { expr: ImmExprNode; ok: boolean } => {
    switch (expr.kind) {
      case 'ImmLiteral':
      case 'ImmCurrentLocation':
      case 'ImmSizeof':
        return { expr, ok: true };
      case 'ImmName': {
        const lower = expr.name.toLowerCase();
        const slotOffset = stackSlotOffsets.get(lower);
        if (slotOffset !== undefined) {
          const typeExpr = stackSlotTypes.get(lower);
          const scalarKind = typeExpr ? resolveScalarKind(typeExpr) : undefined;
          if (!scalarKind) {
            diagAt(
              diagnostics,
              expr.span,
              `Non-scalar slot "${expr.name}" cannot be used as a raw IX offset.`,
            );
            return { expr, ok: false };
          }
          return { expr: { kind: 'ImmLiteral', span: expr.span, value: slotOffset }, ok: true };
        }
        if (localAliasTargets.has(lower) && mode === 'ix_disp') {
          diagAt(
            diagnostics,
            expr.span,
            `Alias "${expr.name}" has no frame slot; cannot be used as a raw IX offset.`,
          );
          return { expr, ok: false };
        }
        return { expr, ok: true };
      }
      case 'ImmUnary': {
        const inner = rewriteImmExprForFrameOffsets(expr.expr, mode);
        return { expr: { ...expr, expr: inner.expr }, ok: inner.ok };
      }
      case 'ImmBinary': {
        const left = rewriteImmExprForFrameOffsets(expr.left, mode);
        const right = rewriteImmExprForFrameOffsets(expr.right, mode);
        return {
          expr: { ...expr, left: left.expr, right: right.expr },
          ok: left.ok && right.ok,
        };
      }
      case 'ImmOffsetof': {
        let ok = true;
        const steps = expr.path.steps.map((step) => {
          if (step.kind !== 'OffsetofIndex') return step;
          const rewritten = rewriteImmExprForFrameOffsets(step.expr, mode);
          ok = ok && rewritten.ok;
          return { ...step, expr: rewritten.expr };
        });
        return { expr: { ...expr, path: { ...expr.path, steps } }, ok };
      }
    }
  };

  const rewriteEaExprForFrameOffsets = (
    ea: EaExprNode,
  ): { expr: EaExprNode; ok: boolean } => {
    switch (ea.kind) {
      case 'EaName':
        return { expr: ea, ok: true };
      case 'EaImm': {
        const rewritten = rewriteImmExprForFrameOffsets(ea.expr, 'general');
        return { expr: { ...ea, expr: rewritten.expr }, ok: rewritten.ok };
      }
      case 'EaReinterpret': {
        const base = rewriteEaExprForFrameOffsets(ea.base);
        return { expr: { ...ea, base: base.expr }, ok: base.ok };
      }
      case 'EaField': {
        const base = rewriteEaExprForFrameOffsets(ea.base);
        return { expr: { ...ea, base: base.expr }, ok: base.ok };
      }
      case 'EaAdd':
      case 'EaSub': {
        const base = rewriteEaExprForFrameOffsets(ea.base);
        const nextMode: FrameOffsetMode =
          base.expr.kind === 'EaName' &&
          (base.expr.name.toUpperCase() === 'IX' || base.expr.name.toUpperCase() === 'IY')
            ? 'ix_disp'
            : 'general';
        const offset = rewriteImmExprForFrameOffsets(ea.offset, nextMode);
        return {
          expr: { ...ea, base: base.expr, offset: offset.expr },
          ok: base.ok && offset.ok,
        };
      }
      case 'EaIndex': {
        const base = rewriteEaExprForFrameOffsets(ea.base);
        let ok = base.ok;
        const index = (() => {
          switch (ea.index.kind) {
            case 'IndexImm': {
              const value = rewriteImmExprForFrameOffsets(ea.index.value, 'general');
              ok = ok && value.ok;
              return { ...ea.index, value: value.expr };
            }
            case 'IndexMemIxIy': {
              if (!ea.index.disp) return ea.index;
              const disp = rewriteImmExprForFrameOffsets(ea.index.disp, 'general');
              ok = ok && disp.ok;
              return { ...ea.index, disp: disp.expr };
            }
            case 'IndexEa': {
              const expr = rewriteEaExprForFrameOffsets(ea.index.expr);
              ok = ok && expr.ok;
              return { ...ea.index, expr: expr.expr };
            }
            default:
              return ea.index;
          }
        })();
        return { expr: { ...ea, base: base.expr, index }, ok };
      }
    }
  };

  const rewriteAsmOperandForFrameOffsets = (
    op: AsmOperandNode,
  ): { op: AsmOperandNode; ok: boolean } => {
    switch (op.kind) {
      case 'Reg':
      case 'PortC':
        return { op, ok: true };
      case 'Imm':
      case 'PortImm8': {
        const rewritten = rewriteImmExprForFrameOffsets(op.expr, 'general');
        return { op: { ...op, expr: rewritten.expr }, ok: rewritten.ok };
      }
      case 'Ea':
      case 'Mem': {
        const rewritten = rewriteEaExprForFrameOffsets(op.expr);
        return { op: { ...op, expr: rewritten.expr }, ok: rewritten.ok };
      }
    }
  };

  const evalImmExprForAsm = (expr: ImmExprNode): number | undefined => {
    const rewritten = rewriteImmExprForFrameOffsets(expr, 'general');
    if (!rewritten.ok) return undefined;
    return evalImmExpr(rewritten.expr, env, diagnostics);
  };

  const symbolicTargetFromExprForAsm = (
    expr: ImmExprNode,
  ): { baseLower: string; addend: number } | undefined => {
    const rewritten = rewriteImmExprForRawAliases(expr);
    if (!rewritten.ok) return undefined;
    const symbolic = symbolicTargetFromExpr(rewritten.expr);
    if (!symbolic) return undefined;
    if (stackSlotOffsets.has(symbolic.baseLower)) return undefined;
    return symbolic;
  };

  const emitInstrForAsm = (head: string, operands: AsmOperandNode[], span: SourceSpan): boolean => {
    const immExprHasFrameSlotName = (expr: ImmExprNode): boolean => {
      switch (expr.kind) {
        case 'ImmName':
          return stackSlotOffsets.has(expr.name.toLowerCase());
        case 'ImmUnary':
          return immExprHasFrameSlotName(expr.expr);
        case 'ImmBinary':
          return immExprHasFrameSlotName(expr.left) || immExprHasFrameSlotName(expr.right);
        case 'ImmOffsetof':
          return expr.path.steps.some(
            (step) => step.kind === 'OffsetofIndex' && immExprHasFrameSlotName(step.expr),
          );
        default:
          return false;
      }
    };

    const checkFrameDispRange = (op: AsmOperandNode): boolean => {
      if (op.kind !== 'Mem') return true;
      const ea = op.expr;
      const baseIsIxIy = (base: EaExprNode): boolean =>
        base.kind === 'EaName' && (base.name.toUpperCase() === 'IX' || base.name.toUpperCase() === 'IY');
      let dispExpr: ImmExprNode | undefined;
      if ((ea.kind === 'EaAdd' || ea.kind === 'EaSub') && baseIsIxIy(ea.base)) {
        dispExpr = ea.offset;
      } else {
        return true;
      }
      if (!immExprHasFrameSlotName(dispExpr)) return true;
      const rewritten = rewriteImmExprForFrameOffsets(dispExpr, 'ix_disp');
      if (!rewritten.ok) return false;
      const value = evalImmExpr(rewritten.expr, env, diagnostics);
      if (value === undefined) return false;
      if (value < -128 || value > 127) {
        diagAt(diagnostics, op.span, `IX/IY displacement out of range (-128..127): ${value}.`);
        return false;
      }
      return true;
    };

    for (const op of operands) {
      if (!checkFrameDispRange(op)) return false;
    }

    const rewritten: AsmOperandNode[] = [];
    for (const op of operands) {
      const next = rewriteAsmOperandForFrameOffsets(op);
      if (!next.ok) return false;
      rewritten.push(next.op);
    }
    return emitInstr(head, rewritten, span);
  };

  return {
    resolveLocalAliasTargetName,
    evalImmExprForAsm,
    symbolicTargetFromExprForAsm,
    emitInstrForAsm,
  };
}
