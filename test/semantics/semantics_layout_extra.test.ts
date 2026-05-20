import { describe, expect, it } from 'vitest';

import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import type { CompileEnv } from '../../src/semantics/env.js';
import {
  offsetPathInTypeExpr,
  sizeOfTypeExpr,
  layoutInfoForTypeExpr,
} from '../../src/semantics/layout.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';
import type {
  ImmExprNode,
  OffsetPathNode,
  RecordFieldNode,
  TypeDeclNode,
  TypeExprNode,
  UnionDeclNode,
} from '../../src/frontend/ast.js';

const span = {
  file: 'test.asm',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const byteType: TypeExprNode = { kind: 'TypeName', span, name: 'byte' };
const wordType: TypeExprNode = { kind: 'TypeName', span, name: 'word' };

function recordField(name: string, typeExpr: TypeExprNode): RecordFieldNode {
  return { kind: 'RecordField', span, name, typeExpr };
}

describe('semantics/layout', () => {
  const emptyEnv: CompileEnv = { equates: new Map(), enums: new Map(), types: new Map() };

  it('computes exact layout for records and unions', () => {
    const rec: TypeExprNode = {
      kind: 'RecordType',
      span,
      fields: [recordField('x', byteType), recordField('y', wordType)],
    };
    const info = layoutInfoForTypeExpr(rec, emptyEnv);
    expect(info).toEqual({ size: 3 });

    const unionDecl: UnionDeclNode = {
      kind: 'UnionDecl',
      span,
      name: 'U',
      fields: [recordField('a', byteType), recordField('b', wordType)],
    };
    const env: CompileEnv = { ...emptyEnv, types: new Map([['U', unionDecl]]) };
    const unionInfo = layoutInfoForTypeExpr({ kind: 'TypeName', span, name: 'U' }, env);
    expect(unionInfo).toEqual({ size: 2 });
  });

  it('computes exact sizes for records via sizeOfTypeExpr', () => {
    const rec: TypeExprNode = {
      kind: 'RecordType',
      span,
      fields: [recordField('x', byteType), recordField('y', wordType)],
    };
    const layoutSize = sizeOfTypeExpr(rec, emptyEnv);
    expect(layoutSize).toBe(3);
  });

  it('rejects inferred-length arrays without initializer', () => {
    const arr: TypeExprNode = { kind: 'ArrayType', span, element: byteType };
    const diagnostics: any[] = [];
    const info = layoutInfoForTypeExpr(arr, emptyEnv, diagnostics);
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
      typeExpr: { kind: 'TypeName', span, name: 'Self' },
    };
    const env: CompileEnv = { ...emptyEnv, types: new Map([['Self', selfDecl]]) };
    const diagnostics: any[] = [];
    const info = layoutInfoForTypeExpr({ kind: 'TypeName', span, name: 'Self' }, env, diagnostics);
    expect(info).toBeUndefined();
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      messageIncludes: 'Recursive type definition',
    });
  });

  it('computes offset paths through records', () => {
    const point: TypeDeclNode = {
      kind: 'TypeDecl',
      span,
      name: 'Point',
      typeExpr: {
        kind: 'RecordType',
        span,
        fields: [recordField('x', byteType), recordField('y', wordType)],
      },
    };
    const env: CompileEnv = { ...emptyEnv, types: new Map([['Point', point]]) };
    const pathFieldY: OffsetPathNode = { kind: 'OffsetPath', span, base: 'y', steps: [] };
    const offset = offsetPathInTypeExpr(
      { kind: 'TypeName', span, name: 'Point' },
      pathFieldY,
      env,
      () => 0,
    );
    expect(offset).toBe(1); // byte field x (1) before y
  });

  it('uses exact record fields and exact array stride in offset', () => {
    const inner: TypeDeclNode = {
      kind: 'TypeDecl',
      span,
      name: 'Inner',
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

    const tailPath: OffsetPathNode = { kind: 'OffsetPath', span, base: 'tail', steps: [] };
    const tailOffset = offsetPathInTypeExpr(
      { kind: 'TypeName', span, name: 'Outer' },
      tailPath,
      env,
      evalImm,
      diagnostics,
    );
    expect(tailOffset).toBe(4); // lead (1) + inner packed (3)

    const rowsPath: OffsetPathNode = {
      kind: 'OffsetPath',
      span,
      base: 'rows',
      steps: [
        { kind: 'OffsetIndex', span, expr: { kind: 'ImmLiteral', span, value: 1 } },
        { kind: 'OffsetField', span, name: 'b' },
      ],
    };
    const rowsOffset = offsetPathInTypeExpr(
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
