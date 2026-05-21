import { describe, expect, it } from 'vitest';

import { parseAsmLine } from '../../src/frontend/asm80/asmLine.js';
import {
  asmSourceLoweringAvailable,
  compileAsm80Fixture,
  getBinBase,
  requireAsm80Artifacts,
} from './helpers.js';

const describeAsmCompile = asmSourceLoweringAvailable ? describe : describe.skip;

describe('ASM80 .align directive recognition', () => {
  it('recognizes .align as an alignment directive line', () => {
    expect(parseAsmLine('/asm.z80', '.align 4', 1, 0)).toEqual({
      kind: 'align',
      exprText: '4',
    });
  });
});

describeAsmCompile('ASM80 .align directive', () => {
  it('advances the current output address to the next alignment boundary', async () => {
    const artifacts = await compileAsm80Fixture(
      'azm-asm80-align-',
      'align-directive.z80',
      ['.org 0101H', '.db 0AAH', '.align 4', '.db 055H', '.binfrom 0101H'],
    );
    const { asm80, bin, d8m } = requireAsm80Artifacts(artifacts);

    const base = getBinBase(d8m);
    expect(bin.bytes[0x0101 - base]).toBe(0xaa);
    expect(bin.bytes[0x0104 - base]).toBe(0x55);
    expect(asm80.text).toContain('DS $02, $00');
  });
});

if (!asmSourceLoweringAvailable) {
  describe('ASM80 .align directive', () => {
    it.todo('BLOCKED: enable compile assertion when ASM source parsing/lowering emits aligned data');
  });
}
