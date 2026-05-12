import { describe, expect, it } from 'vitest';

import { DiagnosticIds } from '../src/diagnosticTypes.js';
import type { Diagnostic } from '../src/diagnosticTypes.js';
import type { EaExprNode, RecordFieldNode, SourceSpan, TypeExprNode } from '../src/frontend/ast.js';
import { buildEaResolutionContext, createEaResolutionHelpers } from '../src/lowering/eaResolution.js';

const span: SourceSpan = {
  file: 'pr709.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const typeName = (name: string): TypeExprNode => ({ kind: 'TypeName', span, name });

const recordField = (name: string, typeExpr: TypeExprNode): RecordFieldNode => ({
  kind: 'RecordField',
  span,
  name,
  typeExpr,
});

const byteType = typeName('byte');
const wordType = typeName('word');
const recordType: TypeExprNode = {
  kind: 'RecordType',
  span,
  fields: [
    recordField('lo', byteType),
    recordField('hi', byteType),
    recordField('value', wordType),
  ],
};
const recordArrayType: TypeExprNode = {
  kind: 'ArrayType',
  span,
  element: recordType,
  length: 4,
};

const eaName = (name: string): EaExprNode => ({ kind: 'EaName', span, name });

function makeHelpers() {
  const diagnostics: Diagnostic[] = [];
  const stackSlotOffsets = new Map<string, number>([
    ['count', -2],
    ['table', -6],
  ]);
  const stackSlotTypes = new Map<string, TypeExprNode>([
    ['count', wordType],
    ['table', recordArrayType],
  ]);
  const localAliasTargets = new Map<string, EaExprNode>([['alias_table', eaName('table')]]);

  const helpers = createEaResolutionHelpers(
    buildEaResolutionContext({
      env: { consts: new Map(), enums: new Map(), types: new Map() },
      diagnostics,
      diagAt: (diags, s, message) => {
        diags.push({
          id: DiagnosticIds.TypeError,
          severity: 'error',
          message,
          file: s.file,
          line: s.start.line,
          column: s.start.column,
        });
      },
      workspace: {
        stackSlotOffsets,
        stackSlotTypes,
        storageTypes: new Map(),
        moduleAliasTargets: new Map(),
        localAliasTargets,
      },
      evalImmNoDiag: (expr) => (expr.kind === 'ImmLiteral' ? expr.value : undefined),
      resolveScalarKind: (typeExpr) => {
        if (typeExpr.kind !== 'TypeName') return undefined;
        const lower = typeExpr.name.toLowerCase();
        return lower === 'byte' || lower === 'word' || lower === 'addr' ? lower : undefined;
      },
      resolveAggregateType: (typeExpr) => {
        if (typeExpr.kind === 'RecordType') return { kind: 'record', fields: typeExpr.fields };
        return undefined;
      },
      resolvePointedToType: () => undefined,
      resolveEaTypeExpr: () => undefined,
    }),
  );

  return { diagnostics, resolveEa: helpers.resolveEa };
}

describe('#709 indirect ea resolution', () => {
  it('keeps scalar stack slots on the direct stack lane', () => {
    const { diagnostics, resolveEa } = makeHelpers();

    expect(resolveEa(eaName('count'), span)).toEqual({
      kind: 'stack',
      ixDisp: -2,
      typeExpr: wordType,
    });
    expect(diagnostics).toEqual([]);
  });

  it('returns indirect for non-scalar stack slots and preserves the base ix displacement', () => {
    const { diagnostics, resolveEa } = makeHelpers();

    expect(resolveEa(eaName('table'), span)).toEqual({
      kind: 'indirect',
      ixDisp: -6,
      addend: 0,
      typeExpr: recordArrayType,
    });

    expect(
      resolveEa(
        {
          kind: 'EaField',
          span,
          base: {
            kind: 'EaIndex',
            span,
            base: eaName('table'),
            index: { kind: 'IndexImm', span, value: { kind: 'ImmLiteral', span, value: 2 } },
          },
          field: 'value',
        },
        span,
      ),
    ).toEqual({
      kind: 'indirect',
      ixDisp: -6,
      addend: 10,
      typeExpr: wordType,
    });

    expect(diagnostics).toEqual([]);
  });

  it('propagates indirect resolution through aliases and constant addends', () => {
    const { diagnostics, resolveEa } = makeHelpers();

    expect(
      resolveEa(
        {
          kind: 'EaAdd',
          span,
          base: eaName('alias_table'),
          offset: { kind: 'ImmLiteral', span, value: 3 },
        },
        span,
      ),
    ).toEqual({
      kind: 'indirect',
      ixDisp: -6,
      addend: 3,
      typeExpr: recordArrayType,
    });

    expect(diagnostics).toEqual([]);
  });
});
