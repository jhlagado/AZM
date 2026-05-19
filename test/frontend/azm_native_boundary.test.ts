import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';

function writeTempSource(ext: string, source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'azm-native-boundary-'));
  const entry = join(dir, `entry.${ext}`);
  writeFileSync(entry, source, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function azm700Warnings(diagnostics: Awaited<ReturnType<typeof compile>>['diagnostics']) {
  return diagnostics.filter((d) => d.id === DiagnosticIds.AzmDeprecatedZaxConstruct);
}

describe('AZM native source boundary', () => {
  it('allows AZM layout metadata without deprecation warnings', async () => {
    const { entry, cleanup } = writeTempSource(
      'azm',
      [
        'type Sprite',
        '    x: byte',
        '    y: byte',
        '    flags: byte',
        'end',
        '',
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
      expect(azm700Warnings(res.diagnostics)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('allows label-based layout-cast address expressions without deprecation warnings', async () => {
    const { entry, cleanup } = writeTempSource(
      'zax',
      [
        'type Sprite',
        '    x: byte',
        '    y: byte',
        '    flags: byte',
        'end',
        '',
        'section data sprites at $2000',
        '  SPRITES:',
        '  ds sizeof(Sprite[16])',
        'end',
        '',
        'section code text at $0000',
        'export func main()',
        '  ld a, (<Sprite>SPRITES[0].flags)',
        '  ret',
        'end',
        'end',
        '',
      ].join('\n'),
    );

    try {
      const res = await compile(
        entry,
        { emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(azm700Warnings(res.diagnostics)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('warns for typed assignment in AZM-native source', async () => {
    const { entry, cleanup } = writeTempSource(
      'azm',
      ['WARN_ASSIGN:', '  hl := a', '  ret', ''].join('\n'),
    );

    try {
      const res = await compile(
        entry,
        { emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(azm700Warnings(res.diagnostics)).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('typed assignment'),
        }),
      );
    } finally {
      cleanup();
    }
  });

  it('warns for structured control in AZM-native source', async () => {
    const { entry, cleanup } = writeTempSource(
      'azm',
      ['WARN_IF:', '  if z', '    nop', '  end', '  ret', ''].join('\n'),
    );

    try {
      const res = await compile(
        entry,
        { emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(azm700Warnings(res.diagnostics)).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('structured control flow'),
        }),
      );
    } finally {
      cleanup();
    }
  });
});
