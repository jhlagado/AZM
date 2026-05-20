import type { Diagnostic } from '../diagnosticTypes.js';
import { DiagnosticIds } from '../diagnosticTypes.js';
import type {
  EaExprNode,
  ImmExprNode,
  OffsetPathNode,
  OffsetPathStepNode,
  SourceSpan,
  TypeExprNode,
} from '../frontend/ast.js';
import { ALL_REGISTER_NAMES } from '../frontend/grammarData.js';
import type { CompileEnv } from './env.js';
import { offsetPathInTypeExpr } from './layout.js';

export type LayoutCastAbsFold = {
  baseLower: string;
  addend: number;
};

function containsLayoutCast(ea: EaExprNode): boolean {
  switch (ea.kind) {
    case 'EaName':
    case 'EaImm':
      return false;
    case 'EaLayoutCast':
      return true;
    case 'EaField':
    case 'EaAdd':
    case 'EaSub':
    case 'EaIndex':
      return containsLayoutCast(ea.base);
  }
}

function hasRuntimeIndexInLayoutCast(ea: EaExprNode): boolean {
  switch (ea.kind) {
    case 'EaName':
    case 'EaImm':
      return false;
    case 'EaLayoutCast':
      return hasRuntimeIndexInLayoutCast(ea.base);
    case 'EaField':
    case 'EaAdd':
    case 'EaSub':
      return hasRuntimeIndexInLayoutCast(ea.base);
    case 'EaIndex':
      if (
        containsLayoutCast(ea.base) &&
        (ea.index.kind === 'IndexReg8' ||
          ea.index.kind === 'IndexReg16' ||
          ea.index.kind === 'IndexMemHL' ||
          ea.index.kind === 'IndexMemIxIy' ||
          ea.index.kind === 'IndexEa')
      ) {
        return true;
      }
      return hasRuntimeIndexInLayoutCast(ea.base);
  }
}

export function isConstantLayoutCastEa(ea: EaExprNode): boolean {
  return containsLayoutCast(ea) && !hasRuntimeIndexInLayoutCast(ea);
}

/** Constant layout cast with a label or label +/- imm base. */
function isLabelConstantLayoutCastEa(ea: EaExprNode): boolean {
  if (!isConstantLayoutCastEa(ea)) return false;
  const decomposed = decomposeLayoutCastEa(ea);
  if (!decomposed) return false;
  return isLayoutCastLabelBase(decomposed.cast.base);
}

/** Label or label +/- imm base for `<Type>base[path]`. */
export function isLayoutCastLabelBase(ea: EaExprNode): boolean {
  switch (ea.kind) {
    case 'EaName': {
      if (ALL_REGISTER_NAMES.has(ea.name.toUpperCase())) return false;
      return true;
    }
    case 'EaAdd':
    case 'EaSub':
      return isLayoutCastLabelBase(ea.base);
    default:
      return false;
  }
}

type DecomposedLayoutCast = {
  cast: Extract<EaExprNode, { kind: 'EaLayoutCast' }>;
  path: OffsetPathNode;
};

function decomposeLayoutCastEa(ea: EaExprNode): DecomposedLayoutCast | undefined {
  const steps: OffsetPathStepNode[] = [];
  let cur: EaExprNode = ea;

  while (cur.kind === 'EaField' || cur.kind === 'EaIndex') {
    if (cur.kind === 'EaField') {
      steps.unshift({ kind: 'OffsetField', span: cur.span, name: cur.field });
      cur = cur.base;
      continue;
    }

    if (cur.index.kind !== 'IndexImm') return undefined;
    steps.unshift({ kind: 'OffsetIndex', span: cur.span, expr: cur.index.value });
    cur = cur.base;
  }

  if (cur.kind !== 'EaLayoutCast') return undefined;
  return {
    cast: cur,
    path: { kind: 'OffsetPath', span: cur.span, steps },
  };
}

/**
 * Fold `<Type>label[path]` to a label fixup addend when the cast uses a label base
 * and compile-time indexes only.
 */
export function foldLayoutCastAbsEa(
  ea: EaExprNode,
  params: {
    env: CompileEnv;
    evalImm: (expr: ImmExprNode) => number | undefined;
    resolveAbsBase: (baseEa: EaExprNode) => LayoutCastAbsFold | undefined;
    diagnostics?: Diagnostic[];
  },
): LayoutCastAbsFold | undefined {
  if (!isConstantLayoutCastEa(ea)) return undefined;

  const decomposed = decomposeLayoutCastEa(ea);
  if (!decomposed) return undefined;
  if (!isLayoutCastLabelBase(decomposed.cast.base)) return undefined;

  const pathOffset = offsetPathInTypeExpr(
    decomposed.cast.typeExpr,
    decomposed.path,
    params.env,
    params.evalImm,
    params.diagnostics,
  );
  if (pathOffset === undefined) return undefined;

  const base = params.resolveAbsBase(decomposed.cast.base);
  if (!base) return undefined;

  return {
    baseLower: base.baseLower,
    addend: (base.addend + pathOffset) & 0xffff,
  };
}

function layoutCastRuntimeIndexMessage(): string {
  return `Layout-cast address expressions require compile-time constant indexes; runtime index registers require explicit address arithmetic with sizeof/offset constants.`;
}

export function diagLayoutCastRuntimeIndex(
  diagnostics: Diagnostic[],
  span: SourceSpan,
  ea: EaExprNode,
): boolean {
  if (!hasRuntimeIndexInLayoutCast(ea)) return false;
  diagnostics.push({
    id: DiagnosticIds.TypeError,
    severity: 'error',
    message: layoutCastRuntimeIndexMessage(),
    file: span.file,
    line: span.start.line,
    column: span.start.column,
  });
  return true;
}

/** Equivalence helper: path offset inside a cast type expression. */
export function layoutCastPathOffset(
  typeExpr: TypeExprNode,
  path: OffsetPathNode,
  env: CompileEnv,
  evalImm: (expr: ImmExprNode) => number | undefined,
  diagnostics?: Diagnostic[],
): number | undefined {
  return offsetPathInTypeExpr(typeExpr, path, env, evalImm, diagnostics);
}
