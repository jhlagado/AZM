import { dirname, isAbsolute, relative, resolve } from 'node:path';

function stripLastExtension(pathText: string): string {
  return pathText.replace(/\.[^./]+$/, '');
}

export function canonicalModuleId(modulePath: string, rootDir = dirname(modulePath)): string {
  const absoluteRoot = resolve(rootDir);
  const absoluteModule = isAbsolute(modulePath) ? resolve(modulePath) : resolve(absoluteRoot, modulePath);
  const rel = relative(absoluteRoot, absoluteModule).replace(/\\/g, '/');
  return stripLastExtension(rel);
}
