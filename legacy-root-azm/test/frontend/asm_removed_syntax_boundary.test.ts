import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseSourceFile } from '../../src/frontend/parser.js';
import { compileTempSource } from '../helpers/temp_source.js';

async function compileBoundarySource(ext: string, source: string) {
  return compileTempSource('asm-boundary-', ext, source, {
    emitBin: false,
    emitHex: false,
    emitD8m: false,
    emitListing: false,
  });
}

function parsedLabelNames(path: string, source: string): string[] {
  const diagnostics: Diagnostic[] = [];
  const file = parseSourceFile(path, source, diagnostics);
  return file.items.flatMap((item) => (item.kind === 'AsmLabel' ? [item.name] : []));
}

describe('.asm source boundary', () => {
  it('treats unknown assembler statements as ordinary unsupported syntax', async () => {
    const source = ['main:', '  frobnicate A,B', '  ret', ''].join('\n');
    const res = await compileBoundarySource('asm', source);

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Unsupported instruction: frobnicate'),
      }),
    );
  });

  it('recovers labels after an unsupported assembler statement', async () => {
    const source = [
      'unknown_directive $0000',
      'BAD_LABEL:',
      '  db $99',
      'GOOD_LABEL:',
      '  db $42',
      '',
    ].join('\n');
    const res = await compileBoundarySource('asm', source);

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Unsupported instruction: unknown_directive'),
      }),
    );
    expect(parsedLabelNames('/entry.asm', source)).toEqual(['BAD_LABEL', 'GOOD_LABEL']);
  });

  it('allows AZM layout metadata without diagnostics', async () => {
    const res = await compileBoundarySource(
      'asm',
      [
        '.type Sprite',
        'x     .byte',
        'y     .byte',
        'flags .byte',
        '.endtype',
        '',
        'SpriteSize .equ sizeof(Sprite)',
        'FlagsOffset .equ offset(Sprite, flags)',
        '',
      ].join('\n'),
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('rejects retired colon-style layout declarations', async () => {
    const res = await compileBoundarySource(
      'asm',
      ['.type Sprite', 'x: byte', '.endtype', ''].join('\n'),
    );

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Invalid record field declaration line "x: byte"'),
      }),
    );
  });

  it('treats bare type declarations as unsupported assembler text', async () => {
    const res = await compileBoundarySource(
      'asm',
      ['type Sprite', 'main:', '  ret', ''].join('\n'),
    );

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Unsupported instruction: type'),
      }),
    );
  });

  it('allows label-based layout-cast address expressions without diagnostics', async () => {
    const res = await compileBoundarySource(
      'asm',
      [
        '.type Sprite',
        'x     .byte',
        'y     .byte',
        'flags .byte',
        '.endtype',
        '',
        '.org $2000',
        'SPRITES:',
        '  .ds Sprite[16]',
        '',
        '.org $0000',
        'main:',
        '  ld a, (<Sprite[16]>SPRITES[0].flags)',
        '  ret',
        '',
      ].join('\n'),
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('treats unsupported control-like text as ordinary unsupported assembler syntax', async () => {
    const res = await compileBoundarySource(
      'asm',
      ['WARN_CONTROL:', '  branch_when_ready z', '  ret', ''].join('\n'),
    );

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Unsupported instruction: branch_when_ready'),
      }),
    );
  });
});
