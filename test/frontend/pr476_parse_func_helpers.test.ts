import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseTopLevelFuncDecl } from '../../src/frontend/parseFunc.js';
import { parseParamsFromText } from '../../src/frontend/parseParams.js';
import { parseProgram } from '../../src/frontend/parser.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { expectNoDiagnostics } from '../helpers/diagnostics.js';

describe('PR476 func parser extraction', () => {
  it('keeps top-level func parsing intact', () => {
    const sourceText = [
      'func add(lhs: word, rhs: word): HL',
      'var',
      'temp: word = $1234',
      'end',
      'ld hl, lhs',
      'add hl, rhs',
      'end',
      'const DONE = 1',
      '',
    ].join('\n');
    const file = makeSourceFile('pr476_parse_func_helpers.zax', sourceText);
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

    const parsed = parseTopLevelFuncDecl(
      'add(lhs: word, rhs: word): HL',
      'func add(lhs: word, rhs: word): HL',
      span(file, 0, 31),
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
        parseParamsFromText,
      },
    );

    expectNoDiagnostics(diagnostics);
    expect(parsed.nextIndex).toBe(7);
    expect(parsed.node).toMatchObject({
      kind: 'FuncDecl',
      name: 'add',
      returnRegs: ['HL'],
      params: [{ name: 'lhs' }, { name: 'rhs' }],
      locals: {
        kind: 'VarBlock',
        decls: [{ name: 'temp' }],
      },
      asm: { kind: 'AsmBlock' },
    });
  });

  it('preserves func parsing through parser.ts', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'pr476_parse_func_helpers.zax',
      [
        'func add(lhs: word, rhs: word): HL',
        'var',
        'temp: word = $1234',
        'end',
        'ld hl, lhs',
        'add hl, rhs',
        'end',
        '',
      ].join('\n'),
      diagnostics,
    );

    expectNoDiagnostics(diagnostics);
    expect(program.files[0]?.items[0]).toMatchObject({
      kind: 'FuncDecl',
      name: 'add',
      returnRegs: ['HL'],
      params: [{ name: 'lhs' }, { name: 'rhs' }],
      locals: { kind: 'VarBlock', decls: [{ name: 'temp' }] },
    });
  });
});
