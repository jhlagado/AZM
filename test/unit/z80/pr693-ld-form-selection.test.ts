import { describe, expect, it } from 'vitest';

import { encodeZ80Instruction } from '../../../src/z80/encode.js';
import { parseZ80Instruction } from '../../../src/z80/parse-instruction.js';

// Supersedes historical PR coverage: `pr693_ld_form_selection.test.ts`.
// Legacy analyzed AST `ldFormSelection` flags; Next applies the same rules in
// `parse-instruction` operand classification and LD encoding.
describe('PR693 ld form selection (promoted coverage)', () => {
  it('leaves bare symbols as immediate operands', () => {
    expect(parseZ80Instruction('ld a,glob_b')).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'a' },
        source: { kind: 'imm', expression: { kind: 'symbol', name: 'glob_b' } },
      },
    });
    expect(parseZ80Instruction('ld a,(glob_b)')).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'a' },
        source: { kind: 'mem-abs', expression: { kind: 'symbol', name: 'glob_b' } },
      },
    });
  });

  it('classifies ix/iy displacement memory as indexed ld (encoder path)', () => {
    const parsed = parseZ80Instruction('ld (ix+2),a');
    expect(parsed).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: {
          kind: 'indexed',
          register: 'ix',
          displacement: { kind: 'number', value: 2 },
        },
        source: { kind: 'reg8', register: 'a' },
      },
    });

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
    expect(encoded.size).toBe(3);
    expect(signature).toEqual([0xdd, 0x77, 'disp8']);
  });

  it('rejects symbol memory-to-memory ld without pseudo register-indirect forms', () => {
    expect(parseZ80Instruction('ld (dst_w),(src_w)')).toEqual({
      error: 'ld does not support memory-to-memory transfers',
    });

    const store = parseZ80Instruction('ld (dst_w),a');
    expect(store).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'mem-abs', expression: { kind: 'symbol', name: 'dst_w' } },
        source: { kind: 'reg8', register: 'a' },
      },
    });
    const load = parseZ80Instruction('ld a,(src_w)');
    expect(load).toEqual({
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'a' },
        source: { kind: 'mem-abs', expression: { kind: 'symbol', name: 'src_w' } },
      },
    });
  });
});
