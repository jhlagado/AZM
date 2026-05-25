import { describe, expect, it } from 'vitest';

import { compileNext, parseNextSourceItems } from '../../src/core/compile.js';
import { createSourceFile } from '../../src/source/source-file.js';
import { scanLogicalLines } from '../../src/source/logical-lines.js';

function parsedLabelNames(source: string): string[] {
  const sourceFile = createSourceFile('/entry.asm', source);
  const { items } = parseNextSourceItems(scanLogicalLines(sourceFile));
  return items.flatMap((item) => (item.kind === 'label' ? [item.name] : []));
}

function compileBoundarySource(source: string) {
  return compileNext(source, { entryName: '/entry.asm' });
}

describe('.asm source boundary', () => {
  it('treats unknown assembler statements as unsupported source lines', () => {
    const source = ['main:', '  frobnicate A,B', '  ret', ''].join('\n');
    const res = compileBoundarySource(source);

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_PARSE',
        message: expect.stringContaining('unsupported source line: frobnicate A,B'),
      }),
    );
  });

  it('recovers labels after an unsupported assembler statement', () => {
    const source = [
      'unknown_directive $0000',
      'BAD_LABEL:',
      '  .db $99',
      'GOOD_LABEL:',
      '  .db $42',
      '',
    ].join('\n');
    const res = compileBoundarySource(source);

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('unsupported source line: unknown_directive $0000'),
      }),
    );
    expect(parsedLabelNames(source)).toEqual(['BAD_LABEL', 'GOOD_LABEL']);
  });

  it('allows AZM layout metadata without diagnostics', () => {
    const res = compileBoundarySource(
      [
        'Sprite .type',
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

  it('rejects retired colon-style layout declarations', () => {
    const res = compileBoundarySource(['Sprite .type', 'x: byte', '.endtype', ''].join('\n'));

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('invalid .type field declaration'),
      }),
    );
  });

  it('treats bare type declarations as unsupported assembler text', () => {
    const res = compileBoundarySource(['type Sprite', 'main:', '  ret', ''].join('\n'));

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('unsupported source line: type Sprite'),
      }),
    );
  });

  it('allows label-based layout-cast address expressions without diagnostics', () => {
    const res = compileBoundarySource(
      [
        'Sprite .type',
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

  it('treats unsupported control-like text as ordinary unsupported assembler syntax', () => {
    const res = compileBoundarySource(['WARN_CONTROL:', '  branch_when_ready z', '  ret', ''].join('\n'));

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('unsupported source line: branch_when_ready z'),
      }),
    );
  });
});
