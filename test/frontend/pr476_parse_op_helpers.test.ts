import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseTopLevelOpDecl } from '../../src/frontend/parseOp.js';
import { parseOpParamsFromText } from '../../src/frontend/parseParams.js';
import { parseProgram } from '../../src/frontend/parser.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { expectNoDiagnostics } from '../helpers/diagnostics.js';

describe('PR476 op parser extraction', () => {
  it('keeps top-level op parsing intact', () => {
    const sourceText = [
      'op add(lhs: word, rhs: word)',
      'ld hl, lhs',
      'add hl, rhs',
      'end',
      'const DONE = 1',
      '',
    ].join('\n');
    const file = makeSourceFile('pr476_parse_op_helpers.zax', sourceText);
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

    const parsed = parseTopLevelOpDecl(
      'add(lhs: word, rhs: word)',
      'op add(lhs: word, rhs: word)',
      span(file, 0, 27),
      1,
      0,
      false,
      {
        file,
        lineCount: file.lineStarts.length,
        diagnostics,
        modulePath: file.path,
        getRawLine,
        isReservedTopLevelName: () => false,
        parseOpParamsFromText,
      },
    );

    expectNoDiagnostics(diagnostics);
    expect(parsed?.nextIndex).toBe(4);
    expect(parsed?.node).toMatchObject({
      kind: 'OpDecl',
      name: 'add',
      params: [{ name: 'lhs' }, { name: 'rhs' }],
      body: { kind: 'AsmBlock' },
    });
  });

  it('preserves op parsing through parser.ts', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'pr476_parse_op_helpers.zax',
      ['op add(lhs: word, rhs: word)', 'ld hl, lhs', 'add hl, rhs', 'end', ''].join('\n'),
      diagnostics,
    );

    expectNoDiagnostics(diagnostics);
    expect(program.files[0]?.items[0]).toMatchObject({
      kind: 'OpDecl',
      name: 'add',
      params: [{ name: 'lhs' }, { name: 'rhs' }],
    });
  });
});
