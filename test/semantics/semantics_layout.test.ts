import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import type { CompileEnv } from '../../src/semantics/env.js';
import { sizeOfTypeExpr } from '../../src/semantics/layout.js';
import type {
  RecordFieldNode,
  SourceSpan,
  TypeDeclNode,
  TypeExprNode,
  UnionDeclNode,
} from '../../src/frontend/ast.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';

const s = (file = 'test.zax'): SourceSpan => ({
  file,
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
});

const recordField = (name: string, typeExpr: TypeExprNode): RecordFieldNode => ({
  kind: 'RecordField',
  span: s(),
  name,
  typeExpr,
});

const typeDecl = (name: string, typeExpr: TypeExprNode): TypeDeclNode => ({
  kind: 'TypeDecl',
  span: s(),
  name,
  exported: false,
  typeExpr,
});

const unionDecl = (name: string, fields: RecordFieldNode[]): UnionDeclNode => ({
  kind: 'UnionDecl',
  span: s(),
  name,
  exported: false,
  fields,
});

const emptyEnv = (): CompileEnv => ({
  consts: new Map(),
  enums: new Map(),
  types: new Map(),
});

describe('sizeOfTypeExpr', () => {
  it('diagnoses unknown named types', () => {
    const diagnostics: Diagnostic[] = [];
    const env = emptyEnv();
    const res = sizeOfTypeExpr({ kind: 'TypeName', span: s(), name: 'Nope' }, env, diagnostics);
    expect(res).toBeUndefined();
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      message: 'Unknown type "Nope".',
    });
  });

  it('diagnoses recursive type definitions', () => {
    const diagnostics: Diagnostic[] = [];
    const env = emptyEnv();

    env.types.set(
      'A',
      typeDecl('A', {
        kind: 'RecordType',
        span: s(),
        fields: [recordField('b', { kind: 'TypeName', span: s(), name: 'B' })],
      }),
    );
    env.types.set(
      'B',
      typeDecl('B', {
        kind: 'RecordType',
        span: s(),
        fields: [recordField('a', { kind: 'TypeName', span: s(), name: 'A' })],
      }),
    );

    const res = sizeOfTypeExpr({ kind: 'TypeName', span: s(), name: 'A' }, env, diagnostics);
    expect(res).toBeUndefined();
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      message: 'Recursive type definition detected for "A".',
    });
  });

  it('requires array length outside data declarations', () => {
    const diagnostics: Diagnostic[] = [];
    const env = emptyEnv();
    const res = sizeOfTypeExpr(
      {
        kind: 'ArrayType',
        span: s(),
        element: { kind: 'TypeName', span: s(), name: 'byte' },
      },
      env,
      diagnostics,
    );
    expect(res).toBeUndefined();
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      message:
        'Array length is required here (inferred-length arrays like "T[]" are only permitted in data declarations with an initializer).',
    });
  });

  it('computes union sizes as max field size', () => {
    const diagnostics: Diagnostic[] = [];
    const env = emptyEnv();
    env.types.set(
      'Value',
      unionDecl('Value', [
        recordField('b', { kind: 'TypeName', span: s(), name: 'byte' }),
        recordField('w', { kind: 'TypeName', span: s(), name: 'word' }),
      ]),
    );
    const res = sizeOfTypeExpr({ kind: 'TypeName', span: s(), name: 'Value' }, env, diagnostics);
    expect(res).toBe(2);
    expectNoDiagnostics(diagnostics);
  });

  it('treats addr as 16-bit scalar', () => {
    const diagnostics: Diagnostic[] = [];
    const env = emptyEnv();
    const res = sizeOfTypeExpr({ kind: 'TypeName', span: s(), name: 'addr' }, env, diagnostics);
    expect(res).toBe(2);
    expectNoDiagnostics(diagnostics);
  });
});
