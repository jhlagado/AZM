import { describe, expect, it } from 'vitest';

import { DiagnosticIds, type Diagnostic } from '../../src/diagnosticTypes.js';
import type { SourceItemNode } from '../../src/frontend/ast.js';
import {
  parseAsmTopLevel,
  type ParseAsmTopLevelInput,
} from '../../src/frontend/parseAsmTopLevel.js';
import type { ParseItemContext } from '../../src/frontend/parseSourceItemDispatch.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';

function parseAsmLine(
  rest: string,
  ctx: Extract<ParseItemContext, { scope: 'source' }>,
  diagnostics: Diagnostic[],
): ReturnType<typeof parseAsmTopLevel> {
  const filePath = 'source.asm';
  const file = makeSourceFile(filePath, rest);
  const input: ParseAsmTopLevelInput = {
    index: 0,
    filePath,
    lineNo: 1,
    rest,
    stmtSpan: span(file, 0, rest.length),
    diagnostics,
    ctx,
  };
  return parseAsmTopLevel(input);
}

describe('parseAsmTopLevel', () => {
  it('owns ASM flat label/directive, instruction, and unsupported parsing order', () => {
    const ctx: Extract<ParseItemContext, { scope: 'source' }> = {
      scope: 'source',
    };
    const diagnostics: Diagnostic[] = [];

    expect(parseAsmLine('Table:', ctx, diagnostics)).toMatchObject({
      nextIndex: 1,
      nodes: [{ kind: 'AsmLabel', name: 'Table' }],
    });
    expect(parseAsmLine('  db 1,2', ctx, diagnostics)?.nodes).toMatchObject([
      { kind: 'AsmRawData', directive: 'db' },
    ]);
    expect(parseAsmLine('main:', ctx, diagnostics)?.nodes).toMatchObject([
      { kind: 'AsmLabel', name: 'main' },
    ]);
    expect(parseAsmLine('  xor a', ctx, diagnostics)?.nodes).toMatchObject([
      { kind: 'AsmInstruction', head: 'xor' },
    ]);

    const unsupported = parseAsmLine('  hl ??? count', ctx, diagnostics);
    expect(unsupported).toMatchObject({ nextIndex: 1 });
    expect((unsupported?.nodes as SourceItemNode[] | undefined) ?? []).toMatchObject([
      { kind: 'AsmInstruction', head: 'hl' },
    ]);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.ParseError,
        severity: 'error',
        message: expect.stringContaining('Unsupported operand: ??? count'),
      }),
    );
  });

  it('treats unknown ASM top-level text as an ordinary assembler line', () => {
    const ctx: Extract<ParseItemContext, { scope: 'source' }> = {
      scope: 'source',
    };
    const diagnostics: Diagnostic[] = [];
    const filePath = 'source.asm';
    const source = 'unknown_head clear_a()';
    const file = makeSourceFile(filePath, source);

    const parsed = parseAsmTopLevel({
      index: 0,
      filePath,
      lineNo: 1,
      rest: source,
      stmtSpan: span(file, 0, source.length),
      diagnostics,
      ctx,
    });

    expect(parsed).toMatchObject({
      nextIndex: 1,
      nodes: [{ kind: 'AsmInstruction', head: 'unknown_head' }],
    });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.ParseError,
        severity: 'error',
        message: expect.stringContaining('Unsupported operand: clear_a()'),
      }),
    );
  });
});
