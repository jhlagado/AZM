import { describe, expect, it } from 'vitest';

import type { Z80Instruction } from '../../../src/z80/instruction.js';
import { regName } from '../../../src/register-contracts/operand-register-name.js';
import {
  instructionOperand,
  instructionOperandCount,
} from '../../../src/register-contracts/instruction-operands.js';
import {
  isAccumulatorSelfOperand,
  isImmediateZeroOperand,
  isPureTokenTransferInstruction,
  isRegisterOperand,
} from '../../../src/register-contracts/instruction-predicates.js';
import type { RegisterContractsInstruction } from '../../../src/register-contracts/types.js';

function item(instruction: Z80Instruction): RegisterContractsInstruction {
  return { instruction, file: 'test.asm', line: 1, column: 1, labels: [] };
}

describe('register-contracts instruction shape helpers', () => {
  it('counts operands for branch, transfer, and targeted ALU shapes', () => {
    expect(instructionOperandCount({ mnemonic: 'ret' })).toBe(0);
    expect(
      instructionOperandCount({ mnemonic: 'call', expression: { kind: 'symbol', name: 'NEXT' } }),
    ).toBe(1);
    expect(
      instructionOperandCount({
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'a' },
        source: { kind: 'reg8', register: 'b' },
      }),
    ).toBe(2);
    expect(
      instructionOperandCount({
        mnemonic: 'add',
        target: { kind: 'reg16', register: 'hl' },
        source: { kind: 'reg16', register: 'de' },
      }),
    ).toBe(2);
    expect(
      instructionOperandCount({ mnemonic: 'adc', source: { kind: 'reg8', register: 'a' } }),
    ).toBe(1);
  });

  it('extracts positional operands for LD, ALU, and EX forms', () => {
    const ld: Z80Instruction = {
      mnemonic: 'ld',
      target: { kind: 'reg8', register: 'a' },
      source: { kind: 'imm', expression: { kind: 'number', value: 0x2a } },
    };
    expect(regName(instructionOperand(ld, 0))).toBe('A');
    expect(instructionOperand(ld, 1)?.kind).toBe('imm');

    const add: Z80Instruction = {
      mnemonic: 'add',
      target: { kind: 'reg16', register: 'hl' },
      source: { kind: 'reg16', register: 'bc' },
    };
    expect(regName(instructionOperand(add, 0))).toBe('HL');
    expect(regName(instructionOperand(add, 1))).toBe('BC');

    const ex: Z80Instruction = { mnemonic: 'ex', form: 'de-hl' };
    expect(regName(instructionOperand(ex, 0))).toBe('DE');
    expect(regName(instructionOperand(ex, 1))).toBe('HL');
  });

  it('recognizes pure token transfer and accumulator idioms', () => {
    expect(
      isPureTokenTransferInstruction(
        item({
          mnemonic: 'ld',
          target: { kind: 'reg8', register: 'a' },
          source: { kind: 'imm', expression: { kind: 'number', value: 1 } },
        }),
      ),
    ).toBe(true);
    expect(isPureTokenTransferInstruction(item({ mnemonic: 'ex', form: 'de-hl' }))).toBe(true);
    expect(
      isAccumulatorSelfOperand(item({ mnemonic: 'or', source: { kind: 'reg8', register: 'a' } })),
    ).toBe(true);
    expect(
      isImmediateZeroOperand(
        item({ mnemonic: 'cp', source: { kind: 'imm', expression: { kind: 'number', value: 0 } } }),
      ),
    ).toBe(true);
  });

  it('matches register operands case-insensitively', () => {
    const instruction: Z80Instruction = {
      mnemonic: 'ld',
      target: { kind: 'reg16', register: 'hl' },
      source: { kind: 'reg16', register: 'de' },
    };

    expect(isRegisterOperand(item(instruction), 0, 'hl')).toBe(true);
    expect(isRegisterOperand(item(instruction), 1, 'DE')).toBe(true);
    expect(isRegisterOperand(undefined, 0, 'HL')).toBe(false);
  });
});
