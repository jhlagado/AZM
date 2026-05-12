import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseDataBlock } from '../../src/frontend/parseData.js';
import { parseProgram } from '../../src/frontend/parser.js';
import { makeSourceFile } from '../../src/frontend/source.js';

describe('PR476 data parser extraction', () => {
  it('keeps data block parsing intact', () => {
    const sourceText = [
      'data',
      'greeting: byte[] = "hi"',
      'coords: word[2] = [1, 2]',
      'func main()',
      'end',
      '',
    ].join('\n');
    const file = makeSourceFile('pr476_parse_data_helpers.zax', sourceText);
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

    const parsed = parseDataBlock(0, {
      file,
      lineCount: file.lineStarts.length,
      diagnostics,
      modulePath: file.path,
      getRawLine,
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message:
          'Legacy top-level "data ... end" blocks are removed; use direct declarations inside named data sections.',
      }),
    ]);
    expect(parsed.nextIndex).toBe(3);
    expect(parsed.node).toMatchObject({
      kind: 'DataBlock',
      decls: [
        { name: 'greeting', initializer: { kind: 'InitString', value: 'hi' } },
        {
          name: 'coords',
          initializer: {
            kind: 'InitArray',
            elements: [
              { kind: 'ImmLiteral', value: 1 },
              { kind: 'ImmLiteral', value: 2 },
            ],
          },
        },
      ],
    });
  });

  it('preserves data parsing through parser.ts', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'pr476_parse_data_helpers.zax',
      [
        'data',
        'greeting: byte[] = "hi"',
        'coords: word[2] = [1, 2]',
        'func main()',
        'end',
        '',
      ].join('\n'),
      diagnostics,
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message:
          'Legacy top-level "data ... end" blocks are removed; use direct declarations inside named data sections.',
      }),
    ]);
    expect(program.files[0]?.items).toHaveLength(1);
    expect(program.files[0]?.items[0]).toMatchObject({ kind: 'FuncDecl', name: 'main' });
  });
});
