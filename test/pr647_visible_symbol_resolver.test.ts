import { describe, expect, it } from 'vitest';

import type { SourceSpan, TypeDeclNode, UnionDeclNode } from '../src/frontend/ast.js';
import {
  resolveVisibleSymbol,
  resolveVisibleConst,
  resolveVisibleEnum,
  resolveVisibleType,
} from '../src/moduleVisibility.js';
import type { CompileEnv } from '../src/semantics/env.js';

const span: SourceSpan = {
  file: 'pr647.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const typeDecl: TypeDeclNode = {
  kind: 'TypeDecl',
  span,
  name: 'LocalType',
  exported: false,
  typeExpr: { kind: 'TypeName', span, name: 'word' },
};

const unionDecl: UnionDeclNode = {
  kind: 'UnionDecl',
  span,
  name: 'RemoteType',
  exported: true,
  fields: [],
};

function makeEnv(): CompileEnv {
  return {
    consts: new Map([['LOCAL', 1]]),
    enums: new Map([['Mode.Value', 7]]),
    types: new Map([['LocalType', typeDecl]]),
    visibleConsts: new Map([['dep.REMOTE', 2]]),
    visibleEnums: new Map([['dep.Mode.Value', 9], ['Mode.Value', 99]]),
    visibleTypes: new Map([['dep.RemoteType', unionDecl]]),
    moduleIds: new Map([['root.zax', 'root']]),
    importedModuleIds: new Map([['root.zax', new Set(['dep'])]]),
  };
}

describe('PR647 visible symbol resolver consolidation', () => {
  it('resolves local and imported visible consts and types through shared path', () => {
    const env = makeEnv();

    expect(resolveVisibleConst('LOCAL', 'root.zax', env)).toBe(1);
    expect(resolveVisibleConst('dep.REMOTE', 'root.zax', env)).toBe(2);
    expect(resolveVisibleType('LocalType', 'root.zax', env)).toBe(typeDecl);
    expect(resolveVisibleType('dep.RemoteType', 'root.zax', env)).toBe(unionDecl);
  });

  it('preserves enum local precedence over qualified-alias lookup', () => {
    const env = makeEnv();

    expect(resolveVisibleEnum('Mode.Value', 'root.zax', env)).toBe(7);
    expect(resolveVisibleEnum('dep.Mode.Value', 'root.zax', env)).toBe(9);
  });

  it('applies one shared precedence rule: local first, then imported qualified alias', () => {
    const env = makeEnv();

    expect(resolveVisibleSymbol('const', 'LOCAL', 'root.zax', env)).toBe(1);
    expect(resolveVisibleSymbol('enum', 'Mode.Value', 'root.zax', env)).toBe(7);
    expect(resolveVisibleSymbol('type', 'LocalType', 'root.zax', env)).toBe(typeDecl);

    expect(resolveVisibleSymbol('const', 'dep.REMOTE', 'root.zax', env)).toBe(2);
    expect(resolveVisibleSymbol('enum', 'dep.Mode.Value', 'root.zax', env)).toBe(9);
    expect(resolveVisibleSymbol('type', 'dep.RemoteType', 'root.zax', env)).toBe(unionDecl);
  });

  it('fails closed for non-imported qualified access', () => {
    const env = makeEnv();
    env.importedModuleIds?.set('root.zax', new Set());

    expect(resolveVisibleConst('dep.REMOTE', 'root.zax', env)).toBeUndefined();
    expect(resolveVisibleType('dep.RemoteType', 'root.zax', env)).toBeUndefined();
    expect(resolveVisibleEnum('dep.Mode.Value', 'root.zax', env)).toBeUndefined();
  });
});
