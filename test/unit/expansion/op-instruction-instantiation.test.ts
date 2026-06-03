import { describe, expect, it } from 'vitest';

import { instantiateTemplateInstruction } from '../../../src/expansion/op-instruction-instantiation.js';
import type { OpOperand } from '../../../src/expansion/op-expansion.js';

const reg8 = (register: string): OpOperand => ({ kind: 'reg8', register, text: register });
const reg16 = (register: string): OpOperand => ({ kind: 'reg16', register, text: register });
const imm = (text: string, value = 0): OpOperand => ({
  kind: 'imm',
  expression: { kind: 'number', value },
  text,
});

describe('op instruction instantiation', () => {
  it('instantiates common direct instruction families', () => {
    expect(instantiateTemplateInstruction('ld', [reg8('a'), imm('$2A', 0x2a)])).toEqual({
      mnemonic: 'ld',
      target: { kind: 'reg8', register: 'a' },
      source: { kind: 'imm', expression: { kind: 'number', value: 0x2a } },
    });

    expect(instantiateTemplateInstruction('inc', [reg16('hl')])).toEqual({
      mnemonic: 'inc',
      operand: { kind: 'reg16', register: 'hl' },
    });
  });

  it('instantiates branch and ALU forms without reparsing when possible', () => {
    expect(instantiateTemplateInstruction('jr', [reg8('nz'), imm('target')])).toEqual({
      mnemonic: 'jr-cc',
      condition: 'nz',
      expression: { kind: 'number', value: 0 },
    });

    expect(instantiateTemplateInstruction('adc', [reg16('hl'), reg16('bc')])).toEqual({
      mnemonic: 'adc',
      target: { kind: 'reg16', register: 'hl' },
      source: { kind: 'reg16', register: 'bc' },
    });
  });

  it('returns undefined for malformed direct forms before parser fallback', () => {
    expect(instantiateTemplateInstruction('in', [reg16('hl'), imm('$10', 0x10)])).toBeUndefined();
    expect(instantiateTemplateInstruction('add', [reg8('b'), imm('$10', 0x10)])).toBeUndefined();
  });
});
