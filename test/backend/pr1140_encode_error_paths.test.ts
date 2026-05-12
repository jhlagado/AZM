import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import type { AsmInstructionNode, AsmOperandNode, SourceSpan } from '../../src/frontend/ast.js';
import { encodeInstruction } from '../../src/z80/encode.js';

const span: SourceSpan = {
  file: 'pr1140_encode_error_paths.zax',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const env = {
  consts: new Map<string, number>(),
  enums: new Map<string, number>(),
  types: new Map(),
};

function instruction(head: string, operands: AsmOperandNode[]): AsmInstructionNode {
  return { kind: 'AsmInstruction', span, head, operands };
}

function reg(name: string): AsmOperandNode {
  return { kind: 'Reg', span, name };
}

function imm(value: number): AsmOperandNode {
  return { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value } };
}

function memName(name: string): AsmOperandNode {
  return { kind: 'Mem', span, expr: { kind: 'EaName', span, name } };
}

function portC(): AsmOperandNode {
  return { kind: 'PortC', span };
}

function portImm(value: number): AsmOperandNode {
  return { kind: 'PortImm8', span, expr: { kind: 'ImmLiteral', span, value } };
}

/** (ix + disp) with disp outside disp8 range (via EaAdd). */
function memIxLargeDisp(): AsmOperandNode {
  return {
    kind: 'Mem',
    span,
    expr: {
      kind: 'EaAdd',
      span,
      base: { kind: 'EaName', span, name: 'IX' },
      offset: { kind: 'ImmLiteral', span, value: 200 },
    },
  };
}

function expectEncodeError(
  diagnostics: Diagnostic[],
  messageIncludes: string,
): void {
  expectDiagnostic(diagnostics, {
    id: DiagnosticIds.EncodeError,
    severity: 'error',
    messageIncludes,
  });
}

describe('PR1140 encodeInstruction error paths', () => {
  describe('encode.ts dispatch', () => {
    it('rejects unknown mnemonics', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('not_a_real_z80_op', [imm(0)]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'Unsupported instruction');
    });

    it('rejects extra operands on zero-arity opcodes', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('ldi', [reg('A')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'ldi expects no operands');
    });

    it('rejects wrong arity for family opcodes (alu)', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('add', [reg('A'), reg('B'), reg('C')]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'add expects two operands');
    });
  });

  describe('control family', () => {
    it('ret: invalid condition', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('ret', [reg('QQ')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'ret cc expects a valid condition code');
    });

    it('ret: too many operands', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('ret', [reg('Z'), reg('Z')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'ret expects no operands or one condition code');
    });

    it('call: indirect target', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('call', [memName('HL')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'call does not support indirect targets');
    });

    it('call: register target', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('call', [reg('HL')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'call does not support register targets');
    });

    it('call: condition without address', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('call', [reg('NZ')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'call cc, nn expects two operands');
    });

    it('call cc: bad condition', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('call', [reg('QQ'), imm(0x1000)]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'call cc expects valid condition code');
    });

    it('djnz: indirect', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('djnz', [memName('HL')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'djnz does not support indirect targets');
    });

    it('jp: bad indirect', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('jp', [memName('BC')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'jp indirect form supports (hl), (ix), or (iy) only');
    });

    it('jp: bare HL needs parentheses', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('jp', [reg('HL')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'requires parentheses');
    });

    it('jp cc: bad condition', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('jp', [reg('QQ'), imm(0x1234)]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'jp cc expects valid condition code');
    });

    it('jr: indirect', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('jr', [memName('HL')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'jr does not support indirect targets');
    });

    it('jr cc: bad condition for jr', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('jr', [reg('PO'), imm(0)]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'jr cc expects valid condition code NZ/Z/NC/C');
    });
  });

  describe('alu family', () => {
    it('add: wrong HL pair', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('add', [reg('HL'), reg('IX')]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'add HL, rr expects BC/DE/HL/SP');
    });

    it('add: wrong destination class', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('add', [reg('BC'), reg('DE')]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'add expects destination A, HL, IX, or IY');
    });

    it('add: IX with wrong pair', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('add', [reg('IX'), reg('IY')]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'add IX, rr supports BC/DE/SP and same-index pair only');
    });

    it('sub: IXH as src without A dest', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('sub', [reg('B'), reg('IXH')]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'sub two-operand form requires destination A');
    });

    it('sub: imm out of range', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('sub', [imm(0x1234)]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'sub expects imm8');
    });

    it('xor: invalid reg8', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('xor', [reg('IX')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'xor expects reg8/imm8/(hl)');
    });

    it('adc: bad HL pair', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('adc', [reg('HL'), reg('IX')]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'adc HL, rr expects BC/DE/HL/SP');
    });

    it('sbc: bad HL pair', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('sbc', [reg('HL'), reg('IX')]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'sbc HL, rr expects BC/DE/HL/SP');
    });

    it('add A: indexed disp out of range', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('add', [reg('A'), memIxLargeDisp()]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'add A, (ix/iy+disp) expects disp8');
    });
  });

  describe('io family', () => {
    it('rst: bad vector', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('rst', [imm(7)]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'rst expects an imm8 multiple of 8');
    });

    it('rst: wrong arity', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('rst', []), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'rst expects one operand');
    });

    it('im: bad mode', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('im', [imm(3)]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'im expects 0, 1, or 2');
    });

    it('in: bad one-operand form', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('in', [reg('A')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'in (c) is the only one-operand in form');
    });

    it('in: IXH destination with (c)', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('in', [reg('IXH'), portC()]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'in destination must use legacy reg8');
    });

    it('in: B with immediate port (needs A)', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('in', [reg('B'), portImm(0x12)]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'in a,(n) immediate port form requires destination A');
    });

    it('out: (n),B needs A as source', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('out', [portImm(0x12), reg('B')]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'out (n),a immediate port form requires source A');
    });

    it('out: wrong arity', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('out', [portC()]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'out expects two operands');
    });
  });

  describe('ld family', () => {
    it('ld: missing operands', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('ld', []), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'ld expects two operands');
    });

    it('ld: memory-to-memory', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('ld', [memName('HL'), memName('DE')]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'memory-to-memory');
    });

    it('ld: AF in unsupported transfer', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('ld', [reg('AF'), reg('BC')]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'ld does not support AF in this form');
    });

    it('ld SP: wrong rhs', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('ld', [reg('SP'), reg('BC')]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'ld SP, rr supports HL/IX/IY only');
    });
  });

  describe('core family', () => {
    it('inc: bad operand', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('inc', [imm(1)]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'inc expects r8/rr/(hl) operand');
    });

    it('dec: bad operand', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('dec', [portImm(1)]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'dec expects r8/rr/(hl) operand');
    });

    it('push: not reg16', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('push', [imm(1)]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'push expects reg16');
    });

    it('push: disallowed pair', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('push', [reg('IXH')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'push supports BC/DE/HL/AF/IX/IY only');
    });

    it('pop: disallowed pair', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('pop', [reg('SP')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'pop supports BC/DE/HL/AF/IX/IY only');
    });

    it('ex: unsupported pair', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('ex', [reg('BC'), reg('DE')]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'ex supports');
    });

    it('core: wrong arity', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('inc', []), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'inc expects one operand');
    });

    it('ex: wrong arity', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('ex', [reg('DE')]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'ex expects two operands');
    });
  });

  describe('bit family', () => {
    it('bit: index out of range', () => {
      const diagnostics: Diagnostic[] = [];
      expect(
        encodeInstruction(instruction('bit', [imm(8), reg('A')]), env, diagnostics),
      ).toBeUndefined();
      expectEncodeError(diagnostics, 'bit index 0..7');
    });

    it('bit: wrong arity', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('bit', [imm(1)]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'bit expects two operands');
    });

    it('res: arity for indexed form', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('res', [imm(0)]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'res expects two operands, or three with indexed source');
    });

    it('rl: arity', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('rl', []), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'rl expects one operand');
    });

    it('rl: invalid operand', () => {
      const diagnostics: Diagnostic[] = [];
      expect(encodeInstruction(instruction('rl', [imm(1)]), env, diagnostics)).toBeUndefined();
      expectEncodeError(diagnostics, 'rl expects reg8 or (hl)');
    });
  });
});
