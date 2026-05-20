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
  const rejectedAzmSources = [
    {
      name: 'typed assignment',
      source: ['main:', '  A := count', '  ret', 'count: .db 1', ''].join('\n'),
      message: 'Typed assignment is not supported in AZM-native source',
    },
    {
      name: 'structured if',
      source: ['main:', '  if z', '    ret', '  end', ''].join('\n'),
      message: 'Structured control is not supported in AZM-native source',
    },
    {
      name: 'typed data block',
      source: ['data sprites: byte[4]', 'end', ''].join('\n'),
      message: 'Typed data blocks are not supported in AZM-native source',
    },
    {
      name: 'typed globals block',
      source: ['globals', '  count: byte', 'end', ''].join('\n'),
      message: 'Typed storage blocks are not supported in AZM-native source',
    },
    {
      name: 'typed extern func',
      source: ['extern func PrintChar(a: byte)', 'end', ''].join('\n'),
      message: 'Typed extern declarations are not supported in AZM-native source',
    },
    {
      name: 'ZAX import module',
      source: ['import "lib.azm"', 'main:', '  ret', ''].join('\n'),
      message: 'ZAX import modules are not supported in AZM-native source',
    },
  ];

  it.each(rejectedAzmSources)('rejects $name', async ({ source, message }) => {
    const { entry, cleanup } = writeTempSource('azm', source);

    try {
      const res = await compile(
        entry,
        { emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          id: DiagnosticIds.AzmDeprecatedZaxConstruct,
          message: expect.stringContaining(message),
        }),
      );
    } finally {
      cleanup();
    }
  });

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

  it('rejects typed assignment in AZM-native source', async () => {
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
      expect(res.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          id: DiagnosticIds.AzmDeprecatedZaxConstruct,
          message: expect.stringContaining('Typed assignment'),
        }),
      );
    } finally {
      cleanup();
    }
  });

  it('rejects structured control in AZM-native source', async () => {
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
      expect(res.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          id: DiagnosticIds.AzmDeprecatedZaxConstruct,
          message: expect.stringContaining('Structured control'),
        }),
      );
    } finally {
      cleanup();
    }
  });
});
