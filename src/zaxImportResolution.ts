import { dirname, resolve } from 'node:path';

import { normalizePath } from './compileShared.js';
import type { ImportNode, ModuleFileNode } from './frontend/ast.js';

/** Temporary `.zax` retirement lane only: native AZM uses textual includes, not import modules. */
export function zaxImportTargets(moduleFile: ModuleFileNode): ImportNode[] {
  return moduleFile.items.filter((i): i is ImportNode => i.kind === 'Import');
}

/** Temporary `.zax` retirement lane only: resolve an import declaration to its candidate file segment. */
export function zaxImportCandidatePath(imp: ImportNode): string {
  if (imp.form === 'path') return imp.specifier;
  return `${imp.specifier}.zax`;
}

/** Temporary `.zax` retirement lane only: native AZM source organization should use includes. */
export function resolveZaxImportCandidates(
  fromModulePath: string,
  imp: ImportNode,
  includeDirs: string[],
): string[] {
  const fromDir = dirname(fromModulePath);
  const candidateRel = zaxImportCandidatePath(imp);

  const out: string[] = [];
  out.push(normalizePath(resolve(fromDir, candidateRel)));
  for (const inc of includeDirs) {
    out.push(normalizePath(resolve(inc, candidateRel)));
  }
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
}
