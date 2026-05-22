import { describe, expect, it } from 'vitest';

import { encodeZ80Instruction } from '../../../src/z80/encode.js';
import { parseZ80Instruction } from '../../../src/z80/parse-instruction.js';

describe('Stage 5 z80 parser and encoder foundation', () => {
  it('parses the first evidence-backed instruction slice case-insensitively', () => {
    expect(parseZ80Instruction('nOp')).toEqual({ instruction: { mnemonic: 'nop' } });
    expect(parseZ80Instruction('rEt')).toEqual({ instruction: { mnemonic: 'ret' } });
    expect(parseZ80Instruction('lD A,Value')).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'a' },
        source: { kind: 'imm', expression: { kind: 'symbol', name: 'Value' } },
      },
    });
    expect(parseZ80Instruction('jR nC,target + 1')).toEqual({
      instruction: {
        mnemonic: 'jr-cc',
        condition: 'nc',
        expression: {
          kind: 'binary',
          operator: '+',
          left: { kind: 'symbol', name: 'target' },
          right: { kind: 'number', value: 1 },
        },
      },
    });
  });

  it('parses the first LD evidence slice', () => {
    expect(parseZ80Instruction('LD B,2')).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'b' },
        source: { kind: 'imm', expression: { kind: 'number', value: 2 } },
      },
    });
    expect(parseZ80Instruction("LD A,','")).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'a' },
        source: { kind: 'imm', expression: { kind: 'number', value: 44 } },
      },
    });
    expect(parseZ80Instruction('ld c,a')).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'c' },
        source: { kind: 'reg8', register: 'a' },
      },
    });
    expect(parseZ80Instruction('ld a,(de)')).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'a' },
        source: { kind: 'reg-indirect', register: 'de' },
      },
    });
    expect(parseZ80Instruction('ld (bc),a')).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg-indirect', register: 'bc' },
        source: { kind: 'reg8', register: 'a' },
      },
    });
    expect(parseZ80Instruction('ld (bc),(de)')).toEqual({
      error: 'unsupported LD operands: (bc),(de)',
    });
    expect(parseZ80Instruction('ld a,(4000H)')).toEqual({
      error: 'invalid LD operands: a,(4000H)',
    });
    expect(parseZ80Instruction('ld a,b,')).toEqual({ error: 'ld expects two operands' });
    expect(parseZ80Instruction('ld a,,b')).toEqual({ error: 'ld expects two operands' });
  });

  it('emits byte-template fragments without resolving assembler symbols', () => {
    expect(encodeZ80Instruction({ mnemonic: 'nop' })).toEqual({
      size: 1,
      fragments: [{ kind: 'bytes', bytes: [0x00] }],
    });
    expect(encodeZ80Instruction({ mnemonic: 'ret' })).toEqual({
      size: 1,
      fragments: [{ kind: 'bytes', bytes: [0xc9] }],
    });
    expect(
      encodeZ80Instruction({
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'a' },
        source: { kind: 'imm', expression: { kind: 'number', value: 0x2a } },
      }),
    ).toEqual({
      size: 2,
      fragments: [
        { kind: 'bytes', bytes: [0x3e] },
        { kind: 'imm8', expression: { kind: 'number', value: 0x2a } },
      ],
    });
  });

  it('emits LD register, immediate, and register-indirect forms from current evidence', () => {
    expect(
      encodeZ80Instruction({
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'b' },
        source: { kind: 'imm', expression: { kind: 'number', value: 2 } },
      }),
    ).toEqual({
      size: 2,
      fragments: [
        { kind: 'bytes', bytes: [0x06] },
        { kind: 'imm8', expression: { kind: 'number', value: 2 } },
      ],
    });
    expect(
      encodeZ80Instruction({
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'c' },
        source: { kind: 'reg8', register: 'a' },
      }),
    ).toEqual({ size: 1, fragments: [{ kind: 'bytes', bytes: [0x4f] }] });
    expect(
      encodeZ80Instruction({
        mnemonic: 'ld',
        target: { kind: 'reg16', register: 'bc' },
        source: { kind: 'imm', expression: { kind: 'number', value: 0x1234 } },
      }),
    ).toEqual({
      size: 3,
      fragments: [
        { kind: 'bytes', bytes: [0x01] },
        { kind: 'abs16', expression: { kind: 'number', value: 0x1234 } },
      ],
    });
    expect(
      encodeZ80Instruction({
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'a' },
        source: { kind: 'reg-indirect', register: 'hl' },
      }),
    ).toEqual({ size: 1, fragments: [{ kind: 'bytes', bytes: [0x7e] }] });
    expect(
      encodeZ80Instruction({
        mnemonic: 'ld',
        target: { kind: 'reg-indirect', register: 'de' },
        source: { kind: 'reg8', register: 'a' },
      }),
    ).toEqual({ size: 1, fragments: [{ kind: 'bytes', bytes: [0x12] }] });
  });

  it('parses the first ALU evidence slice', () => {
    expect(parseZ80Instruction('sub A,B')).toEqual({
      instruction: { mnemonic: 'sub', source: { kind: 'reg8', register: 'b' } },
    });
    expect(parseZ80Instruction('and $F0')).toEqual({
      instruction: {
        mnemonic: 'and',
        source: { kind: 'imm', expression: { kind: 'number', value: 0xf0 } },
      },
    });
    expect(parseZ80Instruction('or a')).toEqual({
      instruction: { mnemonic: 'or', source: { kind: 'reg8', register: 'a' } },
    });
    expect(parseZ80Instruction('xor A,$55')).toEqual({
      instruction: {
        mnemonic: 'xor',
        source: { kind: 'imm', expression: { kind: 'number', value: 0x55 } },
      },
    });
    expect(parseZ80Instruction('cp (hl)')).toEqual({
      instruction: { mnemonic: 'cp', source: { kind: 'reg-indirect', register: 'hl' } },
    });
    expect(parseZ80Instruction('cp (4000H)')).toEqual({
      error: 'invalid CP operand: (4000H)',
    });
    expect(parseZ80Instruction('and b,c')).toEqual({
      error: 'and two-operand form requires destination A',
    });
  });

  it('emits ALU register, immediate, and (HL) forms from current evidence', () => {
    const cases = [
      ['sub b', [0x90]],
      ['sub 1', [0xd6, 'imm8']],
      ['sub (hl)', [0x96]],
      ['and h', [0xa4]],
      ['and $F0', [0xe6, 'imm8']],
      ['and (hl)', [0xa6]],
      ['or l', [0xb5]],
      ['or $0F', [0xf6, 'imm8']],
      ['or (hl)', [0xb6]],
      ['xor a', [0xaf]],
      ['xor $55', [0xee, 'imm8']],
      ['xor (hl)', [0xae]],
      ['cp b', [0xb8]],
      ['cp $10', [0xfe, 'imm8']],
      ['cp (hl)', [0xbe]],
    ] as const;

    for (const [source, expected] of cases) {
      const parsed = parseZ80Instruction(source);
      expect(parsed).toHaveProperty('instruction');
      expect(encodeZ80Instruction(parsed?.instruction as never)).toMatchObject({
        fragments:
          expected[1] === 'imm8'
            ? [{ kind: 'bytes', bytes: [expected[0]] }, { kind: 'imm8' }]
            : [{ kind: 'bytes', bytes: [expected[0]] }],
      });
    }
  });

  it('parses and emits the ADD/ADC/SBC accumulator evidence slice', () => {
    const cases = [
      ['add a,b', [0x80]],
      ['add a,$7F', [0xc6, 'imm8']],
      ['add a,(hl)', [0x86]],
      ['adc a,c', [0x89]],
      ['adc a,$01', [0xce, 'imm8']],
      ['adc a,(hl)', [0x8e]],
      ['sbc a,e', [0x9b]],
      ['sbc a,$03', [0xde, 'imm8']],
      ['sbc a,(hl)', [0x9e]],
    ] as const;

    for (const [source, expected] of cases) {
      const parsed = parseZ80Instruction(source);
      expect(parsed).toHaveProperty('instruction');
      expect(encodeZ80Instruction(parsed?.instruction as never)).toMatchObject({
        fragments:
          expected[1] === 'imm8'
            ? [{ kind: 'bytes', bytes: [expected[0]] }, { kind: 'imm8' }]
            : [{ kind: 'bytes', bytes: [expected[0]] }],
      });
    }

    expect(parseZ80Instruction('add b,c')).toEqual({
      error: 'add two-operand form requires destination A or HL',
    });
  });

  it('parses and emits the 16-bit HL arithmetic evidence slice', () => {
    const cases = [
      ['add hl,bc', [0x09]],
      ['add hl,de', [0x19]],
      ['add hl,hl', [0x29]],
      ['add hl,sp', [0x39]],
      ['adc hl,bc', [0xed, 0x4a]],
      ['adc hl,de', [0xed, 0x5a]],
      ['adc hl,hl', [0xed, 0x6a]],
      ['adc hl,sp', [0xed, 0x7a]],
      ['sbc hl,bc', [0xed, 0x42]],
      ['sbc hl,de', [0xed, 0x52]],
      ['sbc hl,hl', [0xed, 0x62]],
      ['sbc hl,sp', [0xed, 0x72]],
    ] as const;

    for (const [source, expected] of cases) {
      const parsed = parseZ80Instruction(source);
      expect(parsed).toHaveProperty('instruction');
      expect(encodeZ80Instruction(parsed?.instruction as never)).toEqual({
        size: expected.length,
        fragments: [{ kind: 'bytes', bytes: expected }],
      });
    }

    expect(parseZ80Instruction('adc hl,af')).toEqual({
      error: 'adc HL arithmetic source must be BC, DE, HL, or SP',
    });
    expect(parseZ80Instruction('add sp,bc')).toEqual({
      error: 'add two-operand form requires destination A or HL',
    });
  });

  it('parses and emits the first core-ops evidence slice', () => {
    const cases = [
      ['di', [0xf3]],
      ['ei', [0xfb]],
      ['scf', [0x37]],
      ['ccf', [0x3f]],
      ['cpl', [0x2f]],
      ['ex de,hl', [0xeb]],
      ['ex (sp),hl', [0xe3]],
      ['exx', [0xd9]],
      ['halt', [0x76]],
    ] as const;

    for (const [source, expected] of cases) {
      const parsed = parseZ80Instruction(source);
      expect(parsed).toHaveProperty('instruction');
      expect(encodeZ80Instruction(parsed?.instruction as never)).toEqual({
        size: expected.length,
        fragments: [{ kind: 'bytes', bytes: expected }],
      });
    }

    expect(parseZ80Instruction('halt a')).toEqual({ error: 'halt expects no operands' });
    expect(parseZ80Instruction('ex de')).toEqual({ error: 'ex expects two operands' });
    expect(parseZ80Instruction('ex bc,de')).toEqual({ error: 'unsupported EX operands: bc,de' });
  });

  it('parses and emits the IM/RST interrupt-state evidence slice', () => {
    const cases = [
      ['im 0', [0xed, 0x46]],
      ['im 1', [0xed, 0x56]],
      ['im 2', [0xed, 0x5e]],
      ['rst 0', [0xc7]],
      ['rst 8', [0xcf]],
      ['rst 16', [0xd7]],
      ['rst 24', [0xdf]],
      ['rst 32', [0xe7]],
      ['rst 40', [0xef]],
      ['rst 48', [0xf7]],
      ['rst 56', [0xff]],
      ['rst $38', [0xff]],
      ['reti', [0xed, 0x4d]],
      ['retn', [0xed, 0x45]],
    ] as const;

    for (const [source, expected] of cases) {
      const parsed = parseZ80Instruction(source);
      expect(parsed).toHaveProperty('instruction');
      expect(encodeZ80Instruction(parsed?.instruction as never)).toEqual({
        size: expected.length,
        fragments: [{ kind: 'bytes', bytes: expected }],
      });
    }

    expect(parseZ80Instruction('im')).toEqual({ error: 'im expects one operand' });
    expect(parseZ80Instruction('im 3')).toEqual({ error: 'im expects 0, 1, or 2' });
    expect(parseZ80Instruction('rst')).toEqual({ error: 'rst expects one operand' });
    expect(parseZ80Instruction('rst 7')).toEqual({
      error: 'rst expects an imm8 multiple of 8 (0..56)',
    });
    expect(() => encodeZ80Instruction({ mnemonic: 'rst', vector: 7 } as never)).toThrow(
      'invalid RST vector: 7',
    );
    expect(parseZ80Instruction('reti a')).toEqual({ error: 'reti expects no operands' });
    expect(parseZ80Instruction('retn 1')).toEqual({ error: 'retn expects no operands' });
  });

  it('emits ABS16 and REL8 template fragments for control flow', () => {
    expect(
      encodeZ80Instruction({
        mnemonic: 'call',
        expression: { kind: 'symbol', name: 'target' },
      }),
    ).toEqual({
      size: 3,
      fragments: [
        { kind: 'bytes', bytes: [0xcd] },
        { kind: 'abs16', expression: { kind: 'symbol', name: 'target' } },
      ],
    });
    expect(
      encodeZ80Instruction({
        mnemonic: 'jr-cc',
        condition: 'z',
        expression: { kind: 'symbol', name: 'target' },
      }),
    ).toEqual({
      size: 2,
      fragments: [
        { kind: 'bytes', bytes: [0x28] },
        { kind: 'rel8', expression: { kind: 'symbol', name: 'target' }, mnemonic: 'jr z' },
      ],
    });
    expect(
      encodeZ80Instruction({
        mnemonic: 'djnz',
        expression: { kind: 'symbol', name: 'loop' },
      }),
    ).toEqual({
      size: 2,
      fragments: [
        { kind: 'bytes', bytes: [0x10] },
        { kind: 'rel8', expression: { kind: 'symbol', name: 'loop' }, mnemonic: 'djnz' },
      ],
    });
  });
});
