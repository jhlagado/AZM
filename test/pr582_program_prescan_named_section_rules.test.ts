import { describe, expect, it } from 'vitest';

import type { ProgramNode } from '../src/frontend/ast.js';
import { preScanProgramDeclarations } from '../src/lowering/programLowering.js';

describe('PR582 named section pre-scan rules', () => {
  it('does not let invalid section-local globals blocks mutate pre-scan state', () => {
    const program = {
      kind: 'Program',
      entryFile: 'pr582_prescan_var.zax',
      files: [
        {
          kind: 'ModuleFile',
          span: { file: 'pr582_prescan_var.zax' },
          items: [
            {
              kind: 'NamedSection',
              section: 'code',
              name: 'boot',
              items: [
                {
                  kind: 'VarBlock',
                  scope: 'module',
                  decls: [
                    {
                      name: 'x',
                      typeExpr: { kind: 'TypeName', name: 'byte' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as ProgramNode;

    const storageTypes = new Map<string, unknown>();
    const moduleAliasTargets = new Map<string, unknown>();
    const moduleAliasDecls = new Map<string, unknown>();
    const rawAddressSymbols = new Set<string>();
    const declaredBinNames = new Set<string>();

    preScanProgramDeclarations(({
      program,
      callables: new Map(),
      opsByName: new Map(),
      declaredOpNames: new Set(),
      declaredBinNames,
      deferredExterns: [],
      storageTypes,
      moduleAliasTargets,
      moduleAliasDecls,
      rawAddressSymbols,
      resolveScalarKind: () => undefined,
    } as unknown) as Parameters<typeof preScanProgramDeclarations>[0]);

    expect(storageTypes.has('x')).toBe(false);
    expect(moduleAliasTargets.size).toBe(0);
    expect(moduleAliasDecls.size).toBe(0);
    expect(rawAddressSymbols.size).toBe(0);
    expect(declaredBinNames.size).toBe(0);
  });
});
