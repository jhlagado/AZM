import { describe, expect, it } from 'vitest';

import { EAW_FVAR_CONST, EAW_GLOB_CONST, renderStepPipeline } from '../src/lowering/steps.js';
import { DiagnosticIds, type Diagnostic } from '../src/diagnosticTypes.js';
import type { AsmOperandNode, EaExprNode, SourceSpan, TypeExprNode } from '../src/frontend/ast.js';
import { createAddressingPipelineBuilders } from '../src/lowering/addressingPipelines.js';
import { createValueMaterializationHelpers } from '../src/lowering/valueMaterialization.js';
import type { EaResolution } from '../src/lowering/eaResolution.js';

const span: SourceSpan = {
  file: 'fixture.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const typeName = (name: string): TypeExprNode => ({ kind: 'TypeName', span, name });
const arrayType = (element: TypeExprNode): TypeExprNode => ({ kind: 'ArrayType', span, element, length: 4 });
const eaName = (name: string): EaExprNode => ({ kind: 'EaName', span, name });

describe('#711 wide EAW scaling', () => {
  it('scales step builders by arbitrary pow2 element sizes', () => {
    expect(renderStepPipeline(EAW_GLOB_CONST('glob_wide', 1, 8))).toEqual([
      'ld de, glob_wide',
      'ld hl, $0001',
      'add hl, hl',
      'add hl, hl',
      'add hl, hl',
      'add hl, de',
    ]);

    expect(renderStepPipeline(EAW_FVAR_CONST(-20, 1, 8))).toEqual([
      'ld e, (ix-$0c)',
      'ld d, (ix-$0b)',
      'ld hl, $0000',
      'add hl, hl',
      'add hl, hl',
      'add hl, hl',
      'add hl, de',
    ]);
  });

  it('keeps word pipeline lowering on the structural path for wide pow2 elements', () => {
    const diagnostics: Diagnostic[] = [];
    const reg8 = new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']);
    const wideArray = arrayType(typeName('wide8'));

    const resolutions = new Map<string, EaResolution>([
      ['globwide', { kind: 'abs', baseLower: 'globwide', addend: 0, typeExpr: wideArray }],
      ['framewide', { kind: 'stack', ixDisp: -16, typeExpr: wideArray }],
      ['idxw', { kind: 'abs', baseLower: 'idxw', addend: 0, typeExpr: typeName('word') }],
    ]);

    const helpers = createAddressingPipelineBuilders({
      diagnostics,
      diagAt: (_diagnostics, _span, message) => {
        diagnostics.push({
          id: DiagnosticIds.EmitError,
          severity: 'error',
          file: span.file,
          message,
        });
      },
      reg8,
      resolveEa: (ea) => (ea.kind === 'EaName' ? resolutions.get(ea.name.toLowerCase()) : undefined),
      resolveEaTypeExpr: (ea) => (ea.kind === 'EaName' ? resolutions.get(ea.name.toLowerCase())?.typeExpr : undefined),
      resolveScalarBinding: (name) => (name.toLowerCase() === 'idxw' ? 'word' : undefined),
      resolveScalarKind: (typeExpr) =>
        typeExpr.kind === 'TypeName' && (typeExpr.name === 'word' || typeExpr.name === 'addr')
          ? typeExpr.name
          : undefined,
      sizeOfTypeExpr: (typeExpr) => {
        if (typeExpr.kind !== 'TypeName') return undefined;
        if (typeExpr.name === 'wide8') return 8;
        if (typeExpr.name === 'word' || typeExpr.name === 'addr') return 2;
        return undefined;
      },
      evalImmExpr: () => undefined,
    });

    const globPipe = helpers.buildEaWordPipeline(
      { kind: 'EaIndex', span, base: eaName('globwide'), index: { kind: 'IndexReg16', span, reg: 'HL' } },
      span,
    );
    const framePipe = helpers.buildEaWordPipeline(
      {
        kind: 'EaIndex',
        span,
        base: eaName('framewide'),
        index: { kind: 'IndexImm', span, value: { kind: 'ImmName', span, name: 'idxw' } },
      },
      span,
    );

    expect(renderStepPipeline(globPipe ?? [])).toEqual([
      'ld de, globwide',
      'add hl, hl',
      'add hl, hl',
      'add hl, hl',
      'add hl, de',
    ]);
    expect(renderStepPipeline(framePipe ?? [])).toEqual([
      'ld e, (ix-$10)',
      'ld d, (ix-$0f)',
      'ld hl, (idxw)',
      'add hl, hl',
      'add hl, hl',
      'add hl, hl',
      'add hl, de',
    ]);
    expect(diagnostics).toEqual([]);
  });

  it('keeps runtime address materialization valid up to $8000-sized elements', () => {
    const diagnostics: Diagnostic[] = [];
    const emittedInstrs: string[] = [];
    const absFixups: Array<{ opcode: number; baseLower: string; addend: number }> = [];
    const hugeArray = arrayType(typeName('wide32768'));

    const helpers = createValueMaterializationHelpers({
      diagnostics,
      diagAt: (_diagnostics, _span, message) => {
        diagnostics.push({
          id: DiagnosticIds.EmitError,
          severity: 'error',
          file: span.file,
          message,
        });
      },
      reg8: new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']),
      resolveEa: (ea) => {
        if (ea.kind === 'EaName' && ea.name === 'globHuge') {
          return { kind: 'abs', baseLower: 'globhuge', addend: 0, typeExpr: hugeArray } as const;
        }
        return undefined;
      },
      resolveEaTypeExpr: (ea) => {
        if (ea.kind === 'EaName' && ea.name === 'globHuge') return hugeArray;
        return undefined;
      },
      resolveAggregateType: () => undefined,
      resolveScalarBinding: () => undefined,
      resolveScalarKind: () => undefined,
      sizeOfTypeExpr: (typeExpr) => {
        if (typeExpr.kind === 'TypeName' && typeExpr.name === 'wide32768') return 0x8000;
        return undefined;
      },
      evalImmExpr: () => undefined,
      evalImmNoDiag: () => undefined,
      emitInstr: (head: string, operands: AsmOperandNode[]) => {
        emittedInstrs.push(`${head} ${operands.map((operand) => operand.kind).join(',')}`);
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
      { kind: 'EaIndex', span, base: eaName('globHuge'), index: { kind: 'IndexReg8', span, reg: 'C' } },
      span,
    );

    expect(result).toBe(true);
    expect(absFixups).toEqual([{ opcode: 0x11, baseLower: 'globhuge', addend: 0 }]);
    expect(emittedInstrs.filter((instr) => instr === 'add Reg,Reg')).toHaveLength(16);
    expect(diagnostics).toEqual([]);
  });
});
