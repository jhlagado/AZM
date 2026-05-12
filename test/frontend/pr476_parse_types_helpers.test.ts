import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseTypeDecl, parseUnionDecl } from '../../src/frontend/parseTypes.js';
import { parseProgram } from '../../src/frontend/parser.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { expectNoDiagnostics } from '../helpers/diagnostics.js';

describe('PR476 type and union parser extraction', () => {
  it('keeps type helper parsing intact', () => {
    const sourceText = ['type Pair', 'left: byte', 'right: word', 'end', ''].join('\n');
    const file = makeSourceFile('pr476_parse_types_helpers.zax', sourceText);
    const diagnostics: Diagnostic[] = [];

    function getRawLine(lineIndex: number): {
      raw: string;
      startOffset: number;
      endOffset: number;
      lineNo: number;
      filePath: string;
    } {
      const startOffset = file.lineStarts[lineIndex] ?? 0;
      const nextStart = file.lineStarts[lineIndex + 1] ?? file.text.length;
      let rawWithEol = file.text.slice(startOffset, nextStart);
      if (rawWithEol.endsWith('\n')) rawWithEol = rawWithEol.slice(0, -1);
      if (rawWithEol.endsWith('\r')) rawWithEol = rawWithEol.slice(0, -1);
      return {
        raw: rawWithEol,
        startOffset,
        endOffset: startOffset + rawWithEol.length,
        lineNo: lineIndex + 1,
        filePath: file.path,
      };
    }

    const parsed = parseTypeDecl('Pair', 'type Pair', span(file, 0, 9), 1, 0, {
      file,
      lineCount: file.lineStarts.length,
      diagnostics,
      modulePath: file.path,
      getRawLine,
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
    const sourceText = ['union Either', 'left: byte', 'right: word', 'end', ''].join('\n');
    const file = makeSourceFile('pr476_parse_types_helpers.zax', sourceText);
    const diagnostics: Diagnostic[] = [];

    function getRawLine(lineIndex: number): {
      raw: string;
      startOffset: number;
      endOffset: number;
      lineNo: number;
      filePath: string;
    } {
      const startOffset = file.lineStarts[lineIndex] ?? 0;
      const nextStart = file.lineStarts[lineIndex + 1] ?? file.text.length;
      let rawWithEol = file.text.slice(startOffset, nextStart);
      if (rawWithEol.endsWith('\n')) rawWithEol = rawWithEol.slice(0, -1);
      if (rawWithEol.endsWith('\r')) rawWithEol = rawWithEol.slice(0, -1);
      return {
        raw: rawWithEol,
        startOffset,
        endOffset: startOffset + rawWithEol.length,
        lineNo: lineIndex + 1,
        filePath: file.path,
      };
    }

    const parsed = parseUnionDecl('Either', 'union Either', span(file, 0, 12), 1, 0, {
      file,
      lineCount: file.lineStarts.length,
      diagnostics,
      modulePath: file.path,
      getRawLine,
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

  it('preserves type and union parsing through parser.ts', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'pr476_parse_types_helpers.zax',
      ['type Pair byte[2]', 'union Either', 'left: byte', 'right: word', 'end', ''].join('\n'),
      diagnostics,
    );

    expectNoDiagnostics(diagnostics);
    expect(program.files[0]?.items[0]).toMatchObject({
      kind: 'TypeDecl',
      name: 'Pair',
      typeExpr: { kind: 'ArrayType', length: 2 },
    });
    expect(program.files[0]?.items[1]).toMatchObject({
      kind: 'UnionDecl',
      name: 'Either',
      fields: [{ name: 'left' }, { name: 'right' }],
    });
  });
});
