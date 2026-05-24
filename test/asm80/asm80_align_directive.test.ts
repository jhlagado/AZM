import { describe, expect, it } from 'vitest';

import type { LogicalLine } from '../../src/source/logical-lines.js';
import { parseLogicalLine } from '../../src/syntax/parse-line.js';
import {
  compileAsm80Fixture,
  getBinBase,
  requireAsm80Artifacts,
} from './helpers.js';

function asmLine(text: string, line = 1): LogicalLine {
  return { sourceName: '/asm.z80', line, text };
}

describe('ASM80 .align directive recognition', () => {
  it('recognizes .align as an alignment directive line', () => {
    const parsed = parseLogicalLine(asmLine('.align 4'));
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.items).toEqual([
      expect.objectContaining({
        kind: 'align',
        alignment: expect.objectContaining({ kind: 'number', value: 4 }),
      }),
    ]);
  });
});

describe('ASM80 .align directive', () => {
  it('advances the current output address to the next alignment boundary', async () => {
    const artifacts = await compileAsm80Fixture('azm-asm80-align-', 'align-directive.z80', [
      '.org 0101H',
      '.db 0AAH',
      '.align 4',
      '.db 055H',
      '.binfrom 0101H',
    ]);
    const { asm80, bin, d8m } = requireAsm80Artifacts(artifacts);

    const base = getBinBase(d8m);
    expect(bin.bytes[0x0101 - base]).toBe(0xaa);
    expect(bin.bytes[0x0104 - base]).toBe(0x55);
    expect(asm80.text).toContain('DS $02, $00');
  });
});
