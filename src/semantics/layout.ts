import type { Diagnostic } from '../diagnosticTypes.js';
import { DiagnosticIds } from '../diagnosticTypes.js';
import type {
  ImmExprNode,
  OffsetofPathNode,
  RecordFieldNode,
  TypeDeclNode,
  TypeExprNode,
  UnionDeclNode,
} from '../frontend/ast.js';
import { resolveVisibleType } from '../moduleVisibility.js';
import type { CompileEnv } from './env.js';

export interface TypeStorageInfo {
  size: number;
}

function scalarSize(name: string): number | undefined {
  switch (name) {
    case 'byte':
      return 1;
    case 'word':
    case 'addr':
      return 2;
    default:
      return undefined;
  }
}

type TypeSizeResolver = (te: TypeExprNode) => TypeStorageInfo | undefined;

type ResolveNamedTypeResult =
  | { kind: 'Scalar'; name: string; size: number }
  | { kind: 'Decl'; decl: TypeDeclNode | UnionDeclNode };

function resolveNamedType<T>(
  te: Extract<TypeExprNode, { kind: 'TypeName' }>,
  env: CompileEnv,
  visiting: Set<string>,
  diag: (file: string, message: string) => void,
  onResolve: (resolved: ResolveNamedTypeResult) => T | undefined,
): T | undefined {
  const s = scalarSize(te.name);
  if (s !== undefined) return onResolve({ kind: 'Scalar', name: te.name, size: s });
  if (visiting.has(te.name)) {
    diag(te.span.file, `Recursive type definition detected for "${te.name}".`);
    return undefined;
  }
  const decl = resolveVisibleType(te.name, te.span.file, env);
  if (!decl) {
    diag(te.span.file, `Unknown type "${te.name}".`);
    return undefined;
  }

  visiting.add(te.name);
  try {
    return onResolve({ kind: 'Decl', decl });
  } finally {
    visiting.delete(te.name);
  }
}

function typeStorageInfoForDecl(
  decl: TypeDeclNode | UnionDeclNode,
  resolveTypeExpr: TypeSizeResolver,
): TypeStorageInfo | undefined {
  if (decl.kind === 'UnionDecl') {
    let maxStorage = 0;
    for (const f of decl.fields) {
      const fs = resolveTypeExpr(f.typeExpr);
      if (!fs) return undefined;
      if (fs.size > maxStorage) maxStorage = fs.size;
    }
    return { size: maxStorage };
  }

  const te = decl.typeExpr;
  if (te.kind === 'RecordType') {
    let sum = 0;
    for (const f of te.fields) {
      const fs = resolveTypeExpr(f.typeExpr);
      if (!fs) return undefined;
      sum += fs.size;
    }
    return { size: sum };
  }
  return resolveTypeExpr(te);
}

export function storageInfoForTypeExpr(
  typeExpr: TypeExprNode,
  env: CompileEnv,
  diagnostics?: Diagnostic[],
): TypeStorageInfo | undefined {
  const visiting = new Set<string>();
  const memo = new Map<string, TypeStorageInfo>();

  const diag = (file: string, message: string) => {
    diagnostics?.push({ id: DiagnosticIds.TypeError, severity: 'error', message, file });
  };

  const sizeOf = (te: TypeExprNode): TypeStorageInfo | undefined => {
    switch (te.kind) {
      case 'TypeName': {
        const cached = memo.get(te.name);
        if (cached !== undefined) return cached;
        return resolveNamedType(te, env, visiting, diag, (resolved) => {
          if (resolved.kind === 'Scalar') {
            return { size: resolved.size };
          }
          const info = typeStorageInfoForDecl(resolved.decl, sizeOf);
          if (info) memo.set(te.name, info);
          return info;
        });
      }
      case 'ArrayType': {
        const es = sizeOf(te.element);
        if (!es) return undefined;
        if (te.length === undefined) {
          diag(
            te.span.file,
            `Array length is required here (inferred-length arrays like "T[]" are only permitted in data declarations with an initializer).`,
          );
          return undefined;
        }
        return { size: es.size * te.length };
      }
      case 'RecordType': {
        let sum = 0;
        for (const f of te.fields) {
          const fs = sizeOf(f.typeExpr);
          if (!fs) return undefined;
          sum += fs.size;
        }
        return { size: sum };
      }
      case 'AddrOfType':
        return { size: 2 };
    }
  };

  return sizeOf(typeExpr);
}

/**
 * Compute the exact semantic size in bytes of a type expression.
 */
export function sizeOfTypeExpr(
  typeExpr: TypeExprNode,
  env: CompileEnv,
  diagnostics?: Diagnostic[],
): number | undefined {
  const info = storageInfoForTypeExpr(typeExpr, env, diagnostics);
  return info?.size;
}

/**
 * Compute the byte offset of a field path inside a type expression.
 *
 * Rules:
 * - Record fields contribute exact sizes of preceding fields.
 * - Union field offsets are always 0.
 * - Array indices must be compile-time constants and contribute index * element exact size.
 */
export function offsetOfPathInTypeExpr(
  typeExpr: TypeExprNode,
  path: OffsetofPathNode,
  env: CompileEnv,
  evalImm: (expr: ImmExprNode) => number | undefined,
  diagnostics?: Diagnostic[],
): number | undefined {
  type ResolvedType =
    | { kind: 'Scalar'; name: string }
    | { kind: 'Array'; element: TypeExprNode; length: number }
    | { kind: 'Record'; fields: RecordFieldNode[] }
    | { kind: 'Union'; fields: RecordFieldNode[] };

  const diag = (file: string, message: string) => {
    diagnostics?.push({ id: DiagnosticIds.TypeError, severity: 'error', message, file });
  };

  const resolveType = (
    te: TypeExprNode,
    visiting = new Set<string>(),
  ): ResolvedType | undefined => {
    switch (te.kind) {
      case 'TypeName':
        return resolveNamedType(te, env, visiting, diag, (resolved) => {
          if (resolved.kind === 'Scalar') return { kind: 'Scalar', name: resolved.name };
          if (resolved.decl.kind === 'UnionDecl') return { kind: 'Union', fields: resolved.decl.fields };
          return resolveType(resolved.decl.typeExpr, visiting);
        });
      case 'AddrOfType':
        return resolveType(te.target, visiting);
      case 'ArrayType': {
        if (te.length === undefined) {
          diag(
            te.span.file,
            `Array length is required here (inferred-length arrays like "T[]" are only permitted in data declarations with an initializer).`,
          );
          return undefined;
        }
        return { kind: 'Array', element: te.element, length: te.length };
      }
      case 'RecordType':
        return { kind: 'Record', fields: te.fields };
    }
  };

  const findField = (
    fields: RecordFieldNode[],
    fieldName: string,
    file: string,
  ): { field: RecordFieldNode; offsetBefore: number } | undefined => {
    let offsetBefore = 0;
    for (const f of fields) {
      if (f.name === fieldName) return { field: f, offsetBefore };
      const fs = sizeOfTypeExpr(f.typeExpr, env, diagnostics);
      if (fs === undefined) return undefined;
      offsetBefore += fs;
    }
    diag(file, `Unknown field "${fieldName}".`);
    return undefined;
  };

  const initial = resolveType(typeExpr);
  if (!initial) return undefined;
  let cur: ResolvedType = initial;
  let total = 0;
  const file = path.span.file;

  const selectField = (name: string): boolean => {
    if (cur.kind === 'Record') {
      const found = findField(cur.fields, name, file);
      if (!found) return false;
      total += found.offsetBefore;
      const next = resolveType(found.field.typeExpr);
      if (!next) return false;
      cur = next;
      return true;
    }
    if (cur.kind === 'Union') {
      const found = findField(cur.fields, name, file);
      if (!found) return false;
      const next = resolveType(found.field.typeExpr);
      if (!next) return false;
      cur = next;
      return true;
    }
    diag(file, `Cannot select field "${name}" from non-record/union type.`);
    return false;
  };

  if (!selectField(path.base)) return undefined;

  for (const step of path.steps) {
    if (step.kind === 'OffsetofField') {
      if (!selectField(step.name)) return undefined;
      continue;
    }

    if (cur.kind !== 'Array') {
      diag(file, `Cannot index into non-array type in offsetof path.`);
      return undefined;
    }

    const idx = evalImm(step.expr);
    if (idx === undefined) {
      diag(file, `Failed to evaluate offsetof index expression.`);
      return undefined;
    }
    if (!Number.isInteger(idx)) {
      diag(file, `offsetof index must evaluate to an integer.`);
      return undefined;
    }
    if (idx < 0 || idx >= cur.length) {
      diag(file, `offsetof index ${idx} out of bounds for length ${cur.length}.`);
      return undefined;
    }

    const elemSize = sizeOfTypeExpr(cur.element, env, diagnostics);
    if (elemSize === undefined) return undefined;
    total += idx * elemSize;
    const next = resolveType(cur.element);
    if (!next) return undefined;
    cur = next;
  }

  return total;
}
