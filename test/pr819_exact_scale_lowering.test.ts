import { describe, expect, it } from 'vitest';

import { EAW_GLOB_CONST, renderStepPipeline } from '../src/lowering/steps.js';
import { DiagnosticIds, type Diagnostic } from '../src/diagnosticTypes.js';
import type { AsmOperandNode, EaExprNode, SourceSpan, TypeExprNode } from '../src/frontend/ast.js';
import { createAddressingPipelineBuilders } from '../src/lowering/addressingPipelines.js';
import { createValueMaterializationHelpers } from '../src/lowering/valueMaterialization.js';
import type { EaResolution } from '../src/lowering/eaResolution.js';

const span: SourceSpan = {
  file: 'pr819.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const typeName = (name: string): TypeExprNode => ({ kind: 'TypeName', span, name });
const arrayType = (element: TypeExprNode): TypeExprNode => ({ kind: 'ArrayType', span, element, length: 4 });
const eaName = (name: string): EaExprNode => ({ kind: 'EaName', span, name });

function renderOperand(operand: AsmOperandNode): string {
  if (operand.kind === 'Reg') return operand.name;
  if (operand.kind === 'Imm' && operand.expr.kind === 'ImmLiteral') return `$${operand.expr.value.toString(16).toUpperCase().padStart(4, '0')}`;
  if (operand.kind !== 'Mem') return operand.kind;
  const expr = operand.expr;
  if (expr.kind === 'EaName') return `(${expr.name})`;
  if ((expr.kind === 'EaAdd' || expr.kind === 'EaSub') && expr.base.kind === 'EaName' && expr.offset.kind === 'ImmLiteral') {
    const sign = expr.kind === 'EaAdd' ? '+' : '-';
    return `(${expr.base.name}${sign}${expr.offset.value})`;
  }
  return operand.kind;
}

describe('PR819 exact-scale lowering', () => {
  it('keeps the power-of-two step path unchanged and adds exact non-pow2 scaling', () => {
    expect(renderStepPipeline(EAW_GLOB_CONST('glob_tri', 1, 3))).toEqual([
      'ld de, glob_tri',
      'ld hl, $0001',
      'push de',
      'ld d, h',
      'ld e, l',
      'add hl, hl',
      'add hl, de',
      'pop de',
      'add hl, de',
    ]);

    expect(renderStepPipeline(EAW_GLOB_CONST('glob_pow2', 1, 8))).toEqual([
      'ld de, glob_pow2',
      'ld hl, $0001',
      'add hl, hl',
      'add hl, hl',
      'add hl, hl',
      'add hl, de',
    ]);
  });

  it('builds exact structural pipelines for non-pow2 and nested element sizes', () => {
    const diagnostics: Diagnostic[] = [];
    const triArray = arrayType(typeName('Tri3'));
    const outerArray = arrayType(typeName('Outer5'));
    const resolutions = new Map<string, EaResolution>([
      ['globtri', { kind: 'abs', baseLower: 'globtri', addend: 0, typeExpr: triArray }],
      ['frameouter', { kind: 'stack', ixDisp: -12, typeExpr: outerArray }],
      ['idxw', { kind: 'abs', baseLower: 'idxw', addend: 0, typeExpr: typeName('word') }],
    ]);

    const helpers = createAddressingPipelineBuilders({
      diagnostics,
      diagAt: (_diagnostics, _span, message) => {
        diagnostics.push({ id: DiagnosticIds.EmitError, severity: 'error', file: span.file, message });
      },
      reg8: new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']),
      resolveEa: (ea) => (ea.kind === 'EaName' ? resolutions.get(ea.name.toLowerCase()) : undefined),
      resolveEaTypeExpr: (ea) => (ea.kind === 'EaName' ? resolutions.get(ea.name.toLowerCase())?.typeExpr : undefined),
      resolveScalarBinding: (name) => (name.toLowerCase() === 'idxw' ? 'word' : undefined),
      resolveScalarKind: (typeExpr) =>
        typeExpr.kind === 'TypeName' && (typeExpr.name === 'word' || typeExpr.name === 'addr')
          ? typeExpr.name
          : undefined,
      sizeOfTypeExpr: (typeExpr) => {
        if (typeExpr.kind !== 'TypeName') return undefined;
        if (typeExpr.name === 'Tri3') return 3;
        if (typeExpr.name === 'Outer5') return 5;
        if (typeExpr.name === 'word' || typeExpr.name === 'addr') return 2;
        return undefined;
      },
      evalImmExpr: () => undefined,
    });

    const triPipe = helpers.buildEaWordPipeline(
      { kind: 'EaIndex', span, base: eaName('globTri'), index: { kind: 'IndexReg16', span, reg: 'HL' } },
      span,
    );
    const outerPipe = helpers.buildEaWordPipeline(
      {
        kind: 'EaIndex',
        span,
        base: eaName('frameOuter'),
        index: { kind: 'IndexImm', span, value: { kind: 'ImmName', span, name: 'idxw' } },
      },
      span,
    );

    expect(renderStepPipeline(triPipe ?? [])).toEqual([
      'ld de, globtri',
      'push de',
      'ld d, h',
      'ld e, l',
      'add hl, hl',
      'add hl, de',
      'pop de',
      'add hl, de',
    ]);
    expect(renderStepPipeline(outerPipe ?? [])).toEqual([
      'ld e, (ix-$0c)',
      'ld d, (ix-$0b)',
      'ld hl, (idxw)',
      'push de',
      'ld d, h',
      'ld e, l',
      'add hl, hl',
      'add hl, hl',
      'add hl, de',
      'pop de',
      'add hl, de',
    ]);
    expect(diagnostics).toEqual([]);
  });

  it('preserves DE while materializing non-pow2 indexed addresses directly', () => {
    const diagnostics: Diagnostic[] = [];
    const emittedInstrs: string[] = [];
    const absFixups: Array<{ opcode: number; baseLower: string; addend: number }> = [];
    const triArray = arrayType(typeName('Tri3'));

    const helpers = createValueMaterializationHelpers({
      diagnostics,
      diagAt: (_diagnostics, _span, message) => {
        diagnostics.push({ id: DiagnosticIds.EmitError, severity: 'error', file: span.file, message });
      },
      reg8: new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']),
      resolveEa: (ea) => {
        if (ea.kind === 'EaName' && ea.name === 'globTri') {
          return { kind: 'abs', baseLower: 'globtri', addend: 0, typeExpr: triArray } as const;
        }
        return undefined;
      },
      resolveEaTypeExpr: (ea) => {
        if (ea.kind === 'EaName' && ea.name === 'globTri') return triArray;
        return undefined;
      },
      resolveAggregateType: () => undefined,
      resolveScalarBinding: () => undefined,
      resolveScalarKind: () => undefined,
      sizeOfTypeExpr: (typeExpr) => (typeExpr.kind === 'TypeName' && typeExpr.name === 'Tri3' ? 3 : undefined),
      evalImmExpr: () => undefined,
      evalImmNoDiag: () => undefined,
      emitInstr: (head: string, operands: AsmOperandNode[]) => {
        emittedInstrs.push(`${head} ${operands.map(renderOperand).join(', ')}`.trim());
        return true;
      },
      emitRawCodeBytes: () => {},
      emitAbs16Fixup: (opcode: number, baseLower: string, addend: number) => {
        absFixups.push({ opcode, baseLower, addend });
      },
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
    });

    const result = helpers.pushEaAddress(
      { kind: 'EaIndex', span, base: eaName('globTri'), index: { kind: 'IndexReg8', span, reg: 'C' } },
      span,
    );

    expect(result).toBe(true);
    expect(absFixups).toEqual([{ opcode: 0x11, baseLower: 'globtri', addend: 0 }]);
    expect(emittedInstrs).toEqual([
      'ld H, $0000',
      'ld L, C',
      'push DE',
      'ld D, H',
      'ld E, L',
      'add HL, HL',
      'add HL, DE',
      'pop DE',
      'add HL, DE',
      'push HL',
    ]);
    expect(diagnostics).toEqual([]);
  });
});
