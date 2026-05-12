import { describe, expect, it } from 'vitest';

import { createValueMaterializationHelpers } from '../../src/lowering/valueMaterialization.js';
import type { AsmOperandNode, EaExprNode, SourceSpan, TypeExprNode } from '../../src/frontend/ast.js';

const span: SourceSpan = {
  file: 'fixture.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function makeContext() {
  const emittedInstrs: string[] = [];
  const rawEmits: string[] = [];
  const absFixups: Array<{ opcode: number; baseLower: string; addend: number }> = [];
  const stepPipelines: string[] = [];

  const ctx = {
    diagnostics: [],
    diagAt: (_diagnostics: unknown[], _span: SourceSpan, _message: string) => {},
    reg8: new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']),
    resolveEa: (ea: EaExprNode) => {
      if (ea.kind === 'EaName' && ea.name === 'globW') return { kind: 'abs', baseLower: 'globw', addend: 0 } as const;
      if (ea.kind === 'EaName' && ea.name === 'globB') return { kind: 'abs', baseLower: 'globb', addend: 0 } as const;
      if (ea.kind === 'EaName' && ea.name === 'slotW') return { kind: 'stack', ixDisp: -2 } as const;
      if (ea.kind === 'EaName' && ea.name === 'slotB') return { kind: 'stack', ixDisp: -1 } as const;
      return undefined;
    },
    resolveEaTypeExpr: (_ea: EaExprNode) => undefined as TypeExprNode | undefined,
    resolveAggregateType: (_typeExpr: TypeExprNode) => undefined,
    resolveScalarBinding: (_name: string) => undefined,
    resolveScalarKind: (_typeExpr: TypeExprNode) => undefined,
    sizeOfTypeExpr: (_typeExpr: TypeExprNode) => undefined,
    evalImmExpr: () => undefined,
    evalImmNoDiag: () => undefined,
    emitInstr: (head: string, operands: AsmOperandNode[]) => {
      emittedInstrs.push(`${head} ${operands.map((op) => op.kind).join(',')}`);
      return true;
    },
    emitRawCodeBytes: (_bytes: Uint8Array, _file: string, asmText: string) => {
      rawEmits.push(asmText);
    },
    emitAbs16Fixup: (opcode: number, baseLower: string, addend: number) => {
      absFixups.push({ opcode, baseLower, addend });
    },
    loadImm16ToDE: () => true,
    loadImm16ToHL: () => true,
    negateHL: () => true,
    pushZeroExtendedReg8: (reg: string) => {
      emittedInstrs.push(`pushZero:${reg}`);
      return true;
    },
    emitStepPipeline: (_pipeline: unknown) => {
      stepPipelines.push('step');
      return true;
    },
    buildEaBytePipeline: () => null,
    buildEaWordPipeline: () => null,
    emitScalarWordLoad: (_target: 'HL' | 'DE' | 'BC', resolved: unknown) => Boolean(resolved),
    formatIxDisp: (disp: number) => `${disp >= 0 ? '+' : ''}${disp}`,
    TEMPLATE_L_ABC: () => [] as never,
    TEMPLATE_LW_DE: () => [] as never,
    LOAD_RP_EA: () => [] as never,
    STORE_RP_EA: () => [] as never,
  };

  return {
    ctx,
    emittedInstrs,
    rawEmits,
    absFixups,
    stepPipelines,
  };
}

describe('PR531 value materialization helpers', () => {
  it('keeps scalar word and byte push paths stable', () => {
    const { ctx, emittedInstrs, absFixups, rawEmits } = makeContext();
    const helpers = createValueMaterializationHelpers(ctx);

    expect(helpers.pushMemValue({ kind: 'EaName', span, name: 'globB' }, 'byte', span)).toBe(true);
    expect(helpers.pushMemValue({ kind: 'EaName', span, name: 'slotB' }, 'byte', span)).toBe(true);
    expect(helpers.pushEaAddress({ kind: 'EaName', span, name: 'slotW' }, span)).toBe(true);

    expect(absFixups).toContainEqual({ opcode: 0x3a, baseLower: 'globb', addend: 0 });
    expect(rawEmits).toContain('ld e, (ix-1)');
    expect(emittedInstrs).toContain('push Reg');
  });

  it('keeps hl-address load/store routing stable', () => {
    const { ctx, stepPipelines } = makeContext();
    const helpers = createValueMaterializationHelpers(ctx);

    expect(helpers.emitLoadWordFromHlAddress('DE', span)).toBe(true);
    expect(helpers.emitStoreWordToHlAddress('DE', span)).toBe(true);

    expect(stepPipelines.length).toBe(2);
  });
});
