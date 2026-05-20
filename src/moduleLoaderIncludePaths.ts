import { dirname, resolve } from 'node:path';

import { normalizePath } from './compileShared.js';

export function resolveIncludeCandidates(
  fromModulePath: string,
  specifier: string,
  includeDirs: string[],
): string[] {
  const fromDir = dirname(fromModulePath);
  const out: string[] = [];
  out.push(normalizePath(resolve(fromDir, specifier)));
  for (const inc of includeDirs) {
    out.push(normalizePath(resolve(inc, specifier)));
  }
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
}
