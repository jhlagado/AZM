import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import type { CompileEnv } from '../../src/semantics/env.js';
import {
  offsetPathInTypeExpr,
  sizeOfTypeExpr,
  layoutInfoForTypeExpr,
} from '../../src/semantics/layout.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics/index.js';
import type {
  OffsetPathNode,
  RecordFieldNode,
  TypeDeclNode,
  TypeExprNode,
  UnionDeclNode,
} from '../../src/frontend/ast.js';

const span = {
  file: 'layout_edge.asm',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const byteType: TypeExprNode = { kind: 'TypeName', span, name: 'byte' };
const wordType: TypeExprNode = { kind: 'TypeName', span, name: 'word' };

function typeName(name: string): TypeExprNode {
  return { kind: 'TypeName', span, name };
}

function mkField(name: string, typeExpr: TypeExprNode): RecordFieldNode {
  return { kind: 'RecordField', span, name, typeExpr };
}

function typeDecl(
  name: string,
  typeExpr: Extract<TypeExprNode, { kind: 'RecordType' }>,
): TypeDeclNode {
  return { kind: 'TypeDecl', span, name, typeExpr };
}

function unionDecl(name: string, fields: RecordFieldNode[]): UnionDeclNode {
  return { kind: 'UnionDecl', span, name, fields };
}

const emptyEnv: CompileEnv = { equates: new Map(), enums: new Map(), types: new Map() };

function envWithTypes(types: Array<TypeDeclNode | UnionDeclNode>): CompileEnv {
  return {
    ...emptyEnv,
    types: new Map(types.map((type) => [type.name, type])),
  };
}

describe('layout edge cases (#1138)', () => {
  it('treats an empty record as zero bytes', () => {
    const emptyRec: TypeExprNode = { kind: 'RecordType', span, fields: [] };
    const diagnostics: Diagnostic[] = [];
    expect(sizeOfTypeExpr(emptyRec, emptyEnv, diagnostics)).toBe(0);
    expectNoDiagnostics(diagnostics);
  });

  it('treats an empty union as zero bytes', () => {
    const u = unionDecl('EmptyU', []);
    const env = envWithTypes([u]);
    const diagnostics: Diagnostic[] = [];
    expect(sizeOfTypeExpr(typeName('EmptyU'), env, diagnostics)).toBe(0);
    expectNoDiagnostics(diagnostics);
  });

  it('sizes deeply nested named records as the sum of leaf scalars', () => {
    const leaf = typeDecl('Leaf', { kind: 'RecordType', span, fields: [mkField('b', byteType)] });
    const mid = typeDecl('Mid', {
      kind: 'RecordType',
      span,
      fields: [mkField('inner', typeName('Leaf'))],
    });
    const top = typeDecl('Top', {
      kind: 'RecordType',
      span,
      fields: [mkField('mid', typeName('Mid'))],
    });
    const env = envWithTypes([leaf, mid, top]);
    const topExpr = typeName('Top');
    const diagnostics: Diagnostic[] = [];
    expect(layoutInfoForTypeExpr(topExpr, env, diagnostics)).toEqual({ size: 1 });
    expect(sizeOfTypeExpr(topExpr, env, diagnostics)).toBe(1);
    expectNoDiagnostics(diagnostics);
  });

  it('sizes a union as the max of its fields, including array fields', () => {
    const u = unionDecl('U', [
      mkField('bytes', { kind: 'ArrayType', span, element: byteType, length: 4 }),
      mkField('w', wordType),
    ]);
    const env = envWithTypes([u]);
    const diagnostics: Diagnostic[] = [];
    expect(sizeOfTypeExpr(typeName('U'), env, diagnostics)).toBe(4);
    expectNoDiagnostics(diagnostics);
  });

  it('sizes an array of a union type as element size × length', () => {
    const u = unionDecl('Cell', [mkField('a', byteType), mkField('w', wordType)]);
    const env = envWithTypes([u]);
    const arr: TypeExprNode = {
      kind: 'ArrayType',
      span,
      element: typeName('Cell'),
      length: 5,
    };
    const diagnostics: Diagnostic[] = [];
    expect(sizeOfTypeExpr(arr, env, diagnostics)).toBe(10);
    expectNoDiagnostics(diagnostics);
  });

  it('computes offset through nested records and into a leaf field', () => {
    const leaf = typeDecl('Leaf', { kind: 'RecordType', span, fields: [mkField('z', byteType)] });
    const mid = typeDecl('Mid', {
      kind: 'RecordType',
      span,
      fields: [mkField('pad', byteType), mkField('leaf', typeName('Leaf'))],
    });
    const top = typeDecl('Top', {
      kind: 'RecordType',
      span,
      fields: [mkField('mid', typeName('Mid'))],
    });
    const env = envWithTypes([leaf, mid, top]);
    const path: OffsetPathNode = {
      kind: 'OffsetPath',
      span,
      base: 'mid',
      steps: [
        { kind: 'OffsetField', span, name: 'leaf' },
        { kind: 'OffsetField', span, name: 'z' },
      ],
    };
    const diagnostics: Diagnostic[] = [];
    const off = offsetPathInTypeExpr(typeName('Top'), path, env, () => 0, diagnostics);
    expect(off).toBe(1);
    expectNoDiagnostics(diagnostics);
  });

  it('computes offset into an array of records, using index stride', () => {
    const cell = typeDecl('Cell', {
      kind: 'RecordType',
      span,
      fields: [mkField('lo', byteType), mkField('hi', byteType)],
    });
    const row = typeDecl('Row', {
      kind: 'RecordType',
      span,
      fields: [
        mkField('cells', {
          kind: 'ArrayType',
          span,
          element: typeName('Cell'),
          length: 3,
        }),
      ],
    });
    const env = envWithTypes([cell, row]);
    const path: OffsetPathNode = {
      kind: 'OffsetPath',
      span,
      base: 'cells',
      steps: [
        { kind: 'OffsetIndex', span, expr: { kind: 'ImmLiteral', span, value: 2 } },
        { kind: 'OffsetField', span, name: 'hi' },
      ],
    };
    const diagnostics: Diagnostic[] = [];
    const off = offsetPathInTypeExpr(
      typeName('Row'),
      path,
      env,
      (e) => (e.kind === 'ImmLiteral' ? e.value : undefined),
      diagnostics,
    );
    expect(off).toBe(5);
    expectNoDiagnostics(diagnostics);
  });

  it('union offset keeps total at 0 for any member (no cumulative offset between union variants)', () => {
    const u = unionDecl('Tag', [mkField('a', byteType), mkField('w', wordType)]);
    const env = envWithTypes([u]);
    const path: OffsetPathNode = { kind: 'OffsetPath', span, base: 'w', steps: [] };
    const diagnostics: Diagnostic[] = [];
    const off = offsetPathInTypeExpr(typeName('Tag'), path, env, () => 0, diagnostics);
    expect(off).toBe(0);
    expectNoDiagnostics(diagnostics);
  });

  it('propagates unknown nested type errors from deep TypeName chains', () => {
    const mid = typeDecl('Mid', {
      kind: 'RecordType',
      span,
      fields: [mkField('x', typeName('Missing'))],
    });
    const top = typeDecl('Top', {
      kind: 'RecordType',
      span,
      fields: [mkField('mid', typeName('Mid'))],
    });
    const env = envWithTypes([mid, top]);
    const diagnostics: Diagnostic[] = [];
    expect(sizeOfTypeExpr(typeName('Top'), env, diagnostics)).toBeUndefined();
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      messageIncludes: 'Unknown type "Missing"',
    });
  });
});
