import { describe, expect, it } from 'vitest';

import { parseAsmLine } from '../../src/frontend/asm80/asmLine.js';
import {
  asmSourceLoweringAvailable,
  compileAsm80Fixture,
  requireAsm80Artifacts,
} from './helpers.js';

const describeAsmCompile = asmSourceLoweringAvailable ? describe : describe.skip;

describe('ASM80 string directive recognition (.cstr/.pstr/.istr)', () => {
  it('recognizes ASM string directives as raw data lines', () => {
    expect(parseAsmLine('/asm.z80', '.cstr "OK"', 1, 0)).toEqual({
      kind: 'rawData',
      directive: 'cstr',
      valuesText: '"OK"',
    });
    expect(parseAsmLine('/asm.z80', 'pstr_label: .pstr "OK"', 2, 0)).toEqual({
      kind: 'rawData',
      label: 'pstr_label',
      directive: 'pstr',
      valuesText: '"OK"',
    });
    expect(parseAsmLine('/asm.z80', 'istr_label: .istr "OK"', 3, 0)).toEqual({
      kind: 'rawData',
      label: 'istr_label',
      directive: 'istr',
      valuesText: '"OK"',
    });
  });
});

describeAsmCompile('ASM80 string directives (.cstr/.pstr/.istr)', () => {
  it('emits null-terminated, length-prefixed, and high-bit-terminated strings', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-string-', 'string-directives.z80', [
      '.org 0100H',
      'cstr_label:',
      '  .cstr "OK"',
      'pstr_label:',
      '  .pstr "OK"',
      'istr_label:',
      '  .istr "OK"',
    ]);
    const { asm80, bin } = requireAsm80Artifacts(artifacts);

    const bytes = [...bin.bytes.slice(0, 8)];
    expect(bytes).toEqual([0x4f, 0x4b, 0x00, 0x02, 0x4f, 0x4b, 0x4f, 0xcb]);
    expect(asm80.text).toContain('DB $4F, $4B, $00');
    expect(asm80.text).toContain('DB $02, $4F, $4B');
    expect(asm80.text).toContain('DB $4F, $CB');
  });
});

if (!asmSourceLoweringAvailable) {
  describe('ASM80 string directives (.cstr/.pstr/.istr)', () => {
    it.todo('BLOCKED: enable compile assertion when ASM source parsing/lowering emits raw data');
  });
}
