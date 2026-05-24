import { describe, expect, it } from 'vitest';

import { compileNext } from '../../../src/index.js';
import { parseZ80Instruction } from '../../../src/z80/parse-instruction.js';

/**
 * Parse-level matrix ported from historical PR coverage: `backend/pr1140_encode_error_paths.test.ts`.
 * Legacy used AST `encodeInstruction` + diagnostics; Next surfaces the same legality rules via
 * `parseZ80Instruction` (and assembler resolution for disp8 range).
 */
type ParseRow = {
  label: string;
  source: string;
  message: string;
};

function expectParseError(source: string, message: string): void {
  expect(parseZ80Instruction(source)).toEqual({ error: message });
}

describe('PR1140: encodeInstruction error paths (parse parity)', () => {
  describe('dispatch / arity', () => {
    it.each([
      { label: 'ldi extra operand', source: 'ldi a', message: 'ldi expects no operands' },
      {
        label: 'add wrong arity',
        source: 'add a,b,c',
        message: 'add expects two operands',
      },
    ] satisfies ParseRow[])('$label', ({ source, message }) => {
      expectParseError(source, message);
    });

    it('does not treat unknown mnemonics as encoder errors (Next parse boundary)', () => {
      expect(parseZ80Instruction('not_a_real_z80_op 0')).toBeUndefined();
    });

    it('does not parse bare ld as an encoder error (Next parse boundary)', () => {
      expect(parseZ80Instruction('ld')).toBeUndefined();
    });
  });

  describe('control family', () => {
    it.each([
      {
        label: 'ret invalid condition',
        source: 'ret qq',
        message: 'ret cc expects a valid condition code',
      },
      {
        label: 'ret too many operands',
        source: 'ret z,z',
        message: 'ret expects no operands or one condition code',
      },
      {
        label: 'call indirect',
        source: 'call (hl)',
        message: 'call does not support indirect targets; use imm16',
      },
      {
        label: 'call register target',
        source: 'call hl',
        message: 'call does not support register targets; use imm16',
      },
      {
        label: 'call cc without address',
        source: 'call nz',
        message: 'call cc, nn expects two operands (cc, nn)',
      },
      {
        label: 'call cc bad condition',
        source: 'call qq,1000h',
        message: 'call cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M',
      },
      {
        label: 'djnz indirect',
        source: 'djnz (hl)',
        message: 'djnz does not support indirect targets; expects disp8',
      },
      {
        label: 'jp bad indirect',
        source: 'jp (bc)',
        message: 'jp indirect form supports (hl), (ix), or (iy) only',
      },
      {
        label: 'jp bare HL',
        source: 'jp hl',
        message: 'jp indirect form requires parentheses; use (hl), (ix), or (iy)',
      },
      {
        label: 'jp cc bad condition',
        source: 'jp qq,1234h',
        message: 'jp cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M',
      },
      {
        label: 'jr indirect',
        source: 'jr (hl)',
        message: 'jr does not support indirect targets; expects disp8',
      },
      {
        label: 'jr cc bad condition',
        source: 'jr po,0',
        message: 'jr cc expects valid condition code NZ/Z/NC/C',
      },
    ] satisfies ParseRow[])('$label', ({ source, message }) => {
      expectParseError(source, message);
    });
  });

  describe('alu family', () => {
    it.each([
      {
        label: 'add wrong HL pair',
        source: 'add hl,ix',
        message: 'add HL, rr expects BC/DE/HL/SP',
      },
      {
        label: 'add wrong destination class',
        source: 'add bc,de',
        message: 'add expects destination A, HL, IX, or IY',
      },
      {
        label: 'add IX wrong pair',
        source: 'add ix,iy',
        message: 'add IX, rr supports BC/DE/SP and same-index pair only',
      },
      {
        label: 'sub IXH without A dest',
        source: 'sub b,ixh',
        message: 'sub two-operand form requires destination A',
      },
      { label: 'sub imm out of range', source: 'sub 1234h', message: 'sub expects imm8' },
      {
        label: 'xor invalid operand',
        source: 'xor (bc)',
        message: 'invalid XOR operand: (bc)',
      },
      {
        label: 'adc bad HL pair',
        source: 'adc hl,ix',
        message: 'adc HL, rr expects BC/DE/HL/SP',
      },
      {
        label: 'sbc bad HL pair',
        source: 'sbc hl,ix',
        message: 'sbc HL, rr expects BC/DE/HL/SP',
      },
    ] satisfies ParseRow[])('$label', ({ source, message }) => {
      expectParseError(source, message);
    });

    it('reports indexed ADD displacement outside disp8 at assemble time', () => {
      const result = compileNext(`
        .org 100h
        ADD A,(IX+200)
`);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({ message: 'indexed displacement out of range: 200.' }),
      ]);
      expect(Array.from(result.bytes)).toEqual([]);
    });
  });

  describe('io family', () => {
    it.each([
      {
        label: 'rst bad vector',
        source: 'rst 7',
        message: 'rst expects an imm8 multiple of 8 (0..56)',
      },
      { label: 'rst wrong arity', source: 'rst', message: 'rst expects one operand' },
      { label: 'im bad mode', source: 'im 3', message: 'im expects 0, 1, or 2' },
      {
        label: 'in bad one-operand form',
        source: 'in a',
        message: 'in (c) is the only one-operand in form',
      },
      {
        label: 'in IXH with (c)',
        source: 'in ixh,(c)',
        message: 'in destination must use plain reg8 B/C/D/E/H/L/A',
      },
      {
        label: 'in B immediate port',
        source: 'in b,($12)',
        message: 'in a,(n) immediate port form requires destination A',
      },
      {
        label: 'out immediate port needs A',
        source: 'out ($12),b',
        message: 'out (n),a immediate port form requires source A',
      },
      { label: 'out wrong arity', source: 'out (c)', message: 'out expects two operands' },
    ] satisfies ParseRow[])('$label', ({ source, message }) => {
      expectParseError(source, message);
    });
  });

  describe('ld family', () => {
    it.each([
      {
        label: 'memory-to-memory',
        source: 'ld (hl),(de)',
        message: 'ld does not support memory-to-memory transfers',
      },
      {
        label: 'AF unsupported',
        source: 'ld af,bc',
        message: 'ld does not support AF in this form',
      },
      {
        label: 'ld SP wrong rhs',
        source: 'ld sp,bc',
        message: 'ld rr, rr supports SP <- HL/IX/IY only',
      },
    ] satisfies ParseRow[])('$label', ({ source, message }) => {
      expectParseError(source, message);
    });
  });

  describe('core family', () => {
    it.each([
      {
        label: 'inc bad operand',
        source: 'inc 1',
        message: 'inc expects r8/rr/(hl) operand',
      },
      {
        label: 'dec bad operand',
        source: 'dec (12h)',
        message: 'dec expects r8/rr/(hl) operand',
      },
      {
        label: 'push not reg16',
        source: 'push 1',
        message: 'push supports BC/DE/HL/AF/IX/IY only',
      },
      {
        label: 'push disallowed pair',
        source: 'push ixh',
        message: 'push supports BC/DE/HL/AF/IX/IY only',
      },
      {
        label: 'pop disallowed pair',
        source: 'pop sp',
        message: 'pop supports BC/DE/HL/AF/IX/IY only',
      },
      {
        label: 'ex unsupported pair',
        source: 'ex bc,de',
        message:
          'ex supports "AF, AF\'", "DE, HL", "(SP), HL", "(SP), IX", and "(SP), IY" only',
      },
      { label: 'inc wrong arity', source: 'inc', message: 'inc expects one operand' },
      { label: 'ex wrong arity', source: 'ex de', message: 'ex expects two operands' },
    ] satisfies ParseRow[])('$label', ({ source, message }) => {
      expectParseError(source, message);
    });
  });

  describe('bit family', () => {
    it.each([
      {
        label: 'bit index out of range',
        source: 'bit 8,a',
        message: 'bit expects bit index 0..7',
      },
      {
        label: 'bit wrong arity',
        source: 'bit 1',
        message: 'bit expects two operands',
      },
      {
        label: 'res arity',
        source: 'res 0',
        message: 'res expects two operands, or three with indexed source + reg8 destination',
      },
      {
        label: 'rl arity',
        source: 'rl',
        message: 'rl expects one operand, or two with indexed source + reg8 destination',
      },
      {
        label: 'rl invalid operand',
        source: 'rl 1',
        message: 'rl expects reg8 or (hl)',
      },
    ] satisfies ParseRow[])('$label', ({ source, message }) => {
      expectParseError(source, message);
    });
  });
});
