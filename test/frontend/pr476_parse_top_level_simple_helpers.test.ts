import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import {
  parseAlignDirectiveDecl,
  parseBinDecl,
  parseConstDecl,
  parseHexDecl,
  parseImportDecl,
  parseSectionDirectiveDecl,
} from '../../src/frontend/parseTopLevelSimple.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { parseProgram } from '../../src/frontend/parser.js';

describe('PR476 simple top-level parser extraction', () => {
  const file = makeSourceFile('pr476_parse_top_level_simple_helpers.zax', '');
  const zeroSpan = span(file, 0, 0);
  const ctx = {
    diagnostics: [] as Diagnostic[],
    modulePath: file.path,
    lineNo: 1,
    text: '',
    span: zeroSpan,
    isReservedTopLevelName: () => false,
  };

  it('keeps simple helper parsing intact', () => {
    expect(parseImportDecl('"mod.zax"', { ...ctx, text: 'import "mod.zax"' })).toMatchObject({
      kind: 'Import',
      specifier: 'mod.zax',
      form: 'path',
    });
    const sectionDecl = parseSectionDirectiveDecl('section data at $1000', 'data at $1000', {
      ...ctx,
      text: 'section data at $1000',
    });
    expect(sectionDecl).toBeUndefined();
    expect(ctx.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message:
          'Legacy active-counter section directive "section data at ..." is removed; use a named section like "section data <name> at ..." instead.',
      }),
    );
    expect(
      parseAlignDirectiveDecl('align $10', '$10', { ...ctx, text: 'align $10' }),
    ).toMatchObject({
      kind: 'Align',
      value: { kind: 'ImmLiteral', value: 0x10 },
    });
    expect(
      parseConstDecl('FOO = 42', true, { ...ctx, text: 'export const FOO = 42' }),
    ).toMatchObject({
      kind: 'ConstDecl',
      name: 'FOO',
      exported: true,
      value: { kind: 'ImmLiteral', value: 42 },
    });
    expect(
      parseBinDecl('blob in data from "blob.bin"', {
        ...ctx,
        text: 'bin blob in data from "blob.bin"',
      }),
    ).toMatchObject({
      kind: 'BinDecl',
      name: 'blob',
      section: 'data',
      fromPath: 'blob.bin',
    });
    expect(
      parseHexDecl('blob from "blob.hex"', { ...ctx, text: 'hex blob from "blob.hex"' }),
    ).toMatchObject({
      kind: 'HexDecl',
      name: 'blob',
      fromPath: 'blob.hex',
    });
  });

  it('preserves simple top-level parsing through parser.ts', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      file.path,
      'import "mod.zax"\nexport const FOO = 1\nsection data at $1000\nalign $10\n',
      diagnostics,
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message:
          'Legacy active-counter section directive "section data at ..." is removed; use a named section like "section data <name> at ..." instead.',
      }),
    ]);
    expect(program.files[0]?.items).toHaveLength(3);
    expect(program.files[0]?.items[0]).toMatchObject({ kind: 'Import', specifier: 'mod.zax' });
    expect(program.files[0]?.items[1]).toMatchObject({
      kind: 'ConstDecl',
      name: 'FOO',
      exported: true,
    });
    expect(program.files[0]?.items[2]).toMatchObject({ kind: 'Align' });
  });
});
