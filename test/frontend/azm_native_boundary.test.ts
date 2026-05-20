import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { DiagnosticIds, type Diagnostic } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { parseModuleFile } from '../../src/frontend/parser.js';

function writeTempSource(ext: string, source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'azm-native-boundary-'));
  const entry = join(dir, `entry.${ext}`);
  writeFileSync(entry, source, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function azm700Diagnostics(diagnostics: Awaited<ReturnType<typeof compile>>['diagnostics']) {
  return diagnostics.filter((d) => d.id === DiagnosticIds.AzmRemovedZaxConstruct);
}

function parsedLabelNames(path: string, source: string): string[] {
  const diagnostics: Diagnostic[] = [];
  const file = parseModuleFile(path, source, diagnostics);
  return file.items.flatMap((item) => (item.kind === 'AsmLabel' ? [item.name] : []));
}

describe('AZM native source boundary', () => {
  const rejectedAzmSources = [
    {
      name: 'function declaration',
      source: ['func main()', '  ret', 'end', ''].join('\n'),
      message: 'Function declarations are not supported in AZM-native source',
    },
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
      name: 'typed var storage block',
      source: ['var', '  count: byte', 'end', ''].join('\n'),
      message: 'Typed storage blocks are not supported in AZM-native source',
    },
    {
      name: 'typed extern func',
      source: ['extern func PrintChar(a: byte)', 'end', ''].join('\n'),
      message: 'Typed extern declarations are not supported in AZM-native source',
    },
    {
      name: 'ZAX import path',
      source: ['import "lib.azm"', 'main:', '  ret', ''].join('\n'),
      message: 'ZAX import modules are not supported in AZM-native source',
    },
    {
      name: 'ZAX import module id',
      source: ['import core', 'main:', '  ret', ''].join('\n'),
      message: 'ZAX import modules are not supported in AZM-native source',
    },
    {
      name: 'ZAX export modifier',
      source: ['export const VALUE = 1', 'main:', '  ret', ''].join('\n'),
      message: 'Export declarations are not supported in AZM-native source',
    },
    {
      name: 'exported op block',
      source: ['export op clear_a()', '  xor a', 'end', 'main:', '  ret', ''].join('\n'),
      message: 'Export declarations are not supported in AZM-native source',
    },
    {
      name: 'named section block',
      source: ['section code main at $0000', '  ret', 'end', ''].join('\n'),
      message: 'Named section blocks are not supported in AZM-native source',
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
          id: DiagnosticIds.AzmRemovedZaxConstruct,
          message: expect.stringContaining(message),
        }),
      );
    } finally {
      cleanup();
    }
  });

  it('does not leak rejected function bodies into native AZM output', async () => {
    const source = ['func main()', 'BAD_LABEL:', '  db $99', 'end', 'GOOD_LABEL:', '  db $42', ''].join('\n');
    const { entry, cleanup } = writeTempSource(
      'azm',
      source,
    );

    try {
      const res = await compile(
        entry,
        { emitListing: false, emitD8m: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          id: DiagnosticIds.AzmRemovedZaxConstruct,
          message: expect.stringContaining('Function declarations'),
        }),
      );
      expect(parsedLabelNames(entry, source)).toEqual(['GOOD_LABEL']);
    } finally {
      cleanup();
    }
  });

  it('does not leak rejected named section bodies into native AZM output', async () => {
    const source = ['section code text at $0000', 'BAD_LABEL:', '  db $99', 'end', 'GOOD_LABEL:', '  db $42', ''].join('\n');
    const { entry, cleanup } = writeTempSource(
      'azm',
      source,
    );

    try {
      const res = await compile(
        entry,
        { emitListing: false, emitD8m: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          id: DiagnosticIds.AzmRemovedZaxConstruct,
          message: expect.stringContaining('Named section blocks'),
        }),
      );
      expect(parsedLabelNames(entry, source)).toEqual(['GOOD_LABEL']);
    } finally {
      cleanup();
    }
  });

  it('allows AZM layout metadata without removed-ZAX diagnostics', async () => {
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
      expect(azm700Diagnostics(res.diagnostics)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('allows label-based layout-cast address expressions without removed-ZAX diagnostics', async () => {
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
      expect(azm700Diagnostics(res.diagnostics)).toEqual([]);
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
          id: DiagnosticIds.AzmRemovedZaxConstruct,
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
          id: DiagnosticIds.AzmRemovedZaxConstruct,
          message: expect.stringContaining('Structured control'),
        }),
      );
    } finally {
      cleanup();
    }
  });

  it.each([
    {
      name: 'if/end',
      source: ['WARN_IF:', '  if z', '    nop', '  end', '  ret', ''].join('\n'),
    },
    {
      name: 'while/end',
      source: ['WARN_WHILE:', '  while nz', '    nop', '  end', '  ret', ''].join('\n'),
    },
    {
      name: 'repeat/until',
      source: ['WARN_REPEAT:', '  repeat', '    nop', '  until z', '  ret', ''].join('\n'),
    },
    {
      name: 'select/case/end',
      source: ['WARN_SELECT:', '  select a', '  case 1', '    nop', '  end', '  ret', ''].join('\n'),
    },
  ])('rejects structured control form $name in AZM-native source', async ({ source }) => {
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
          id: DiagnosticIds.AzmRemovedZaxConstruct,
          message: expect.stringContaining('Structured control'),
        }),
      );
    } finally {
      cleanup();
    }
  });
});
