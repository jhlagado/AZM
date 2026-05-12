import { describe, expect, it } from 'vitest';

import type { ProgramNode, TypeExprNode } from '../src/frontend/ast.js';
import { preScanProgramDeclarations } from '../src/lowering/programLowering.js';

function scalarKind(typeExpr: TypeExprNode): 'byte' | 'word' | 'addr' | undefined {
  if (typeExpr.kind !== 'TypeName') return undefined;
  const lower = typeExpr.name.toLowerCase();
  if (lower === 'byte' || lower === 'word' || lower === 'addr') return lower;
  return undefined;
}

function makeProgram(sectionItems: unknown[]): ProgramNode {
  return {
    kind: 'Program',
    entryFile: 'pr622_direct_decl.zax',
    files: [
      {
        kind: 'ModuleFile',
        span: { file: 'pr622_direct_decl.zax' },
        items: [
          {
            kind: 'NamedSection',
            section: 'data',
            name: 'vars',
            span: { file: 'pr622_direct_decl.zax' },
            items: sectionItems,
          },
        ],
      },
    ],
  } as unknown as ProgramNode;
}

function runPreScan(program: ProgramNode) {
  const storageTypes = new Map<string, TypeExprNode>();
  const rawAddressSymbols = new Set<string>();

  preScanProgramDeclarations(({
    program,
    localCallablesByFile: new Map(),
    localOpsByFile: new Map(),
    visibleCallables: new Map(),
    visibleOpsByName: new Map(),
    callables: new Map(),
    opsByName: new Map(),
    declaredOpNames: new Set(),
    declaredBinNames: new Set(),
    deferredExterns: [],
    storageTypes,
    moduleAliasTargets: new Map(),
    moduleAliasDecls: new Map(),
    rawAddressSymbols,
    resolveScalarKind: scalarKind,
    env: { moduleIds: new Map() },
  } as unknown) as Parameters<typeof preScanProgramDeclarations>[0]);

  return { storageTypes, rawAddressSymbols };
}

describe('PR622 pre-scan direct data declaration semantics', () => {
  it('registers scalar direct declarations inside named data sections', () => {
    const program = makeProgram([
      {
        kind: 'DataDecl',
        name: 'counter',
        span: { file: 'pr622_direct_decl.zax' },
        typeExpr: { kind: 'TypeName', span: { file: 'pr622_direct_decl.zax' }, name: 'byte' },
        initializer: { kind: 'InitZero', span: { file: 'pr622_direct_decl.zax' } },
      },
    ]);

    const { storageTypes, rawAddressSymbols } = runPreScan(program);

    expect(storageTypes.get('counter')).toMatchObject({ kind: 'TypeName', name: 'byte' });
    expect(rawAddressSymbols.has('counter')).toBe(false);
  });

  it('registers aggregate direct declarations equivalently to data blocks', () => {
    const aggregateType = {
      kind: 'ArrayType',
      span: { file: 'pr622_direct_decl.zax' },
      element: { kind: 'TypeName', span: { file: 'pr622_direct_decl.zax' }, name: 'byte' },
      length: 4,
    } as const;

    const directProgram = makeProgram([
      {
        kind: 'DataDecl',
        name: 'table',
        span: { file: 'pr622_direct_decl.zax' },
        typeExpr: aggregateType,
        initializer: { kind: 'InitZero', span: { file: 'pr622_direct_decl.zax' } },
      },
    ]);
    const blockProgram = makeProgram([
      {
        kind: 'DataBlock',
        span: { file: 'pr622_direct_decl.zax' },
        decls: [
          {
            kind: 'DataDecl',
            name: 'table',
            span: { file: 'pr622_direct_decl.zax' },
            typeExpr: aggregateType,
            initializer: { kind: 'InitZero', span: { file: 'pr622_direct_decl.zax' } },
          },
        ],
      },
    ]);

    const direct = runPreScan(directProgram);
    const block = runPreScan(blockProgram);

    expect(direct.storageTypes.get('table')).toMatchObject({ kind: 'ArrayType', length: 4 });
    expect(direct.rawAddressSymbols.has('table')).toBe(true);

    expect(direct.storageTypes.get('table')).toEqual(block.storageTypes.get('table'));
    expect(direct.rawAddressSymbols.has('table')).toBe(block.rawAddressSymbols.has('table'));
  });
});
