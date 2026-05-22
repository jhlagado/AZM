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

  it('parses and emits the conditional control-flow and indirect JP evidence slice', () => {
    const conditionalCases = [
      ['ret nz', [0xc0]],
      ['ret z', [0xc8]],
      ['ret nc', [0xd0]],
      ['ret c', [0xd8]],
      ['ret po', [0xe0]],
      ['ret pe', [0xe8]],
      ['ret p', [0xf0]],
      ['ret m', [0xf8]],
      ['jp nz,target', [0xc2, 'abs16']],
      ['jp z,target', [0xca, 'abs16']],
      ['jp nc,target', [0xd2, 'abs16']],
      ['jp c,target', [0xda, 'abs16']],
      ['jp po,target', [0xe2, 'abs16']],
      ['jp pe,target', [0xea, 'abs16']],
      ['jp p,target', [0xf2, 'abs16']],
      ['jp m,target', [0xfa, 'abs16']],
      ['call nz,target', [0xc4, 'abs16']],
      ['call z,target', [0xcc, 'abs16']],
      ['call nc,target', [0xd4, 'abs16']],
      ['call c,target', [0xdc, 'abs16']],
      ['call po,target', [0xe4, 'abs16']],
      ['call pe,target', [0xec, 'abs16']],
      ['call p,target', [0xf4, 'abs16']],
      ['call m,target', [0xfc, 'abs16']],
    ] as const;

    for (const [source, expected] of conditionalCases) {
      const parsed = parseZ80Instruction(source);
      expect(parsed).toHaveProperty('instruction');
      expect(encodeZ80Instruction(parsed?.instruction as never)).toMatchObject({
        size: expected[1] === 'abs16' ? 3 : 1,
        fragments:
          expected[1] === 'abs16'
            ? [{ kind: 'bytes', bytes: [expected[0]] }, { kind: 'abs16' }]
            : [{ kind: 'bytes', bytes: [expected[0]] }],
      });
    }

    expect(parseZ80Instruction('jp (hl)')).toEqual({
      instruction: { mnemonic: 'jp-indirect', register: 'hl' },
    });
    expect(parseZ80Instruction('jp (ix)')).toEqual({
      instruction: { mnemonic: 'jp-indirect', register: 'ix' },
    });
    expect(parseZ80Instruction('jp (iy)')).toEqual({
      instruction: { mnemonic: 'jp-indirect', register: 'iy' },
    });
    expect(encodeZ80Instruction({ mnemonic: 'jp-indirect', register: 'hl' })).toEqual({
      size: 1,
      fragments: [{ kind: 'bytes', bytes: [0xe9] }],
    });
    expect(encodeZ80Instruction({ mnemonic: 'jp-indirect', register: 'ix' })).toEqual({
      size: 2,
      fragments: [{ kind: 'bytes', bytes: [0xdd, 0xe9] }],
    });
    expect(encodeZ80Instruction({ mnemonic: 'jp-indirect', register: 'iy' })).toEqual({
      size: 2,
      fragments: [{ kind: 'bytes', bytes: [0xfd, 0xe9] }],
    });

    expect(parseZ80Instruction('ret q')).toEqual({
      error: 'ret cc expects a valid condition code',
    });
    expect(parseZ80Instruction('ret nz,c')).toEqual({
      error: 'ret expects no operands or one condition code',
    });
    expect(parseZ80Instruction('jp q,1')).toEqual({
      error: 'jp cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M',
    });
    expect(parseZ80Instruction('jp nz,a')).toEqual({ error: 'jp cc, nn expects imm16' });
    expect(parseZ80Instruction('jp (bc)')).toEqual({
      error: 'jp indirect form supports (hl), (ix), or (iy) only',
    });
    expect(parseZ80Instruction('jp hl')).toEqual({
      error: 'jp indirect form requires parentheses; use (hl), (ix), or (iy)',
    });
    expect(parseZ80Instruction('call q,1')).toEqual({
      error: 'call cc expects valid condition code NZ/Z/NC/C/PO/PE/P/M',
    });
    expect(parseZ80Instruction('call nz,a')).toEqual({ error: 'call cc, nn expects imm16' });
    expect(parseZ80Instruction('call (hl)')).toEqual({
      error: 'call does not support indirect targets; use imm16',
    });
  });

  it('parses and emits the INC/DEC/PUSH/POP core-ops evidence slice', () => {
    const cases = [
      ['inc b', [0x04]],
      ['inc c', [0x0c]],
      ['inc d', [0x14]],
      ['inc e', [0x1c]],
      ['inc h', [0x24]],
      ['inc l', [0x2c]],
      ['inc a', [0x3c]],
      ['inc bc', [0x03]],
      ['inc de', [0x13]],
      ['inc hl', [0x23]],
      ['inc sp', [0x33]],
      ['inc ix', [0xdd, 0x23]],
      ['inc iy', [0xfd, 0x23]],
      ['inc (hl)', [0x34]],
      ['inc ixh', [0xdd, 0x24]],
      ['inc ixl', [0xdd, 0x2c]],
      ['inc iyh', [0xfd, 0x24]],
      ['inc iyl', [0xfd, 0x2c]],
      ['dec b', [0x05]],
      ['dec c', [0x0d]],
      ['dec d', [0x15]],
      ['dec e', [0x1d]],
      ['dec h', [0x25]],
      ['dec l', [0x2d]],
      ['dec a', [0x3d]],
      ['dec bc', [0x0b]],
      ['dec de', [0x1b]],
      ['dec hl', [0x2b]],
      ['dec sp', [0x3b]],
      ['dec ix', [0xdd, 0x2b]],
      ['dec iy', [0xfd, 0x2b]],
      ['dec (hl)', [0x35]],
      ['dec ixh', [0xdd, 0x25]],
      ['dec ixl', [0xdd, 0x2d]],
      ['dec iyh', [0xfd, 0x25]],
      ['dec iyl', [0xfd, 0x2d]],
      ['push bc', [0xc5]],
      ['push de', [0xd5]],
      ['push hl', [0xe5]],
      ['push af', [0xf5]],
      ['push ix', [0xdd, 0xe5]],
      ['push iy', [0xfd, 0xe5]],
      ['pop bc', [0xc1]],
      ['pop de', [0xd1]],
      ['pop hl', [0xe1]],
      ['pop af', [0xf1]],
      ['pop ix', [0xdd, 0xe1]],
      ['pop iy', [0xfd, 0xe1]],
    ] as const;

    for (const [source, expected] of cases) {
      const parsed = parseZ80Instruction(source);
      expect(parsed).toHaveProperty('instruction');
      expect(encodeZ80Instruction(parsed?.instruction as never)).toEqual({
        size: expected.length,
        fragments: [{ kind: 'bytes', bytes: expected }],
      });
    }

    expect(parseZ80Instruction('inc a,b')).toEqual({ error: 'inc expects one operand' });
    expect(parseZ80Instruction('dec')).toEqual({ error: 'dec expects one operand' });
    expect(parseZ80Instruction('inc 1')).toEqual({ error: 'inc expects r8/rr/(hl) operand' });
    expect(parseZ80Instruction('dec (bc)')).toEqual({ error: 'dec expects r8/rr/(hl) operand' });
    expect(parseZ80Instruction('push')).toEqual({ error: 'push expects one operand' });
    expect(parseZ80Instruction('pop a,b')).toEqual({ error: 'pop expects one operand' });
    expect(parseZ80Instruction('push a')).toEqual({
      error: 'push supports BC/DE/HL/AF/IX/IY only',
    });
    expect(parseZ80Instruction('pop ixh')).toEqual({
      error: 'pop supports BC/DE/HL/AF/IX/IY only',
    });
  });

  it('parses and emits the indexed addressing foundation evidence slice', () => {
    expect(parseZ80Instruction('ld a,(ix+5)')).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'a' },
        source: { kind: 'indexed', register: 'ix', displacement: { kind: 'number', value: 5 } },
      },
    });
    expect(parseZ80Instruction('ld (iy-2),b')).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: {
          kind: 'indexed',
          register: 'iy',
          displacement: { kind: 'unary', operator: '-', expression: { kind: 'number', value: 2 } },
        },
        source: { kind: 'reg8', register: 'b' },
      },
    });
    expect(parseZ80Instruction('ld a,(ix-2+1)')).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'a' },
        source: {
          kind: 'indexed',
          register: 'ix',
          displacement: {
            kind: 'binary',
            operator: '+',
            left: { kind: 'unary', operator: '-', expression: { kind: 'number', value: 2 } },
            right: { kind: 'number', value: 1 },
          },
        },
      },
    });

    const cases = [
      ['ld a,(ix+5)', [0xdd, 0x7e, 'disp8']],
      ['ld c,(iy-2)', [0xfd, 0x4e, 'disp8']],
      ['ld (ix+0),a', [0xdd, 0x77, 'disp8']],
      ['ld (iy+127),l', [0xfd, 0x75, 'disp8']],
      ['ld (ix+3),$44', [0xdd, 0x36, 'disp8', 'imm8']],
      ['add a,(ix+1)', [0xdd, 0x86, 'disp8']],
      ['adc a,(iy+2)', [0xfd, 0x8e, 'disp8']],
      ['sbc a,(ix-3)', [0xdd, 0x9e, 'disp8']],
      ['sub (iy+4)', [0xfd, 0x96, 'disp8']],
      ['and (ix+5)', [0xdd, 0xa6, 'disp8']],
      ['or (iy+6)', [0xfd, 0xb6, 'disp8']],
      ['xor (ix+7)', [0xdd, 0xae, 'disp8']],
      ['cp (iy+8)', [0xfd, 0xbe, 'disp8']],
      ['inc (ix+9)', [0xdd, 0x34, 'disp8']],
      ['dec (iy-10)', [0xfd, 0x35, 'disp8']],
    ] as const;

    for (const [source, expected] of cases) {
      const parsed = parseZ80Instruction(source);
      expect(parsed).toHaveProperty('instruction');
      const encoded = encodeZ80Instruction(parsed?.instruction as never);
      const signature: Array<number | string> = [];
      for (const fragment of encoded.fragments) {
        if (fragment.kind === 'bytes') {
          signature.push(...fragment.bytes);
        } else {
          signature.push(fragment.kind);
        }
      }
      expect(encoded.size).toBe(expected.length);
      expect(signature).toEqual(expected);
    }

    expect(parseZ80Instruction('ld a,(ix[1])')).toEqual({
      error: 'Indexed memory operands use (ix+disp)/(iy+disp), not ix[disp].',
    });
    expect(parseZ80Instruction('ld (ix+1),(iy+2)')).toEqual({
      error: 'unsupported LD operands: (ix+1),(iy+2)',
    });
    expect(parseZ80Instruction('inc (bc+1)')).toEqual({
      error: 'inc expects r8/rr/(hl) operand',
    });
  });

  it('parses and emits the indexed LD half-register evidence slice', () => {
    expect(parseZ80Instruction('ld ixh,a')).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg-half-index', register: 'ixh' },
        source: { kind: 'reg8', register: 'a' },
      },
    });
    expect(parseZ80Instruction('ld b,iyl')).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'b' },
        source: { kind: 'reg-half-index', register: 'iyl' },
      },
    });
    expect(parseZ80Instruction('ld ix,$1234')).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg-index16', register: 'ix' },
        source: { kind: 'imm', expression: { kind: 'number', value: 0x1234 } },
      },
    });

    const cases = [
      ['ld ixh,a', [0xdd, 0x67]],
      ['ld ixl,e', [0xdd, 0x6b]],
      ['ld a,ixh', [0xdd, 0x7c]],
      ['ld b,ixl', [0xdd, 0x45]],
      ['ld ixh,ixl', [0xdd, 0x65]],
      ['ld iyh,a', [0xfd, 0x67]],
      ['ld iyl,e', [0xfd, 0x6b]],
      ['ld a,iyh', [0xfd, 0x7c]],
      ['ld b,iyl', [0xfd, 0x45]],
      ['ld iyh,iyl', [0xfd, 0x65]],
      ['ld ix,$1234', [0xdd, 0x21, 'abs16']],
      ['ld iy,$2345', [0xfd, 0x21, 'abs16']],
      ['ld sp,hl', [0xf9]],
      ['ld sp,ix', [0xdd, 0xf9]],
      ['ld sp,iy', [0xfd, 0xf9]],
    ] as const;

    for (const [source, expected] of cases) {
      const parsed = parseZ80Instruction(source);
      expect(parsed).toHaveProperty('instruction');
      const encoded = encodeZ80Instruction(parsed?.instruction as never);
      const signature: Array<number | string> = [];
      for (const fragment of encoded.fragments) {
        if (fragment.kind === 'bytes') {
          signature.push(...fragment.bytes);
        } else {
          signature.push(fragment.kind);
        }
      }
      const expectedSize = expected.reduce(
        (size, item) => size + (String(item) === 'abs16' ? 2 : 1),
        0,
      );
      expect(encoded.size).toBe(expectedSize);
      expect(signature).toEqual(expected);
    }

    expect(parseZ80Instruction('ld h,ixh')).toEqual({
      error: 'ld with IX*/IY* does not support plain H/L counterpart operands',
    });
    expect(parseZ80Instruction('ld ixh,iyh')).toEqual({
      error: 'ld between IX* and IY* byte registers is not supported',
    });
    expect(parseZ80Instruction('ld sp,bc')).toEqual({
      error: 'ld rr, rr supports SP <- HL/IX/IY only',
    });
    expect(
      encodeZ80Instruction({
        mnemonic: 'ld',
        target: { kind: 'reg16', register: 'sp' },
        source: { kind: 'reg16', register: 'bc' },
      }),
    ).toEqual({ size: 0, fragments: [] });
    expect(
      encodeZ80Instruction({
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'h' },
        source: { kind: 'reg-half-index', register: 'ixh' },
      }),
    ).toEqual({ size: 0, fragments: [] });
    expect(
      encodeZ80Instruction({
        mnemonic: 'ld',
        target: { kind: 'reg-half-index', register: 'ixh' },
        source: { kind: 'reg-half-index', register: 'iyh' },
      }),
    ).toEqual({ size: 0, fragments: [] });
  });
});
