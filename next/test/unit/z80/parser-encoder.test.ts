import { describe, expect, it } from 'vitest';

import { encodeZ80Instruction } from '../../../src/z80/encode.js';
import { parseZ80Instruction } from '../../../src/z80/parse-instruction.js';

describe('Stage 5 z80 parser and encoder foundation', () => {
  it('parses the first evidence-backed instruction slice case-insensitively', () => {
    expect(parseZ80Instruction('nOp')).toEqual({ instruction: { mnemonic: 'nop' } });
    expect(parseZ80Instruction('rEt')).toEqual({ instruction: { mnemonic: 'ret' } });
    expect(parseZ80Instruction('lD A,Value')).toEqual({
      instruction: { mnemonic: 'ld-a-imm', expression: { kind: 'symbol', name: 'Value' } },
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
        mnemonic: 'ld-a-imm',
        expression: { kind: 'number', value: 0x2a },
      }),
    ).toEqual({
      size: 2,
      fragments: [
        { kind: 'bytes', bytes: [0x3e] },
        { kind: 'imm8', expression: { kind: 'number', value: 0x2a } },
      ],
    });
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
