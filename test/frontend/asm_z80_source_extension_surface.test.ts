import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { isSupportedSourcePath } from '../../src/frontend/sourceExtensions.js';
import { defaultFormatWriters } from '../../src/formats/index.js';

function writeTempSource(ext: string, source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'azm-removals-'));
  const entry = join(dir, `entry.${ext}`);
  writeFileSync(entry, source, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('assembler source extension surface', () => {
  it('accepts .asm and .z80 source paths', () => {
    expect(isSupportedSourcePath('/tmp/program.asm')).toBe(true);
    expect(isSupportedSourcePath('/tmp/program.z80')).toBe(true);
    expect(isSupportedSourcePath('/tmp/program.azm')).toBe(false);
    expect(isSupportedSourcePath('/tmp/program.foo')).toBe(false);
  });

  it('does not reject layout constants in .asm source', async () => {
    const { entry, cleanup } = writeTempSource(
      'asm',
      [
        'type Sprite',
        '    x: byte',
        '    y: byte',
        '    flags: byte',
        'end',
        'SpriteSize .equ sizeof(Sprite)',
        'FlagsOffset .equ offset(Sprite, flags)',
        '',
      ].join('\n'),
    );

    try {
      const res = await compile(
        entry,
        { emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );

      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('rejects unsupported source extensions', async () => {
    const { entry, cleanup } = writeTempSource('foo', ['main:', '    ret', ''].join('\n'));

    try {
      const res = await compile(
        entry,
        { emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );

      expect(res.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('Unsupported source file extension'),
        }),
      );
    } finally {
      cleanup();
    }
  });
});
