import { parseNumberLiteral } from '../frontend/parseImm.js';
import type { CompileEnv } from '../semantics/env.js';
import { resolveAsmEquSymbol } from './asmEquResolution.js';

export type FixupBaseResolver = (
  nameLower: string,
  visiting?: Set<string>,
) => number | undefined;

export function createFixupBaseResolver(args: {
  env: CompileEnv;
  addrByNameLower: Map<string, number>;
}): FixupBaseResolver {
  const { env, addrByNameLower } = args;

  return (nameLower: string, visiting = new Set<string>()): number | undefined => {
    const sym = addrByNameLower.get(nameLower);
    if (sym !== undefined) return sym;
    const literal = parseNumberLiteral(nameLower);
    if (literal !== undefined) return literal;
    if (/^-?[0-9]+$/.test(nameLower)) return Number.parseInt(nameLower, 10);
    return resolveAsmEquSymbol(
      nameLower,
      {
        env,
        lookupSymbol: (name) => addrByNameLower.get(name),
        cacheResolved: (name, value) => {
          addrByNameLower.set(name, value);
          env.consts.set(name, value);
        },
      },
      visiting,
    );
  };
}
