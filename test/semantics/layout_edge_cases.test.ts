import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import type { CompileEnv } from '../../src/semantics/env.js';
import { offsetOfPathInTypeExpr, sizeOfTypeExpr, storageInfoForTypeExpr } from '../../src/semantics/layout.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';
import type {
  OffsetofPathNode,
  RecordFieldNode,
  TypeDeclNode,
  TypeExprNode,
  UnionDeclNode,
} from '../../src/frontend/ast.js';

const span = {
  file: 'layout_edge.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const byteType: TypeExprNode = { kind: 'TypeName', span, name: 'byte' };
const wordType: TypeExprNode = { kind: 'TypeName', span, name: 'word' };

function mkField(name: string, typeExpr: TypeExprNode): RecordFieldNode {
  return { kind: 'RecordField', span, name, typeExpr };
}

function typeDecl(name: string, typeExpr: TypeExprNode): TypeDeclNode {
  return { kind: 'TypeDecl', span, name, exported: false, typeExpr };
}

function unionDecl(name: string, fields: RecordFieldNode[]): UnionDeclNode {
  return { kind: 'UnionDecl', span, name, exported: false, fields };
}

const emptyEnv: CompileEnv = { consts: new Map(), enums: new Map(), types: new Map() };

describe('layout edge cases (#1138)', () => {
  it('treats an empty record as zero bytes', () => {
    const emptyRec: TypeExprNode = { kind: 'RecordType', span, fields: [] };
    const diagnostics: Diagnostic[] = [];
    expect(sizeOfTypeExpr(emptyRec, emptyEnv, diagnostics)).toBe(0);
    expectNoDiagnostics(diagnostics);
  });

  it('treats an empty union as zero bytes', () => {
    const u = unionDecl('EmptyU', []);
    const env: CompileEnv = { ...emptyEnv, types: new Map([['EmptyU', u]]) };
    const diagnostics: Diagnostic[] = [];
    expect(sizeOfTypeExpr({ kind: 'TypeName', span, name: 'EmptyU' }, env, diagnostics)).toBe(0);
    expectNoDiagnostics(diagnostics);
  });

  it('sizes deeply nested named records as the sum of leaf scalars', () => {
    const leaf = typeDecl('Leaf', { kind: 'RecordType', span, fields: [mkField('b', byteType)] });
    const mid = typeDecl('Mid', {
      kind: 'RecordType',
      span,
      fields: [mkField('inner', { kind: 'TypeName', span, name: 'Leaf' })],
    });
    const top = typeDecl('Top', {
      kind: 'RecordType',
      span,
      fields: [mkField('mid', { kind: 'TypeName', span, name: 'Mid' })],
    });
    const env: CompileEnv = {
      ...emptyEnv,
      types: new Map([
        ['Leaf', leaf],
        ['Mid', mid],
        ['Top', top],
      ]),
    };
    const topExpr: TypeExprNode = { kind: 'TypeName', span, name: 'Top' };
    const diagnostics: Diagnostic[] = [];
    expect(storageInfoForTypeExpr(topExpr, env, diagnostics)).toEqual({ size: 1 });
    expect(sizeOfTypeExpr(topExpr, env, diagnostics)).toBe(1);
    expectNoDiagnostics(diagnostics);
  });

  it('sizes a union as the max of its fields, including array fields', () => {
    const u = unionDecl('U', [
      mkField('bytes', { kind: 'ArrayType', span, element: byteType, length: 4 }),
      mkField('w', wordType),
    ]);
    const env: CompileEnv = { ...emptyEnv, types: new Map([['U', u]]) };
    const diagnostics: Diagnostic[] = [];
    expect(sizeOfTypeExpr({ kind: 'TypeName', span, name: 'U' }, env, diagnostics)).toBe(4);
    expectNoDiagnostics(diagnostics);
  });

  it('sizes an array of a union type as element size × length', () => {
    const u = unionDecl('Cell', [mkField('a', byteType), mkField('w', wordType)]);
    const env: CompileEnv = { ...emptyEnv, types: new Map([['Cell', u]]) };
    const arr: TypeExprNode = {
      kind: 'ArrayType',
      span,
      element: { kind: 'TypeName', span, name: 'Cell' },
      length: 5,
    };
    const diagnostics: Diagnostic[] = [];
    expect(sizeOfTypeExpr(arr, env, diagnostics)).toBe(10);
    expectNoDiagnostics(diagnostics);
  });

  it('computes offsetof through nested records and into a leaf field', () => {
    const leaf = typeDecl('Leaf', { kind: 'RecordType', span, fields: [mkField('z', byteType)] });
    const mid = typeDecl('Mid', {
      kind: 'RecordType',
      span,
      fields: [
        mkField('pad', byteType),
        mkField('leaf', { kind: 'TypeName', span, name: 'Leaf' }),
      ],
    });
    const top = typeDecl('Top', {
      kind: 'RecordType',
      span,
      fields: [mkField('mid', { kind: 'TypeName', span, name: 'Mid' })],
    });
    const env: CompileEnv = {
      ...emptyEnv,
      types: new Map([
        ['Leaf', leaf],
        ['Mid', mid],
        ['Top', top],
      ]),
    };
    const path: OffsetofPathNode = {
      kind: 'OffsetofPath',
      span,
      base: 'mid',
      steps: [
        { kind: 'OffsetofField', span, name: 'leaf' },
        { kind: 'OffsetofField', span, name: 'z' },
      ],
    };
    const diagnostics: Diagnostic[] = [];
    const off = offsetOfPathInTypeExpr({ kind: 'TypeName', span, name: 'Top' }, path, env, () => 0, diagnostics);
    expect(off).toBe(1);
    expectNoDiagnostics(diagnostics);
  });

  it('computes offsetof into an array of records, using index stride', () => {
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
          element: { kind: 'TypeName', span, name: 'Cell' },
          length: 3,
        }),
      ],
    });
    const env: CompileEnv = { ...emptyEnv, types: new Map([['Cell', cell], ['Row', row]]) };
    const path: OffsetofPathNode = {
      kind: 'OffsetofPath',
      span,
      base: 'cells',
      steps: [
        { kind: 'OffsetofIndex', span, expr: { kind: 'ImmLiteral', span, value: 2 } },
        { kind: 'OffsetofField', span, name: 'hi' },
      ],
    };
    const diagnostics: Diagnostic[] = [];
    const off = offsetOfPathInTypeExpr(
      { kind: 'TypeName', span, name: 'Row' },
      path,
      env,
      (e) => (e.kind === 'ImmLiteral' ? e.value : undefined),
      diagnostics,
    );
    expect(off).toBe(5);
    expectNoDiagnostics(diagnostics);
  });

  it('union offsetof keeps total at 0 for any member (no cumulative offset between union variants)', () => {
    const u = unionDecl('Tag', [mkField('a', byteType), mkField('w', wordType)]);
    const env: CompileEnv = { ...emptyEnv, types: new Map([['Tag', u]]) };
    const path: OffsetofPathNode = { kind: 'OffsetofPath', span, base: 'w', steps: [] };
    const diagnostics: Diagnostic[] = [];
    const off = offsetOfPathInTypeExpr({ kind: 'TypeName', span, name: 'Tag' }, path, env, () => 0, diagnostics);
    expect(off).toBe(0);
    expectNoDiagnostics(diagnostics);
  });

  it('propagates unknown nested type errors from deep TypeName chains', () => {
    const mid = typeDecl('Mid', {
      kind: 'RecordType',
      span,
      fields: [mkField('x', { kind: 'TypeName', span, name: 'Missing' })],
    });
    const top = typeDecl('Top', {
      kind: 'RecordType',
      span,
      fields: [mkField('mid', { kind: 'TypeName', span, name: 'Mid' })],
    });
    const env: CompileEnv = { ...emptyEnv, types: new Map([['Mid', mid], ['Top', top]]) };
    const diagnostics: Diagnostic[] = [];
    expect(sizeOfTypeExpr({ kind: 'TypeName', span, name: 'Top' }, env, diagnostics)).toBeUndefined();
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      messageIncludes: 'Unknown type "Missing"',
    });
  });
});
