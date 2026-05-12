import {
  CALC_EA,
  CALC_EA_WIDE,
  EA_FVAR_CONST,
  EA_FVAR_FVAR,
  EA_FVAR_GLOB,
  EA_FVAR_REG,
  EA_FVAR_RP,
  EA_GLOB_CONST,
  EA_GLOB_FVAR,
  EA_GLOB_GLOB,
  EA_GLOB_REG,
  EA_GLOB_RP,
  EAW_FVAR_CONST,
  EAW_FVAR_FVAR,
  EAW_FVAR_GLOB,
  EAW_FVAR_REG,
  EAW_FVAR_RP,
  EAW_GLOB_CONST,
  EAW_GLOB_FVAR,
  EAW_GLOB_GLOB,
  EAW_GLOB_REG,
  EAW_GLOB_RP,
  LOAD_BASE_FVAR,
  LOAD_BASE_GLOB,
  type StepPipeline,
  type StepReg16,
  type StepReg8,
} from './steps.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import type { EaExprNode, ImmExprNode, SourceSpan, TypeExprNode } from '../frontend/ast.js';
import type { EaResolution } from './eaResolution.js';
import type { ScalarKind } from './typeResolution.js';

type AddressingPipelineContext = {
  diagnostics: Diagnostic[];
  diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
  reg8: ReadonlySet<string>;
  resolveEa: (ea: EaExprNode, span: SourceSpan) => EaResolution | undefined;
  resolveEaTypeExpr: (ea: EaExprNode) => TypeExprNode | undefined;
  resolveScalarBinding: (name: string) => ScalarKind | undefined;
  resolveScalarKind: (typeExpr: TypeExprNode) => ScalarKind | undefined;
  sizeOfTypeExpr: (typeExpr: TypeExprNode) => number | undefined;
  evalImmExpr: (expr: ImmExprNode) => number | undefined;
};

export function createAddressingPipelineBuilders(ctx: AddressingPipelineContext) {
  const hasIndex = (expr: EaExprNode): boolean => {
    switch (expr.kind) {
      case 'EaIndex':
        return true;
      case 'EaAdd':
      case 'EaSub':
      case 'EaField':
        return hasIndex(expr.base);
      default:
        return false;
    }
  };

  const isValidExactSize = (elemSize: number | undefined): elemSize is number =>
    elemSize !== undefined && Number.isInteger(elemSize) && elemSize >= 1;

  const buildEaBytePipeline = (ea: EaExprNode, span: SourceSpan): StepPipeline | null => {
    if (ea.kind === 'EaIndex') {
      const baseResolved = ctx.resolveEa(ea.base, span);
      const baseType = ctx.resolveEaTypeExpr(ea.base);
      if (!baseResolved || !baseType || baseType.kind !== 'ArrayType') return null;
      if (baseResolved.kind === 'indirect') return null;
      const elemSize = ctx.sizeOfTypeExpr(baseType.element);
      if (elemSize !== 1) return null;

      switch (ea.index.kind) {
        case 'IndexImm': {
          const imm = ctx.evalImmExpr(ea.index.value);
          if (imm !== undefined) {
            return baseResolved.kind === 'abs'
              ? EA_GLOB_CONST(baseResolved.baseLower, imm)
              : EA_FVAR_CONST(baseResolved.ixDisp, imm);
          }

          if (ea.index.value.kind === 'ImmName') {
            const idxScalar = ctx.resolveScalarBinding(ea.index.value.name);
            if (idxScalar !== 'word' && idxScalar !== 'addr') return null;
            const idxNameEa: EaExprNode = { kind: 'EaName', span, name: ea.index.value.name };
            const idxResolved = ctx.resolveEa(idxNameEa, span);
            if (!idxResolved) return null;
            if (idxResolved.kind === 'abs') {
              return baseResolved.kind === 'abs'
                ? EA_GLOB_GLOB(baseResolved.baseLower, idxResolved.baseLower)
                : EA_FVAR_GLOB(baseResolved.ixDisp, idxResolved.baseLower);
            }
            if (idxResolved.kind === 'stack') {
              return baseResolved.kind === 'abs'
                ? EA_GLOB_FVAR(baseResolved.baseLower, idxResolved.ixDisp)
                : EA_FVAR_FVAR(baseResolved.ixDisp, idxResolved.ixDisp);
            }
          }
          return null;
        }
        case 'IndexReg8': {
          const regLower = ea.index.reg.toLowerCase();
          if (!ctx.reg8.has(regLower.toUpperCase())) return null;
          return baseResolved.kind === 'abs'
            ? EA_GLOB_REG(baseResolved.baseLower, regLower as StepReg8)
            : EA_FVAR_REG(baseResolved.ixDisp, regLower as StepReg8);
        }
        case 'IndexReg16': {
          const rp = ea.index.reg.toUpperCase();
          if (rp !== 'HL' && rp !== 'DE' && rp !== 'BC') {
            ctx.diagAt(ctx.diagnostics, span, `Invalid reg16 index "${ea.index.reg}".`);
            return null;
          }
          if (rp === 'HL') {
            return baseResolved.kind === 'abs'
              ? [...LOAD_BASE_GLOB(baseResolved.baseLower), ...CALC_EA()]
              : [...LOAD_BASE_FVAR(baseResolved.ixDisp), ...CALC_EA()];
          }
          return baseResolved.kind === 'abs'
            ? EA_GLOB_RP(baseResolved.baseLower, rp as StepReg16)
            : EA_FVAR_RP(baseResolved.ixDisp, rp as StepReg16);
        }
        case 'IndexEa': {
          const idxResolved = ctx.resolveEa(ea.index.expr, span);
          if (!idxResolved) return null;
          if (idxResolved.kind === 'abs') {
            return baseResolved.kind === 'abs'
              ? EA_GLOB_GLOB(baseResolved.baseLower, idxResolved.baseLower)
              : EA_FVAR_GLOB(baseResolved.ixDisp, idxResolved.baseLower);
          }
          if (idxResolved.kind === 'stack') {
            return baseResolved.kind === 'abs'
              ? EA_GLOB_FVAR(baseResolved.baseLower, idxResolved.ixDisp)
              : EA_FVAR_FVAR(baseResolved.ixDisp, idxResolved.ixDisp);
          }
          return null;
        }
        default:
          return null;
      }
    }

    const resolved = ctx.resolveEa(ea, span);
    if (!resolved) return null;
    if (resolved.kind === 'abs') return EA_GLOB_CONST(resolved.baseLower, resolved.addend);
    if (resolved.kind === 'stack') return EA_FVAR_CONST(resolved.ixDisp, 0);
    return null;
  };

  const buildEaWordPipeline = (ea: EaExprNode, span: SourceSpan): StepPipeline | null => {
    if (!hasIndex(ea)) return null;

    if (ea.kind === 'EaIndex') {
      const baseResolved = ctx.resolveEa(ea.base, span);
      const baseType = ctx.resolveEaTypeExpr(ea.base);
      if (!baseResolved || !baseType || baseType.kind !== 'ArrayType') return null;
      if (baseResolved.kind === 'indirect') return null;
      const elemSize = ctx.sizeOfTypeExpr(baseType.element);
      if (!isValidExactSize(elemSize)) return null;
      const wideElemSize = elemSize;

      if (ea.index.kind === 'IndexImm') {
        const imm = ctx.evalImmExpr(ea.index.value);
        if (imm !== undefined) {
          return baseResolved.kind === 'abs'
            ? EAW_GLOB_CONST(baseResolved.baseLower, imm, wideElemSize)
            : EAW_FVAR_CONST(baseResolved.ixDisp, imm, wideElemSize);
        }

        if (ea.index.value.kind === 'ImmName') {
          const idxScalar = ctx.resolveScalarBinding(ea.index.value.name);
          if (idxScalar !== 'word' && idxScalar !== 'addr') return null;
          const idxNameEa: EaExprNode = { kind: 'EaName', span, name: ea.index.value.name };
          const idxResolved = ctx.resolveEa(idxNameEa, span);
          if (!idxResolved) return null;
          if (idxResolved.kind === 'abs') {
            return baseResolved.kind === 'abs'
              ? EAW_GLOB_GLOB(baseResolved.baseLower, idxResolved.baseLower, wideElemSize)
              : EAW_FVAR_GLOB(baseResolved.ixDisp, idxResolved.baseLower, wideElemSize);
          }
          if (idxResolved.kind === 'stack') {
            return baseResolved.kind === 'abs'
              ? EAW_GLOB_FVAR(baseResolved.baseLower, idxResolved.ixDisp, wideElemSize)
              : EAW_FVAR_FVAR(baseResolved.ixDisp, idxResolved.ixDisp, wideElemSize);
          }
        }
        return null;
      }

      if (ea.index.kind === 'IndexReg8' || ea.index.kind === 'IndexReg16') {
        const idxReg = ea.index.reg;
        const idxUpper = idxReg.toUpperCase();

        if (baseResolved.kind === 'abs') {
          if (ea.index.kind === 'IndexReg8') {
            return EAW_GLOB_REG(baseResolved.baseLower, idxReg.toLowerCase() as StepReg8, wideElemSize);
          }
          if (idxUpper === 'HL') {
            return [...LOAD_BASE_GLOB(baseResolved.baseLower), ...CALC_EA_WIDE(wideElemSize)];
          }
          return EAW_GLOB_RP(baseResolved.baseLower, idxUpper as StepReg16, wideElemSize);
        }
        if (baseResolved.kind === 'stack') {
          if (ea.index.kind === 'IndexReg8') {
            return EAW_FVAR_REG(baseResolved.ixDisp, idxReg.toLowerCase() as StepReg8, wideElemSize);
          }
          if (idxUpper === 'HL') {
            return [...LOAD_BASE_FVAR(baseResolved.ixDisp), ...CALC_EA_WIDE(wideElemSize)];
          }
          return EAW_FVAR_RP(baseResolved.ixDisp, idxUpper as StepReg16, wideElemSize);
        }
        return null;
      }

      if (ea.index.kind === 'IndexEa') {
        const idxResolved = ctx.resolveEa(ea.index.expr, span);
        if (!idxResolved) return null;
        if (idxResolved.kind === 'abs') {
          return baseResolved.kind === 'abs'
            ? EAW_GLOB_GLOB(baseResolved.baseLower, idxResolved.baseLower, wideElemSize)
            : EAW_FVAR_GLOB(baseResolved.ixDisp, idxResolved.baseLower, wideElemSize);
        }
        if (idxResolved.kind === 'stack') {
          return baseResolved.kind === 'abs'
            ? EAW_GLOB_FVAR(baseResolved.baseLower, idxResolved.ixDisp, wideElemSize)
            : EAW_FVAR_FVAR(baseResolved.ixDisp, idxResolved.ixDisp, wideElemSize);
        }
        return null;
      }
    }

    const resolved = ctx.resolveEa(ea, span);
    if (!resolved) return null;
    const scalarKind = resolved.typeExpr ? ctx.resolveScalarKind(resolved.typeExpr) : undefined;
    const elemSize: number | undefined = (resolved as { elemSize?: number }).elemSize ?? 2;
    if (scalarKind !== 'word' && scalarKind !== 'addr') return null;
    if (!isValidExactSize(elemSize)) return null;
    if (resolved.kind === 'abs') return EAW_GLOB_CONST(resolved.baseLower, resolved.addend, elemSize);
    if (resolved.kind === 'stack') return EAW_FVAR_CONST(resolved.ixDisp, 0, elemSize);
    return null;
  };

  return {
    buildEaBytePipeline,
    buildEaWordPipeline,
  };
}
