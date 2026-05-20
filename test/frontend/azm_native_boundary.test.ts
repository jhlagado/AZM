import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { parseModuleFile } from '../../src/frontend/parser.js';

function writeTempSource(ext: string, source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'azm-native-boundary-'));
  const entry = join(dir, `entry.${ext}`);
  writeFileSync(entry, source, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function parsedLabelNames(path: string, source: string): string[] {
  const diagnostics: Diagnostic[] = [];
  const file = parseModuleFile(path, source, diagnostics, undefined, undefined, true);
  return file.items.flatMap((item) => (item.kind === 'AsmLabel' ? [item.name] : []));
}

describe('AZM native source boundary', () => {
  it('treats unknown native statements as ordinary unsupported syntax', async () => {
    const source = ['main:', '  frobnicate A,B', '  ret', ''].join('\n');
    const { entry, cleanup } = writeTempSource('asm', source);

    try {
      const res = await compile(
        entry,
        { emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('Unsupported instruction: frobnicate'),
        }),
      );
    } finally {
      cleanup();
    }
  });

  it('recovers labels after an unsupported native statement', async () => {
    const source = ['unknown_directive $0000', 'BAD_LABEL:', '  db $99', 'GOOD_LABEL:', '  db $42', ''].join('\n');
    const { entry, cleanup } = writeTempSource('asm', source);

    try {
      const res = await compile(
        entry,
        { emitListing: false, emitD8m: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('Unsupported instruction: unknown_directive'),
        }),
      );
      expect(parsedLabelNames(entry, source)).toEqual(['BAD_LABEL', 'GOOD_LABEL']);
    } finally {
      cleanup();
    }
  });

  it('allows AZM layout metadata without diagnostics', async () => {
    const { entry, cleanup } = writeTempSource('asm',
      [
        'type Sprite',
        '    x: byte',
        '    y: byte',
        '    flags: byte',
        'end',
        '',
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

  it('allows label-based layout-cast address expressions without diagnostics', async () => {
    const { entry, cleanup } = writeTempSource('asm',
      [
        'type Sprite',
        '    x: byte',
        '    y: byte',
        '    flags: byte',
        'end',
        '',
        '.org $2000',
        'SPRITES:',
        '  .ds sizeof(Sprite[16])',
        '',
        '.org $0000',
        'main:',
        '  ld a, (<Sprite[16]>SPRITES[0].flags)',
        '  ret',
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

  it('treats unsupported control-like text as ordinary unsupported AZM-native syntax', async () => {
    const { entry, cleanup } = writeTempSource('asm',
      ['WARN_CONTROL:', '  branch_when_ready z', '  ret', ''].join('\n'),
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
          message: expect.stringContaining('Unsupported instruction: branch_when_ready'),
        }),
      );
    } finally {
      cleanup();
    }
  });

});
