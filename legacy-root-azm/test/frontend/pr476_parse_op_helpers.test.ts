import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseTopLevelOpDecl } from '../../src/frontend/parseOp.js';
import { parseOpParamsFromText } from '../../src/frontend/parseParams.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import {
  createRawLineGetter,
  expectNoDiagnostics,
  parseSingleFileProgram,
} from '../helpers/index.js';

describe('PR476 op parser extraction', () => {
  it('keeps top-level op parsing intact', () => {
    const sourceText = [
      'op add(lhs word, rhs word)',
      'ld hl, lhs',
      'add hl, rhs',
      'end',
      'enum Done Yes',
      '',
    ].join('\n');
    const file = makeSourceFile('pr476_parse_op_helpers.asm', sourceText);
    const diagnostics: Diagnostic[] = [];

    const parsed = parseTopLevelOpDecl(
      'add(lhs word, rhs word)',
      'op add(lhs word, rhs word)',
      span(file, 0, 27),
      1,
      0,
      {
        file,
        lineCount: file.lineStarts.length,
        diagnostics,
        sourcePath: file.path,
        getRawLine: createRawLineGetter(file),
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
    const program = parseSingleFileProgram(
      'pr476_parse_op_helpers.asm',
      ['op add(lhs word, rhs word)', 'ld hl, lhs', 'add hl, rhs', 'end', ''].join('\n'),
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
