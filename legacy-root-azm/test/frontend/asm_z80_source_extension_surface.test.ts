import { describe, expect, it } from 'vitest';

import { isSupportedSourcePath } from '../../src/frontend/sourceExtensions.js';
import { compileTempSource } from '../helpers/temp_source.js';

async function compileSourceExtensionFixture(ext: string, source: string) {
  return compileTempSource('azm-removals-', ext, source, {
    emitBin: false,
    emitHex: false,
    emitD8m: false,
    emitListing: false,
  });
}

describe('assembler source extension surface', () => {
  it('accepts .asm and .z80 source paths', () => {
    expect(isSupportedSourcePath('/tmp/program.asm')).toBe(true);
    expect(isSupportedSourcePath('/tmp/program.z80')).toBe(true);
    expect(isSupportedSourcePath('/tmp/program.azm')).toBe(false);
    expect(isSupportedSourcePath('/tmp/program.asmi')).toBe(false);
    expect(isSupportedSourcePath('/tmp/program.foo')).toBe(false);
  });

  it('does not reject layout constants in .asm source', async () => {
    const res = await compileSourceExtensionFixture(
      'asm',
      [
        '.type Sprite',
        'x     .byte',
        'y     .byte',
        'flags .byte',
        '.endtype',
        'SpriteSize .equ sizeof(Sprite)',
        'FlagsOffset .equ offset(Sprite, flags)',
        '',
      ].join('\n'),
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('rejects unsupported source extensions', async () => {
    const res = await compileSourceExtensionFixture('foo', ['main:', '    ret', ''].join('\n'));

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Unsupported source file extension'),
      }),
    );
  });
});
