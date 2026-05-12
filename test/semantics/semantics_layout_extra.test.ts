import { describe, expect, it } from 'vitest';

import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import type { CompileEnv } from '../../src/semantics/env.js';
import {
  offsetOfPathInTypeExpr,
  sizeOfTypeExpr,
  storageInfoForTypeExpr,
} from '../../src/semantics/layout.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';
import type {
  ImmExprNode,
  OffsetofPathNode,
  RecordFieldNode,
  TypeDeclNode,
  TypeExprNode,
  UnionDeclNode,
} from '../../src/frontend/ast.js';

const span = {
  file: 'test.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const byteType: TypeExprNode = { kind: 'TypeName', span, name: 'byte' };
const wordType: TypeExprNode = { kind: 'TypeName', span, name: 'word' };

function recordField(name: string, typeExpr: TypeExprNode): RecordFieldNode {
  return { kind: 'RecordField', span, name, typeExpr };
}

describe('semantics/layout', () => {
  const emptyEnv: CompileEnv = { consts: new Map(), enums: new Map(), types: new Map() };

  it('computes exact storage for records and unions', () => {
    const rec: TypeExprNode = {
      kind: 'RecordType',
      span,
      fields: [recordField('x', byteType), recordField('y', wordType)],
    };
    const info = storageInfoForTypeExpr(rec, emptyEnv);
    expect(info).toEqual({ size: 3 });

    const unionDecl: UnionDeclNode = {
      kind: 'UnionDecl',
      span,
      name: 'U',
      exported: false,
      fields: [recordField('a', byteType), recordField('b', wordType)],
    };
    const env: CompileEnv = { ...emptyEnv, types: new Map([['U', unionDecl]]) };
    const unionInfo = storageInfoForTypeExpr({ kind: 'TypeName', span, name: 'U' }, env);
    expect(unionInfo).toEqual({ size: 2 });
  });

  it('computes exact sizes for records via sizeOfTypeExpr', () => {
    const rec: TypeExprNode = {
      kind: 'RecordType',
      span,
      fields: [recordField('x', byteType), recordField('y', wordType)],
    };
    const storage = sizeOfTypeExpr(rec, emptyEnv);
    expect(storage).toBe(3);
  });

  it('rejects inferred-length arrays without initializer', () => {
    const arr: TypeExprNode = { kind: 'ArrayType', span, element: byteType };
    const diagnostics: any[] = [];
    const info = storageInfoForTypeExpr(arr, emptyEnv, diagnostics);
    expect(info).toBeUndefined();
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      messageIncludes: 'Array length is required',
    });
  });

  it('diagnoses recursive type reference', () => {
    const selfDecl: TypeDeclNode = {
      kind: 'TypeDecl',
      span,
      name: 'Self',
      exported: false,
      typeExpr: { kind: 'TypeName', span, name: 'Self' },
    };
    const env: CompileEnv = { ...emptyEnv, types: new Map([['Self', selfDecl]]) };
    const diagnostics: any[] = [];
    const info = storageInfoForTypeExpr({ kind: 'TypeName', span, name: 'Self' }, env, diagnostics);
    expect(info).toBeUndefined();
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      messageIncludes: 'Recursive type definition',
    });
  });

  it('computes offsetof paths through records', () => {
    const point: TypeDeclNode = {
      kind: 'TypeDecl',
      span,
      name: 'Point',
      exported: false,
      typeExpr: {
        kind: 'RecordType',
        span,
        fields: [recordField('x', byteType), recordField('y', wordType)],
      },
    };
    const env: CompileEnv = { ...emptyEnv, types: new Map([['Point', point]]) };
    const pathFieldY: OffsetofPathNode = { kind: 'OffsetofPath', span, base: 'y', steps: [] };
    const offset = offsetOfPathInTypeExpr(
      { kind: 'TypeName', span, name: 'Point' },
      pathFieldY,
      env,
      () => 0,
    );
    expect(offset).toBe(1); // byte field x (1) before y
  });

  it('uses exact record fields and exact array stride in offsetof', () => {
    const inner: TypeDeclNode = {
      kind: 'TypeDecl',
      span,
      name: 'Inner',
      exported: false,
      typeExpr: {
        kind: 'RecordType',
        span,
        fields: [recordField('a', byteType), recordField('b', wordType)],
      },
    };
    const outer: TypeDeclNode = {
      kind: 'TypeDecl',
      span,
      name: 'Outer',
      exported: false,
      typeExpr: {
        kind: 'RecordType',
        span,
        fields: [
          recordField('lead', byteType),
          recordField('inner', { kind: 'TypeName', span, name: 'Inner' }),
          recordField('tail', byteType),
        ],
      },
    };
    const table: TypeDeclNode = {
      kind: 'TypeDecl',
      span,
      name: 'Table',
      exported: false,
      typeExpr: {
        kind: 'RecordType',
        span,
        fields: [
          recordField('rows', {
            kind: 'ArrayType',
            span,
            element: { kind: 'TypeName', span, name: 'Inner' },
            length: 2,
          }),
        ],
      },
    };
    const env: CompileEnv = {
      ...emptyEnv,
      types: new Map([
        ['Inner', inner],
        ['Outer', outer],
        ['Table', table],
      ]),
    };
    const evalImm = (expr: ImmExprNode) => (expr.kind === 'ImmLiteral' ? expr.value : undefined);
    const diagnostics: any[] = [];

    const tailPath: OffsetofPathNode = { kind: 'OffsetofPath', span, base: 'tail', steps: [] };
    const tailOffset = offsetOfPathInTypeExpr(
      { kind: 'TypeName', span, name: 'Outer' },
      tailPath,
      env,
      evalImm,
      diagnostics,
    );
    expect(tailOffset).toBe(4); // lead (1) + inner packed (3)

    const rowsPath: OffsetofPathNode = {
      kind: 'OffsetofPath',
      span,
      base: 'rows',
      steps: [
        { kind: 'OffsetofIndex', span, expr: { kind: 'ImmLiteral', span, value: 1 } },
        { kind: 'OffsetofField', span, name: 'b' },
      ],
    };
    const rowsOffset = offsetOfPathInTypeExpr(
      { kind: 'TypeName', span, name: 'Table' },
      rowsPath,
      env,
      evalImm,
      diagnostics,
    );
    expect(rowsOffset).toBe(4); // stride 3 + field b offset 1
    expectNoDiagnostics(diagnostics);
  });
});
