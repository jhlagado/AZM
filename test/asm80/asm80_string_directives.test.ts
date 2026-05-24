import { describe, expect, it } from 'vitest';

import type { LogicalLine } from '../../src/source/logical-lines.js';
import { parseLogicalLine } from '../../src/syntax/parse-line.js';
import { compileAsm80Fixture, requireAsm80Artifacts } from './helpers.js';

function asmLine(text: string, line = 1): LogicalLine {
  return { sourceName: '/asm.z80', line, text };
}

describe('ASM80 string directive recognition (.cstr/.pstr/.istr)', () => {
  it('recognizes ASM string directives as string-data lines', () => {
    expect(parseLogicalLine(asmLine('.cstr "OK"'))).toMatchObject({
      diagnostics: [],
      items: [expect.objectContaining({ kind: 'string-data', directive: 'cstr', value: 'OK' })],
    });
    expect(parseLogicalLine(asmLine('pstr_label: .pstr "OK"', 2))).toMatchObject({
      diagnostics: [],
      items: [
        expect.objectContaining({ kind: 'label', name: 'pstr_label' }),
        expect.objectContaining({ kind: 'string-data', directive: 'pstr', value: 'OK' }),
      ],
    });
    expect(parseLogicalLine(asmLine('istr_label: .istr "OK"', 3))).toMatchObject({
      diagnostics: [],
      items: [
        expect.objectContaining({ kind: 'label', name: 'istr_label' }),
        expect.objectContaining({ kind: 'string-data', directive: 'istr', value: 'OK' }),
      ],
    });
  });
});

describe('ASM80 string directives (.cstr/.pstr/.istr)', () => {
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
