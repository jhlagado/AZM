import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { inferSourceMode } from '../../src/frontend/sourceMode.js';
import { defaultFormatWriters } from '../../src/formats/index.js';

function writeTempSource(ext: string, source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'azm-removals-'));
  const entry = join(dir, `entry.${ext}`);
  writeFileSync(entry, source, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('AZM source mode ZAX removals', () => {
  it('infers .azm as AZM-native source mode', () => {
    expect(inferSourceMode('/tmp/program.azm')).toBe('azm');
    expect(inferSourceMode('/tmp/program.z80')).toBe('asm80');
    expect(inferSourceMode('/tmp/program.zax')).toBeUndefined();
  });

  it('treats ZAX function syntax as unsupported native assembly', async () => {
    const { entry, cleanup } = writeTempSource(
      'azm',
      ['func main()', '    ret', 'end', ''].join('\n'),
    );

    try {
      const res = await compile(
        entry,
        { emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );

      expect(res.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('Unsupported operand: main()'),
          line: 1,
          column: 1,
        }),
      );
    } finally {
      cleanup();
    }
  });

  it('does not reject layout constants in AZM-native source', async () => {
    const { entry, cleanup } = writeTempSource(
      'azm',
      [
        'type Sprite',
        '    x: byte',
        '    y: byte',
        '    flags: byte',
        'end',
        'const SpriteSize = sizeof(Sprite)',
        'const FlagsOffset = offset(Sprite, flags)',
        '',
      ].join('\n'),
    );

    try {
      const res = await compile(
        entry,
        { emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );

      expect(res.diagnostics).not.toContainEqual(
        expect.objectContaining({
          id: DiagnosticIds.AzmRemovedZaxConstruct,
        }),
      );
      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('rejects .zax as an unsupported extension', async () => {
    const { entry, cleanup } = writeTempSource(
      'zax',
      ['func main()', '    ret', 'end', ''].join('\n'),
    );

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
