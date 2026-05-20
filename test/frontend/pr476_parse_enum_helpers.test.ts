import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import type { ProgramNode } from '../../src/frontend/ast.js';
import { parseEnumDecl } from '../../src/frontend/parseEnum.js';
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

describe('PR476 enum parser extraction', () => {
  const file = makeSourceFile('pr476_parse_enum_helpers.asm', '');
  const zeroSpan = span(file, 0, 0);
  const ctx = {
    diagnostics: [] as Diagnostic[],
    sourcePath: file.path,
    lineNo: 1,
    text: 'enum Colors Red, Green, Blue',
    span: zeroSpan,
    isReservedTopLevelName: () => false,
  };

  it('keeps enum helper parsing intact', () => {
    const node = parseEnumDecl('Colors Red, Green, Blue', ctx);
    expectNoDiagnostics(ctx.diagnostics);
    expect(node).toEqual({
      kind: 'EnumDecl',
      span: zeroSpan,
      name: 'Colors',
      members: ['Red', 'Green', 'Blue'],
    });
  });

  it('preserves top-level enum parsing through parser.ts', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseSingleFileProgram(file.path, 'enum Colors Red, Green, Blue\n', diagnostics);

    expectNoDiagnostics(diagnostics);
    expect(program.files[0]?.items[0]).toMatchObject({
      kind: 'EnumDecl',
      name: 'Colors',
      members: ['Red', 'Green', 'Blue'],
    });
  });
});
