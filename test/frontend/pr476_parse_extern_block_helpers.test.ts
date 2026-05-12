import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseTopLevelExternDecl } from '../../src/frontend/parseExternBlock.js';
import { parseParamsFromText } from '../../src/frontend/parseParams.js';
import { parseProgram } from '../../src/frontend/parser.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { expectNoDiagnostics } from '../helpers/diagnostics.js';

describe('PR476 extern block parser extraction', () => {
  it('keeps extern block parsing intact', () => {
    const sourceText = [
      'extern Math',
      'func add(lhs: word, rhs: word): HL at $1234',
      'end',
      'func main()',
      'end',
      '',
    ].join('\n');
    const file = makeSourceFile('pr476_parse_extern_block_helpers.zax', sourceText);
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

    const parsed = parseTopLevelExternDecl('Math', 'extern Math', span(file, 0, 11), 1, 0, {
      file,
      lineCount: file.lineStarts.length,
      diagnostics,
      modulePath: file.path,
      getRawLine,
      isReservedTopLevelName: () => false,
      parseParamsFromText,
    });

    expectNoDiagnostics(diagnostics);
    expect(parsed.nextIndex).toBe(3);
    expect(parsed.node).toMatchObject({
      kind: 'ExternDecl',
      base: 'Math',
      funcs: [{ name: 'add', returnRegs: ['HL'] }],
    });
  });

  it('preserves extern parsing through parser.ts', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'pr476_parse_extern_block_helpers.zax',
      [
        'extern Math',
        'func add(lhs: word, rhs: word): HL at $1234',
        'end',
        'extern func sub(lhs: word, rhs: word): HL at $2345',
        '',
      ].join('\n'),
      diagnostics,
    );

    expectNoDiagnostics(diagnostics);
    expect(program.files[0]?.items[0]).toMatchObject({
      kind: 'ExternDecl',
      base: 'Math',
      funcs: [{ name: 'add' }],
    });
    expect(program.files[0]?.items[1]).toMatchObject({
      kind: 'ExternDecl',
      funcs: [{ name: 'sub' }],
    });
  });
});
