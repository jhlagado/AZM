import type { TypeDeclNode, UnionDeclNode } from './frontend/ast.js';
import type { CompileEnv } from './semantics/env.js';

export type VisibleSymbolKind = 'const' | 'enum' | 'type';

type ResolutionMaps<T> = {
  localMap: ReadonlyMap<string, T> | undefined;
  visibleMap: ReadonlyMap<string, T> | undefined;
};

function resolveVisibleSymbolWithMaps<T>(
  name: string,
  file: string,
  env: CompileEnv,
  maps: ResolutionMaps<T>,
): T | undefined {
  const local = maps.localMap?.get(name);
  if (local !== undefined) return local;

  const qualifier = moduleQualifierOf(name);
  if (!qualifier) return undefined;
  if (!canAccessQualifiedName(name, file, env)) return undefined;
  return maps.visibleMap?.get(name);
}

export function resolveVisibleSymbol(
  kind: 'const',
  name: string,
  file: string,
  env: CompileEnv,
): number | undefined;
export function resolveVisibleSymbol(
  kind: 'enum',
  name: string,
  file: string,
  env: CompileEnv,
): number | undefined;
export function resolveVisibleSymbol(
  kind: 'type',
  name: string,
  file: string,
  env: CompileEnv,
): TypeDeclNode | UnionDeclNode | undefined;
export function resolveVisibleSymbol(
  kind: VisibleSymbolKind,
  name: string,
  file: string,
  env: CompileEnv,
): number | TypeDeclNode | UnionDeclNode | undefined {
  switch (kind) {
    case 'const':
      return resolveVisibleSymbolWithMaps(name, file, env, {
        localMap: env.consts,
        visibleMap: env.visibleConsts,
      });
    case 'enum':
      return resolveVisibleSymbolWithMaps(name, file, env, {
        localMap: env.enums,
        visibleMap: env.visibleEnums,
      });
    case 'type':
      return resolveVisibleSymbolWithMaps(name, file, env, {
        localMap: env.types,
        visibleMap: env.visibleTypes,
      });
  }
}

export function moduleQualifierOf(name: string): string | undefined {
  const dot = name.indexOf('.');
  if (dot <= 0) return undefined;
  return name.slice(0, dot);
}

export function canAccessQualifiedName(name: string, file: string, env: CompileEnv): boolean {
  const qualifier = moduleQualifierOf(name);
  if (!qualifier) return true;

  const currentModuleId = env.moduleIds?.get(file);
  if (currentModuleId === qualifier) return true;

  const imported = env.importedModuleIds?.get(file);
  if (!imported) return false;
  return imported.has(qualifier);
}

export function resolveVisibleConst(name: string, file: string, env: CompileEnv): number | undefined {
  return resolveVisibleSymbol('const', name, file, env);
}

export function resolveVisibleEnum(name: string, file: string, env: CompileEnv): number | undefined {
  return resolveVisibleSymbol('enum', name, file, env);
}

export function resolveVisibleType(
  name: string,
  file: string,
  env: CompileEnv,
): TypeDeclNode | UnionDeclNode | undefined {
  return resolveVisibleSymbol('type', name, file, env);
}
