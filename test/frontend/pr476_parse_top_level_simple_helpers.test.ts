import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseAlignDirectiveDecl } from '../../src/frontend/parseTopLevelSimple.js';
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
    expect(
      parseAlignDirectiveDecl('align $10', '$10', { ...ctx, text: 'align $10' }),
    ).toMatchObject({
      kind: 'Align',
      value: { kind: 'ImmLiteral', value: 0x10 },
    });
  });

  it('preserves simple top-level parsing through parser.ts', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      file.path,
      'section data at $1000\nalign $10\n',
      diagnostics,
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'Unsupported top-level construct: section data at $1000',
      }),
    ]);
    expect(program.files[0]?.items).toHaveLength(1);
    expect(program.files[0]?.items[0]).toMatchObject({
      kind: 'Align',
    });
  });
});
