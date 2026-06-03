import { describe, expect, it } from 'vitest';

import type { Expression } from '../../../src/model/expression.js';
import { formatInstruction } from '../../../src/outputs/asm80-instructions.js';
import type { LoweredEvalContext } from '../../../src/outputs/asm80-expressions.js';
import type { Z80Instruction } from '../../../src/z80/instruction.js';

const emptyContext: LoweredEvalContext = {
  constants: new Map(),
  symbols: new Map(),
  layouts: new Map(),
};

const n = (value: number): Expression => ({ kind: 'number', value });
const sym = (name: string): Expression => ({ kind: 'symbol', name });

function text(instruction: Z80Instruction, evalContext = emptyContext): string | undefined {
  return formatInstruction(instruction, evalContext)?.text;
}

describe('ASM80 instruction lowering', () => {
  it('formats zero-operand instructions without synthetic operands', () => {
    expect(text({ mnemonic: 'ret' })).toBe('ret');
    expect(text({ mnemonic: 'ldi' })).toBe('ldi');
    expect(text({ mnemonic: 'retn' })).toBe('retn');
  });

  it('formats register, immediate, indirect, and absolute LD forms', () => {
    expect(
      text({
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'a' },
        source: { kind: 'imm', expression: n(0x2a) },
      }),
    ).toBe('ld a, $2A');
    expect(
      text({
        mnemonic: 'ld',
        target: { kind: 'reg-indirect', register: 'hl' },
        source: { kind: 'imm', expression: n(0x10) },
      }),
    ).toBe('ld (hl), $10');
    expect(
      text({
        mnemonic: 'ld',
        target: { kind: 'mem-abs', expression: sym('screen') },
        source: { kind: 'reg-index16', register: 'ix' },
      }),
    ).toBe('ld (screen), ix');
  });

  it('formats indexed memory displacements with explicit signs', () => {
    expect(
      text({
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'a' },
        source: { kind: 'indexed', register: 'ix', displacement: n(0) },
      }),
    ).toBe('ld a, (ix+$00)');
    expect(
      text({
        mnemonic: 'ld',
        target: { kind: 'indexed', register: 'iy', displacement: n(-3) },
        source: { kind: 'reg8', register: 'b' },
      }),
    ).toBe('ld (iy-$03), b');
  });

  it('formats bit and rotate indexed forms with optional destinations', () => {
    expect(
      text({
        mnemonic: 'bit',
        bit: 3,
        operand: { kind: 'indexed', register: 'ix', displacement: n(2) },
      }),
    ).toBe('bit $03, (ix+$02)');
    expect(
      text({
        mnemonic: 'srl',
        operand: { kind: 'indexed', register: 'iy', displacement: n(-1) },
        destination: { kind: 'reg8', register: 'a' },
      }),
    ).toBe('srl (iy-$01), a');
  });

  it('formats ports, branches, and accumulator ALU forms', () => {
    expect(
      text({
        mnemonic: 'in',
        target: { kind: 'reg8', register: 'b' },
        port: { kind: 'imm', expression: n(6) },
      }),
    ).toBe('in b, ($06)');
    expect(
      text({
        mnemonic: 'out',
        port: { kind: 'c' },
        source: { kind: 'zero' },
      }),
    ).toBe('out (c), 0');
    expect(text({ mnemonic: 'call-cc', condition: 'nz', expression: sym('Target') })).toBe(
      'call nz, Target',
    );
    expect(text({ mnemonic: 'xor', source: { kind: 'reg8', register: 'a' } })).toBe('xor a');
    expect(text({ mnemonic: 'adc', source: { kind: 'imm', expression: n(1) } })).toBe(
      'adc a, $01',
    );
  });
});
