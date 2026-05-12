import { describe, expect, it } from 'vitest';

import { DiagnosticIds, type Diagnostic } from '../src/diagnosticTypes.js';
import type { AsmOperandNode, EaExprNode, RecordFieldNode, SourceSpan, TypeExprNode } from '../src/frontend/ast.js';
import { createValueMaterializationHelpers } from '../src/lowering/valueMaterialization.js';
import { expectDiagnostic } from './helpers/diagnostics.js';

const span: SourceSpan = {
  file: 'pr770.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const typeName = (name: string): TypeExprNode => ({ kind: 'TypeName', span, name });
const eaName = (name: string): EaExprNode => ({ kind: 'EaName', span, name });

function reinterpret(typeExpr: TypeExprNode, base: EaExprNode): EaExprNode {
  return { kind: 'EaReinterpret', span, typeExpr, base };
}

function makeHelpers() {
  const diagnostics: Diagnostic[] = [];
  const headerType: { kind: 'record'; fields: RecordFieldNode[] } = {
    kind: 'record' as const,
    fields: [
      { kind: 'RecordField', span, name: 'pad', typeExpr: typeName('byte') },
      { kind: 'RecordField', span, name: 'flags', typeExpr: typeName('byte') },
    ],
  };

  return {
    diagnostics,
    helpers: createValueMaterializationHelpers({
      diagnostics: diagnostics as never[],
      diagAt: (_diagnostics, _span, message) => {
        diagnostics.push({
          id: DiagnosticIds.EmitError,
          severity: 'error',
          message,
          file: span.file,
          line: span.start.line,
          column: span.start.column,
        });
      },
      reg8: new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']),
      resolveEa: () => undefined,
      resolveEaTypeExpr: (ea) => {
        switch (ea.kind) {
          case 'EaReinterpret':
            return ea.typeExpr;
          case 'EaField':
            if (ea.base.kind === 'EaReinterpret' && ea.base.typeExpr.kind === 'TypeName' && ea.base.typeExpr.name === 'Header' && ea.field === 'flags') {
              return typeName('byte');
            }
            return undefined;
          case 'EaIndex':
            return undefined;
          default:
            return undefined;
        }
      },
      resolveAggregateType: (typeExpr) => {
        if (typeExpr.kind === 'TypeName' && typeExpr.name === 'Header') return headerType;
        return undefined;
      },
      resolveScalarBinding: (name) => {
        if (name === 'byteSlot') return 'byte';
        return undefined;
      },
      resolveScalarKind: (typeExpr) =>
        typeExpr.kind === 'TypeName' && (typeExpr.name === 'byte' || typeExpr.name === 'word' || typeExpr.name === 'addr')
          ? typeExpr.name
          : undefined,
      sizeOfTypeExpr: (typeExpr) => {
        if (typeExpr.kind !== 'TypeName') return undefined;
        if (typeExpr.name === 'byte') return 1;
        if (typeExpr.name === 'word' || typeExpr.name === 'addr') return 2;
        if (typeExpr.name === 'Header') return 2;
        return undefined;
      },
      evalImmExpr: (expr) => (expr.kind === 'ImmLiteral' ? expr.value : undefined),
      evalImmNoDiag: (expr) => (expr.kind === 'ImmLiteral' ? expr.value : undefined),
      emitInstr: (_head: string, _operands: AsmOperandNode[]) => true,
      emitRawCodeBytes: () => {},
      emitAbs16Fixup: () => {},
      loadImm16ToDE: () => true,
      loadImm16ToHL: () => true,
      negateHL: () => true,
      pushZeroExtendedReg8: () => true,
      emitStepPipeline: () => true,
      buildEaBytePipeline: () => null,
      buildEaWordPipeline: () => null,
      emitScalarWordLoad: () => false,
      formatIxDisp: (disp: number) => `${disp >= 0 ? '+' : ''}${disp}`,
      TEMPLATE_L_ABC: () => [],
      TEMPLATE_LW_DE: () => [],
      LOAD_RP_EA: () => [],
      STORE_RP_EA: () => [],
    }),
  };
}

describe('LOWER-01 typed reinterpretation diagnostics', () => {
  it('diagnoses invalid v1 reinterpretation combinations clearly', () => {
    const { diagnostics, helpers } = makeHelpers();

    expect(
      helpers.pushEaAddress(
        { kind: 'EaField', span, base: reinterpret(typeName('Header'), eaName('byteSlot')), field: 'flags' },
        span,
      ),
    ).toBe(false);
    expect(
      helpers.pushEaAddress(
        { kind: 'EaField', span, base: reinterpret(typeName('word'), eaName('HL')), field: 'flags' },
        span,
      ),
    ).toBe(false);
    expect(
      helpers.pushEaAddress(
        {
          kind: 'EaIndex',
          span,
          base: reinterpret(typeName('Header'), eaName('HL')),
          index: { kind: 'IndexImm', span, value: { kind: 'ImmLiteral', span, value: 0 } },
        },
        span,
      ),
    ).toBe(false);
    expect(
      helpers.pushEaAddress(
        { kind: 'EaField', span, base: reinterpret(typeName('Missing'), eaName('HL')), field: 'flags' },
        span,
      ),
    ).toBe(false);

    expectDiagnostic(diagnostics, {
      message:
        'Invalid reinterpret base "byteSlot": expected HL/DE/BC/IX/IY, a scalar word/addr name, or a parenthesized base +/- imm form built from one of those.',
    });
    expectDiagnostic(diagnostics, {
      message: 'Field access ".flags" requires a record or union type.',
    });
    expectDiagnostic(diagnostics, { message: 'Indexing requires an array type.' });
    expectDiagnostic(diagnostics, { message: 'Unknown reinterpret cast type "Missing".' });
  });
});
