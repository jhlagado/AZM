import { describe, expect, it } from 'vitest';

import { DiagnosticIds, type Diagnostic } from '../src/diagnosticTypes.js';
import type { AsmOperandNode, EaExprNode, SourceSpan, TypeExprNode } from '../src/frontend/ast.js';
import { createAddressingPipelineBuilders } from '../src/lowering/addressingPipelines.js';
import { createValueMaterializationHelpers } from '../src/lowering/valueMaterialization.js';
import type { EaResolution } from '../src/lowering/eaResolution.js';

const span: SourceSpan = {
  file: 'pr710.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const typeName = (name: string): TypeExprNode => ({ kind: 'TypeName', span, name });
const byteArray = (): TypeExprNode => ({ kind: 'ArrayType', span, element: typeName('byte'), length: 4 });
const wordArray = (): TypeExprNode => ({ kind: 'ArrayType', span, element: typeName('word'), length: 4 });

function renderOperand(operand: AsmOperandNode): string {
  if (operand.kind === 'Reg') return operand.name;
  if (operand.kind !== 'Mem') return operand.kind;
  const expr = operand.expr;
  if (expr.kind === 'EaName') return `(${expr.name})`;
  if ((expr.kind === 'EaAdd' || expr.kind === 'EaSub') && expr.base.kind === 'EaName' && expr.offset.kind === 'ImmLiteral') {
    const sign = expr.kind === 'EaAdd' ? '+' : '-';
    return `(${expr.base.name}${sign}${expr.offset.value})`;
  }
  return operand.kind;
}

describe('#710 indirect ea consumers', () => {
  it('materializes indirect addresses and byte loads through the pointer slot', () => {
    const emitted: string[] = [];
    const helpers = createValueMaterializationHelpers({
      diagnostics: [],
      diagAt: () => {},
      reg8: new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']),
      resolveEa: (ea: EaExprNode): EaResolution | undefined => {
        if (ea.kind === 'EaName' && ea.name === 'slotArr') {
          return { kind: 'indirect', ixDisp: 4, addend: 3, typeExpr: byteArray() };
        }
        return undefined;
      },
      resolveEaTypeExpr: () => undefined,
      resolveAggregateType: () => undefined,
      resolveScalarBinding: () => undefined,
      resolveScalarKind: (typeExpr) =>
        typeExpr.kind === 'TypeName' && (typeExpr.name === 'byte' || typeExpr.name === 'word' || typeExpr.name === 'addr')
          ? typeExpr.name
          : undefined,
      sizeOfTypeExpr: () => undefined,
      evalImmExpr: () => undefined,
      evalImmNoDiag: () => undefined,
      emitInstr: (head, operands) => {
        emitted.push(`${head} ${operands.map(renderOperand).join(', ')}`.trim());
        return true;
      },
      emitRawCodeBytes: () => {},
      emitAbs16Fixup: () => {
        throw new Error('unexpected abs fixup');
      },
      loadImm16ToDE: (value) => {
        emitted.push(`loadImm16ToDE ${value}`);
        return true;
      },
      loadImm16ToHL: () => true,
      negateHL: () => true,
      pushZeroExtendedReg8: (reg) => {
        emitted.push(`pushZero:${reg}`);
        return true;
      },
      emitStepPipeline: () => true,
      buildEaBytePipeline: () => null,
      buildEaWordPipeline: () => null,
      emitScalarWordLoad: () => false,
      formatIxDisp: (disp) => (disp >= 0 ? `+$${disp.toString(16).padStart(2, '0').toUpperCase()}` : `-$${Math.abs(disp).toString(16).padStart(2, '0').toUpperCase()}`),
      TEMPLATE_L_ABC: () => [],
      TEMPLATE_LW_DE: () => [],
      LOAD_RP_EA: () => [],
      STORE_RP_EA: () => [],
    });

    expect(helpers.pushEaAddress({ kind: 'EaName', span, name: 'slotArr' }, span)).toBe(true);
    expect(helpers.pushMemValue({ kind: 'EaName', span, name: 'slotArr' }, 'byte', span)).toBe(true);

    expect(emitted).toEqual([
      'ld E, (IX+4)',
      'ld D, (IX+5)',
      'ex DE, HL',
      'loadImm16ToDE 3',
      'add HL, DE',
      'push HL',
      'ld E, (IX+4)',
      'ld D, (IX+5)',
      'ex DE, HL',
      'loadImm16ToDE 3',
      'add HL, DE',
      'push HL',
      'pop HL',
      'ld A, (HL)',
      'pushZero:A',
    ]);
  });

  it('gates structured byte and word pipelines off for indirect bases', () => {
    const diagnostics: Diagnostic[] = [];
    const resolutions = new Map<string, EaResolution>([
      ['byte_arr', { kind: 'indirect', ixDisp: 4, addend: 0, typeExpr: byteArray() }],
      ['word_arr', { kind: 'indirect', ixDisp: 6, addend: 0, typeExpr: wordArray() }],
    ]);

    const helpers = createAddressingPipelineBuilders({
      diagnostics,
      diagAt: (_diagnostics, _span, message) => {
        diagnostics.push({ id: DiagnosticIds.EmitError, severity: 'error', file: span.file, message });
      },
      reg8: new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']),
      resolveEa: (ea) => (ea.kind === 'EaName' ? resolutions.get(ea.name.toLowerCase()) : undefined),
      resolveEaTypeExpr: (ea) => (ea.kind === 'EaName' ? resolutions.get(ea.name.toLowerCase())?.typeExpr : undefined),
      resolveScalarBinding: () => undefined,
      resolveScalarKind: (typeExpr) =>
        typeExpr.kind === 'TypeName' && (typeExpr.name === 'word' || typeExpr.name === 'addr')
          ? typeExpr.name
          : undefined,
      sizeOfTypeExpr: (typeExpr) => {
        if (typeExpr.kind !== 'TypeName') return undefined;
        if (typeExpr.name === 'byte') return 1;
        if (typeExpr.name === 'word' || typeExpr.name === 'addr') return 2;
        return undefined;
      },
      evalImmExpr: () => undefined,
    });

    expect(
      helpers.buildEaBytePipeline(
        { kind: 'EaIndex', span, base: { kind: 'EaName', span, name: 'byte_arr' }, index: { kind: 'IndexReg8', span, reg: 'C' } },
        span,
      ),
    ).toBeNull();

    expect(
      helpers.buildEaWordPipeline(
        { kind: 'EaIndex', span, base: { kind: 'EaName', span, name: 'word_arr' }, index: { kind: 'IndexReg16', span, reg: 'HL' } },
        span,
      ),
    ).toBeNull();

    expect(diagnostics).toEqual([]);
  });
});
