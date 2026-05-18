import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { inferSourceMode } from '../../src/frontend/sourceMode.js';
import { defaultFormatWriters } from '../../src/formats/index.js';

function writeTempSource(ext: string, source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'azm-deprecations-'));
  const entry = join(dir, `entry.${ext}`);
  writeFileSync(entry, source, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('AZM source mode ZAX deprecations', () => {
  it('infers .azm as AZM-native source mode', () => {
    expect(inferSourceMode('/tmp/program.azm')).toBe('azm');
    expect(inferSourceMode('/tmp/program.zax')).toBe('zax');
    expect(inferSourceMode('/tmp/program.z80')).toBe('asm80');
  });

  it('warns when AZM-native source uses ZAX function syntax', async () => {
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
          id: DiagnosticIds.AzmDeprecatedZaxConstruct,
          severity: 'warning',
          message: expect.stringContaining('ZAX function declarations are deprecated in AZM'),
          line: 1,
          column: 1,
        }),
      );
    } finally {
      cleanup();
    }
  });

  it('does not warn for layout constants in AZM-native source', async () => {
    const { entry, cleanup } = writeTempSource(
      'azm',
      [
        'type Sprite',
        '    x: byte',
        '    y: byte',
        '    flags: byte',
        'end',
        'const SpriteSize = sizeof(Sprite)',
        'const FlagsOffset = offsetof(Sprite, flags)',
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
          id: DiagnosticIds.AzmDeprecatedZaxConstruct,
        }),
      );
      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('keeps .zax compatibility mode quiet for preserved ZAX syntax', async () => {
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

      expect(res.diagnostics).not.toContainEqual(
        expect.objectContaining({
          id: DiagnosticIds.AzmDeprecatedZaxConstruct,
        }),
      );
    } finally {
      cleanup();
    }
  });
});
