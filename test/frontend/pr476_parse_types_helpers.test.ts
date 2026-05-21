import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseTypeDecl, parseUnionDecl } from '../../src/frontend/parseTypes.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { createRawLineGetter, expectNoDiagnostics, parseSingleFileProgram } from '../helpers/index.js';

describe('PR476 type and union parser extraction', () => {
  it('keeps type helper parsing intact', () => {
    const sourceText = ['.type Pair', 'left .byte', 'right .word', '.endtype', ''].join('\n');
    const file = makeSourceFile('pr476_parse_types_helpers.asm', sourceText);
    const diagnostics: Diagnostic[] = [];

    const parsed = parseTypeDecl('Pair', '.type Pair', span(file, 0, 10), 1, 0, {
      file,
      lineCount: file.lineStarts.length,
      diagnostics,
      sourcePath: file.path,
      getRawLine: createRawLineGetter(file),
      isReservedTopLevelName: () => false,
    });

    expectNoDiagnostics(diagnostics);
    expect(parsed?.nextIndex).toBe(4);
    expect(parsed?.node).toMatchObject({
      kind: 'TypeDecl',
      name: 'Pair',
      typeExpr: {
        kind: 'RecordType',
        fields: [
          { name: 'left', typeExpr: { kind: 'TypeName', name: 'byte' } },
          { name: 'right', typeExpr: { kind: 'TypeName', name: 'word' } },
        ],
      },
    });
  });

  it('keeps union helper parsing intact', () => {
    const sourceText = ['.union Either', 'left .byte', 'right .word', '.endunion', ''].join('\n');
    const file = makeSourceFile('pr476_parse_types_helpers.asm', sourceText);
    const diagnostics: Diagnostic[] = [];

    const parsed = parseUnionDecl('Either', '.union Either', span(file, 0, 13), 1, 0, {
      file,
      lineCount: file.lineStarts.length,
      diagnostics,
      sourcePath: file.path,
      getRawLine: createRawLineGetter(file),
      isReservedTopLevelName: () => false,
    });

    expectNoDiagnostics(diagnostics);
    expect(parsed?.nextIndex).toBe(4);
    expect(parsed?.node).toMatchObject({
      kind: 'UnionDecl',
      name: 'Either',
      fields: [
        { name: 'left', typeExpr: { kind: 'TypeName', name: 'byte' } },
        { name: 'right', typeExpr: { kind: 'TypeName', name: 'word' } },
      ],
    });
  });

  it('preserves type and union block parsing through parser.ts', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseSingleFileProgram(
      'pr476_parse_types_helpers.asm',
      [
        '.type Pair',
        'left .byte',
        'right .byte',
        '.endtype',
        '.union Either',
        'left .byte',
        'right .word',
        '.endunion',
        '',
      ].join('\n'),
      diagnostics,
    );

    expectNoDiagnostics(diagnostics);
    expect(program.files[0]?.items[0]).toMatchObject({
      kind: 'TypeDecl',
      name: 'Pair',
      typeExpr: {
        kind: 'RecordType',
        fields: [{ name: 'left' }, { name: 'right' }],
      },
    });
    expect(program.files[0]?.items[1]).toMatchObject({
      kind: 'UnionDecl',
      name: 'Either',
      fields: [{ name: 'left' }, { name: 'right' }],
    });
  });

  it('rejects single-line type aliases in source syntax', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseSingleFileProgram(
      'pr476_parse_types_helpers.asm',
      ['.type Pair byte[2]', 'main:', '  ret', ''].join('\n'),
      diagnostics,
    );

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Invalid type declaration line ".type Pair byte[2]": expected <name>'),
      }),
    );
    expect(program.files[0]?.items.map((item) => item.kind)).toEqual(['AsmLabel', 'AsmInstruction']);
  });
});
