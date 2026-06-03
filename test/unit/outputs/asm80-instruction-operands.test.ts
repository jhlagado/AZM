import { describe, expect, it } from 'vitest';

import type { Expression } from '../../../src/model/expression.js';
import { formatBitOp, formatRotateShift } from '../../../src/outputs/asm80-instruction-operands.js';
import { formatIndexedMemory, formatLd } from '../../../src/outputs/asm80-ld-operands.js';
import type { LoweredEvalContext } from '../../../src/outputs/asm80-expressions.js';

const emptyContext: LoweredEvalContext = {
  constants: new Map(),
  symbols: new Map(),
  layouts: new Map(),
};

const n = (value: number): Expression => ({ kind: 'number', value });
const sym = (name: string): Expression => ({ kind: 'symbol', name });

describe('ASM80 instruction operand lowering', () => {
  it('formats indexed memory displacements with canonical signed bytes', () => {
    expect(formatIndexedMemory('ix', n(0), emptyContext)).toBe('(ix+$00)');
    expect(formatIndexedMemory('iy', n(7), emptyContext)).toBe('(iy+$07)');
    expect(formatIndexedMemory('ix', n(-4), emptyContext)).toBe('(ix-$04)');
  });

  it('formats LD register, immediate, indirect, indexed, and absolute forms', () => {
    expect(
      formatLd(
        { kind: 'reg8', register: 'a' },
        { kind: 'reg8', register: 'b' },
        emptyContext,
      )?.text,
    ).toBe('ld a, b');
    expect(
      formatLd(
        { kind: 'reg16', register: 'hl' },
        { kind: 'imm', expression: n(0x1234) },
        emptyContext,
      )?.text,
    ).toBe('ld hl, $1234');
    expect(
      formatLd(
        { kind: 'reg8', register: 'c' },
        { kind: 'reg-indirect', register: 'hl' },
        emptyContext,
      )?.text,
    ).toBe('ld c, (hl)');
    expect(
      formatLd(
        { kind: 'reg-indirect', register: 'hl' },
        { kind: 'imm', expression: n(0x2a) },
        emptyContext,
      )?.text,
    ).toBe('ld (hl), $2A');
    expect(
      formatLd(
        { kind: 'indexed', register: 'iy', displacement: n(-1) },
        { kind: 'reg8', register: 'd' },
        emptyContext,
      )?.text,
    ).toBe('ld (iy-$01), d');
    expect(
      formatLd(
        { kind: 'mem-abs', expression: sym('SCREEN') },
        { kind: 'reg16', register: 'bc' },
        emptyContext,
      )?.text,
    ).toBe('ld (SCREEN), bc');
  });

  it('formats bit and rotate/shift operands with optional destination registers', () => {
    expect(
      formatBitOp(
        {
          mnemonic: 'set',
          bit: 5,
          operand: { kind: 'indexed', register: 'ix', displacement: n(3) },
          destination: { kind: 'reg8', register: 'e' },
        },
        emptyContext,
      )?.text,
    ).toBe('set $05, (ix+$03), e');
    expect(
      formatRotateShift(
        {
          mnemonic: 'rr',
          operand: { kind: 'reg-indirect', register: 'hl' },
        },
        emptyContext,
      )?.text,
    ).toBe('rr (HL)');
  });
});
