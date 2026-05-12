/**
 * storageView.ts — canonical storage-collection layer for semantic passes.
 *
 * Both `assignmentAcceptance` and `stepAcceptance` need the same two-phase
 * storage picture: module-level symbols collected once from the whole program,
 * and per-function locals collected fresh for each function body.  This module
 * is the single source of truth for both.
 */

import { DiagnosticIds } from '../diagnosticTypes.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import type {
  EaExprNode,
  ProgramNode,
  SourceSpan,
  TypeExprNode,
  VarDeclNode,
} from '../frontend/ast.js';
import { resolveVisibleType } from '../moduleVisibility.js';
import { visitDeclTree } from './declVisitor.js';
import type { CompileEnv } from './env.js';

// ---------------------------------------------------------------------------
// Scalar-kind resolution (needed during module-storage collection to
// distinguish raw-address data symbols from scalar-typed ones).
// ---------------------------------------------------------------------------

/** Primitive scalar width categories understood by the semantic layer. */
export type ScalarKind = 'byte' | 'word' | 'addr';

/**
 * Resolve a `TypeExprNode` down to a `ScalarKind`, following `TypeDecl` aliases
 * once per name (cycle-protected).  Returns `undefined` for aggregate types.
 */
export function resolveScalarKindInEnv(
  typeExpr: TypeExprNode,
  env: CompileEnv,
  seen: Set<string> = new Set(),
): ScalarKind | undefined {
  if (typeExpr.kind !== 'TypeName') return undefined;
  const lower = typeExpr.name.toLowerCase();
  if (lower === 'byte' || lower === 'word' || lower === 'addr') return lower;
  if (seen.has(lower)) return undefined;
  seen.add(lower);
  const decl = resolveVisibleType(typeExpr.name, typeExpr.span.file, env);
  if (!decl || decl.kind !== 'TypeDecl') return undefined;
  return resolveScalarKindInEnv(decl.typeExpr, env, seen);
}

// ---------------------------------------------------------------------------
// Module-level storage view
// ---------------------------------------------------------------------------

export type ModuleStorageView = {
  /** Maps lowercased symbol name → TypeExprNode for typed module-level storage. */
  storageTypes: Map<string, TypeExprNode>;
  /** Lowercased symbol names whose declared type is not scalar (raw-address data). */
  rawAddressSymbols: Set<string>;
  /** Lowercased alias name → the EA expression it was initialised with. */
  moduleAliasTargets: Map<string, EaExprNode>;
};

/**
 * Walk the whole program once and collect every module-level storage symbol.
 * This is identical to what the two acceptance passes previously each inlined.
 */
export function collectModuleStorage(program: ProgramNode, env: CompileEnv): ModuleStorageView {
  const storageTypes = new Map<string, TypeExprNode>();
  const rawAddressSymbols = new Set<string>();
  const moduleAliasTargets = new Map<string, EaExprNode>();

  visitDeclTree(program.files.flatMap((file) => file.items), (item, ctx) => {
    const namedSection = ctx.section;
    switch (item.kind) {
      case 'VarBlock':
        if (item.scope !== 'module' || namedSection) return;
        for (const decl of item.decls) {
          const lower = decl.name.toLowerCase();
          if (decl.form === 'typed') storageTypes.set(lower, decl.typeExpr);
          else moduleAliasTargets.set(lower, decl.initializer.expr);
        }
        return;
      case 'DataBlock':
        for (const decl of item.decls) {
          const lower = decl.name.toLowerCase();
          storageTypes.set(lower, decl.typeExpr);
          if (!resolveScalarKindInEnv(decl.typeExpr, env)) rawAddressSymbols.add(lower);
        }
        return;
      case 'DataDecl': {
        if (namedSection && namedSection.section !== 'data') return;
        const lower = item.name.toLowerCase();
        storageTypes.set(lower, item.typeExpr);
        if (!resolveScalarKindInEnv(item.typeExpr, env)) rawAddressSymbols.add(lower);
        return;
      }
      case 'BinDecl':
      case 'HexDecl':
      case 'RawDataDecl':
        if (item.name.length > 0) {
          rawAddressSymbols.add(item.name.toLowerCase());
        }
        return;
      default:
        return;
    }
  });

  return { storageTypes, rawAddressSymbols, moduleAliasTargets };
}

// ---------------------------------------------------------------------------
// Per-function local storage view
// ---------------------------------------------------------------------------

export type FunctionLocalView = {
  /** Maps lowercased local/param name → TypeExprNode. */
  stackSlotTypes: Map<string, TypeExprNode>;
  /** Maps lowercased alias name → EA expression. */
  localAliasTargets: Map<string, EaExprNode>;
};

/** Build the local-variable view for a single function body. */
export function collectFunctionLocals(decls: VarDeclNode[]): FunctionLocalView {
  const stackSlotTypes = new Map<string, TypeExprNode>();
  const localAliasTargets = new Map<string, EaExprNode>();
  for (const decl of decls) {
    const lower = decl.name.toLowerCase();
    if (decl.form === 'typed') stackSlotTypes.set(lower, decl.typeExpr);
    else localAliasTargets.set(lower, decl.initializer.expr);
  }
  return { stackSlotTypes, localAliasTargets };
}

// ---------------------------------------------------------------------------
// Shared diagnostic helper
// ---------------------------------------------------------------------------

/** Append a SemanticsError diagnostic at the given source span. */
export function diagAt(diagnostics: Diagnostic[], span: SourceSpan, message: string): void {
  diagnostics.push({
    id: DiagnosticIds.SemanticsError,
    severity: 'error',
    message,
    file: span.file,
    line: span.start.line,
    column: span.start.column,
  });
}
