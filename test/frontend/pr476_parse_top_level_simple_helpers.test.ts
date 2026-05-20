import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import type { ProgramNode } from '../../src/frontend/ast.js';
import { parseAlignDirectiveDecl } from '../../src/frontend/parseTopLevelSimple.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { parseSourceFile } from '../../src/frontend/parser.js';
import { expectNoDiagnostics } from '../helpers/diagnostics.js';

function parseSingleFileProgram(path: string, sourceText: string, diagnostics: Diagnostic[]): ProgramNode {
  const sourceFile = parseSourceFile(path, sourceText, diagnostics);
  return {
    kind: 'Program',
    span: sourceFile.span,
    entryFile: path,
    files: [sourceFile],
  };
}

describe('PR476 simple top-level parser extraction', () => {
  const file = makeSourceFile('pr476_parse_top_level_simple_helpers.asm', '');
  const zeroSpan = span(file, 0, 0);
  const ctx = {
    diagnostics: [] as Diagnostic[],
    sourcePath: file.path,
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
    const program = parseSingleFileProgram(
      file.path,
      'align $10\n',
      diagnostics,
    );

    expectNoDiagnostics(diagnostics);
    expect(program.files[0]?.items).toHaveLength(1);
    expect(program.files[0]?.items[0]).toMatchObject({
      kind: 'Align',
    });
  });
});
