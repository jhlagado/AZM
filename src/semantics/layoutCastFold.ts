import type { Diagnostic } from '../diagnosticTypes.js';
import { DiagnosticIds } from '../diagnosticTypes.js';
import type {
  EaExprNode,
  ImmExprNode,
  OffsetofPathNode,
  OffsetofPathStepNode,
  SourceSpan,
  TypeExprNode,
} from '../frontend/ast.js';
import { TYPED_REINTERPRET_BASE_REGISTERS } from '../frontend/grammarData.js';
import type { CompileEnv } from './env.js';
import { offsetOfPathInTypeExpr } from './layout.js';

export type LayoutCastAbsFold = {
  baseLower: string;
  addend: number;
};

export function containsLayoutCast(ea: EaExprNode): boolean {
  switch (ea.kind) {
    case 'EaName':
    case 'EaImm':
      return false;
    case 'EaReinterpret':
      return true;
    case 'EaField':
    case 'EaAdd':
    case 'EaSub':
    case 'EaIndex':
      return containsLayoutCast(ea.base);
  }
}

export function hasRuntimeIndexInLayoutCast(ea: EaExprNode): boolean {
  switch (ea.kind) {
    case 'EaName':
    case 'EaImm':
      return false;
    case 'EaReinterpret':
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

/** Label or label±imm base for `<Type>base[path]` — not register or stack slots. */
export function isLayoutCastLabelBase(
  ea: EaExprNode,
  stackSlotOffsets: ReadonlyMap<string, number>,
): boolean {
  switch (ea.kind) {
    case 'EaName': {
      if (TYPED_REINTERPRET_BASE_REGISTERS.has(ea.name.toUpperCase())) return false;
      if (stackSlotOffsets.has(ea.name.toLowerCase())) return false;
      return true;
    }
    case 'EaAdd':
    case 'EaSub':
      return isLayoutCastLabelBase(ea.base, stackSlotOffsets);
    default:
      return false;
  }
}

type DecomposedLayoutCast = {
  reinterpret: Extract<EaExprNode, { kind: 'EaReinterpret' }>;
  path: OffsetofPathNode;
};

function decomposeLayoutCastEa(ea: EaExprNode): DecomposedLayoutCast | undefined {
  const steps: OffsetofPathStepNode[] = [];
  let cur: EaExprNode = ea;

  while (cur.kind === 'EaField') {
    steps.unshift({ kind: 'OffsetofField', span: cur.span, name: cur.field });
    cur = cur.base;
  }

  while (cur.kind === 'EaIndex') {
    if (cur.index.kind !== 'IndexImm') return undefined;
    steps.unshift({ kind: 'OffsetofIndex', span: cur.span, expr: cur.index.value });
    cur = cur.base;
  }

  if (cur.kind !== 'EaReinterpret') return undefined;
  return {
    reinterpret: cur,
    path: { kind: 'OffsetofPath', span: cur.span, steps },
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
    stackSlotOffsets: ReadonlyMap<string, number>;
    evalImm: (expr: ImmExprNode) => number | undefined;
    resolveAbsBase: (baseEa: EaExprNode) => LayoutCastAbsFold | undefined;
    diagnostics?: Diagnostic[];
  },
): LayoutCastAbsFold | undefined {
  if (!isConstantLayoutCastEa(ea)) return undefined;

  const decomposed = decomposeLayoutCastEa(ea);
  if (!decomposed) return undefined;
  if (!isLayoutCastLabelBase(decomposed.reinterpret.base, params.stackSlotOffsets)) return undefined;

  const pathOffset = offsetOfPathInTypeExpr(
    decomposed.reinterpret.typeExpr,
    decomposed.path,
    params.env,
    params.evalImm,
    params.diagnostics,
  );
  if (pathOffset === undefined) return undefined;

  const base = params.resolveAbsBase(decomposed.reinterpret.base);
  if (!base) return undefined;

  return {
    baseLower: base.baseLower,
    addend: (base.addend + pathOffset) & 0xffff,
  };
}

export function layoutCastRuntimeIndexMessage(): string {
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
  path: OffsetofPathNode,
  env: CompileEnv,
  evalImm: (expr: ImmExprNode) => number | undefined,
  diagnostics?: Diagnostic[],
): number | undefined {
  return offsetOfPathInTypeExpr(typeExpr, path, env, evalImm, diagnostics);
}
