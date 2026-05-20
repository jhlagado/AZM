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

function parsedLabelNames(path: string, source: string): string[] {
  const diagnostics: Diagnostic[] = [];
  const file = parseModuleFile(path, source, diagnostics, undefined, undefined, true);
  return file.items.flatMap((item) => (item.kind === 'AsmLabel' ? [item.name] : []));
}

describe('AZM native source boundary', () => {
  const rejectedAzmSources = [
    {
      name: 'structured if',
      source: ['main:', '  if z', '    ret', '  end', ''].join('\n'),
      message: 'Unsupported instruction: if',
    },
    {
      name: 'old export modifier',
      source: ['export VALUE .equ 1', 'main:', '  ret', ''].join('\n'),
      message: 'Unsupported operand: VALUE .equ 1',
    },
    {
      name: 'exported op block',
      source: ['export op clear_a()', '  xor a', 'end', 'main:', '  ret', ''].join('\n'),
      message: 'Invalid op header line',
    },
  ];

  it.each(rejectedAzmSources)('rejects $name', async ({ source, message }) => {
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
          message: expect.stringContaining(message),
        }),
      );
    } finally {
      cleanup();
    }
  });

  it.each([
    {
      name: 'old typed assignment syntax',
      source: ['main:', '  A := count', '  ret', 'count: .db 1', ''].join('\n'),
      message: 'Unsupported operand: := count',
    },
    {
      name: 'old extern func syntax',
      source: ['extern func PrintChar(a: byte)', 'end', ''].join('\n'),
      message: 'Unsupported operand: func PrintChar(a: byte)',
    },
  ])('treats $name as ordinary unsupported native AZM syntax', async ({ source, message }) => {
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
          message: expect.stringContaining(message),
        }),
      );
    } finally {
      cleanup();
    }
  });

  it('treats old function syntax as ordinary unsupported native AZM syntax', async () => {
    const source = ['func main()', 'BAD_LABEL:', '  db $99', 'end', 'GOOD_LABEL:', '  db $42', ''].join('\n');
    const { entry, cleanup } = writeTempSource('asm',
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
          id: DiagnosticIds.ParseError,
          message: expect.stringContaining('Unsupported operand: main()'),
        }),
      );
      expect(parsedLabelNames(entry, source)).toEqual(['BAD_LABEL', 'GOOD_LABEL']);
    } finally {
      cleanup();
    }
  });

  it('treats old section syntax as unsupported native AZM syntax', async () => {
    const source = ['section code text at $0000', 'BAD_LABEL:', '  db $99', 'end', 'GOOD_LABEL:', '  db $42', ''].join('\n');
    const { entry, cleanup } = writeTempSource('asm',
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
          id: DiagnosticIds.ParseError,
          message: expect.stringContaining('Unsupported operand: code text at $0000'),
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

  it('rejects typed assignment in AZM-native source', async () => {
    const { entry, cleanup } = writeTempSource('asm',
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
          id: DiagnosticIds.ParseError,
          message: expect.stringContaining('Unsupported operand: := a'),
        }),
      );
    } finally {
      cleanup();
    }
  });

  it('treats structured control as ordinary unsupported AZM-native syntax', async () => {
    const { entry, cleanup } = writeTempSource('asm',
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
          message: expect.stringContaining('Unsupported instruction: if'),
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
      instruction: 'if',
    },
    {
      name: 'while/end',
      source: ['WARN_WHILE:', '  while nz', '    nop', '  end', '  ret', ''].join('\n'),
      instruction: 'while',
    },
    {
      name: 'repeat/until',
      source: ['WARN_REPEAT:', '  repeat', '    nop', '  until z', '  ret', ''].join('\n'),
      instruction: 'repeat',
    },
    {
      name: 'select/case/end',
      source: ['WARN_SELECT:', '  select a', '  case 1', '    nop', '  end', '  ret', ''].join('\n'),
      instruction: 'select',
    },
  ])('treats structured control form $name as ordinary unsupported AZM-native syntax', async ({ source, instruction }) => {
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
          message: expect.stringContaining(`Unsupported instruction: ${instruction}`),
        }),
      );
    } finally {
      cleanup();
    }
  });
});
