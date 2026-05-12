import { describe, expect, it } from 'vitest';

import type { AsmOperandNode, EaExprNode, SourceSpan } from '../../src/frontend/ast.js';
import {
  createEaMaterializationHelpers,
  type EAMaterializationContext,
} from '../../src/lowering/eaMaterialization.js';
import type { EaResolution } from '../../src/lowering/eaResolution.js';

const span: SourceSpan = {
  file: 'test.zax',
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
};

const eaName = (name: string): EaExprNode => ({ kind: 'EaName', span, name });

describe('#509 ea materialization helpers', () => {
  it('keeps absolute materialization and non-abs delegation stable', () => {
    const emitted: string[] = [];
    const fixups: string[] = [];
    const resolutions = new Map<string, EaResolution>([
      ['globw', { kind: 'abs', baseLower: 'globw', addend: 2 }],
      ['slotw', { kind: 'stack', ixDisp: -4 }],
      ['indw', { kind: 'indirect', ixDisp: -6, addend: 4 }],
    ]);

    const emitInstr = (head: string, operands: AsmOperandNode[]): boolean => {
      const rendered = operands
        .map((operand) => {
          if (operand.kind !== 'Reg') return operand.kind;
          return operand.name;
        })
        .join(', ');
      emitted.push(rendered ? `${head} ${rendered}` : head);
      return true;
    };

    const materializationCtx: EAMaterializationContext = {
      resolveEa: (ea) => (ea.kind === 'EaName' ? resolutions.get(ea.name.toLowerCase()) : undefined),
      pushEaAddress: () => {
        emitted.push('pushEaAddress');
        return true;
      },
      emitInstr,
      emitAbs16Fixup: (_opcode, target, addend) => {
        fixups.push(`${target}+${addend}`);
      },
      loadImm16ToDE: (value) => {
        emitted.push(`loadImm16ToDE ${value}`);
        return true;
      },
    };
    const helpers = createEaMaterializationHelpers(materializationCtx);

    expect(helpers.materializeEaAddressToHL(eaName('globw'), span)).toBe(true);
    expect(helpers.materializeEaAddressToHL(eaName('slotw'), span)).toBe(true);
    expect(helpers.materializeEaAddressToHL(eaName('indw'), span)).toBe(true);

    expect(fixups).toEqual(['globw+2']);
    expect(emitted).toEqual(['pushEaAddress', 'pop HL', 'pushEaAddress', 'pop HL']);
  });
});
