import { describe, expect, it } from 'vitest';

import { DiagnosticIds, type Diagnostic } from '../../src/diagnosticTypes.js';
import type { SourceItemNode } from '../../src/frontend/ast.js';
import {
  parseAzmNativeTopLevel,
  type ParseAzmNativeTopLevelInput,
} from '../../src/frontend/parseAzmNativeTopLevel.js';
import type { ParseItemContext } from '../../src/frontend/parseSourceItemDispatch.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';

function parseNativeLine(
  rest: string,
  ctx: Extract<ParseItemContext, { scope: 'source' }>,
  diagnostics: Diagnostic[],
): ReturnType<typeof parseAzmNativeTopLevel> {
  const filePath = 'native.asm';
  const file = makeSourceFile(filePath, rest);
  const input: ParseAzmNativeTopLevelInput = {
    index: 0,
    filePath,
    lineNo: 1,
    rest,
    stmtSpan: span(file, 0, rest.length),
    diagnostics,
    ctx,
  };
  return parseAzmNativeTopLevel(input);
}

describe('parseAzmNativeTopLevel', () => {
  it('owns native flat label/directive, instruction, and unsupported parsing order', () => {
    const ctx: Extract<ParseItemContext, { scope: 'source' }> = {
      scope: 'source',
    };
    const diagnostics: Diagnostic[] = [];

    expect(parseNativeLine('Table:', ctx, diagnostics)).toMatchObject({
      nextIndex: 1,
      nodes: [{ kind: 'AsmLabel', name: 'Table' }],
    });
    expect(parseNativeLine('  db 1,2', ctx, diagnostics)?.nodes).toMatchObject([
      { kind: 'AsmRawData', directive: 'db' },
    ]);
    expect(parseNativeLine('main:', ctx, diagnostics)?.nodes).toMatchObject([
      { kind: 'AsmLabel', name: 'main' },
    ]);
    expect(parseNativeLine('  xor a', ctx, diagnostics)?.nodes).toMatchObject([
      { kind: 'AsmInstruction', head: 'xor' },
    ]);

    const unsupported = parseNativeLine('  hl ??? count', ctx, diagnostics);
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

  it('treats unknown native top-level text as an ordinary assembler line', () => {
    const ctx: Extract<ParseItemContext, { scope: 'source' }> = {
      scope: 'source',
    };
    const diagnostics: Diagnostic[] = [];
    const filePath = 'native.asm';
    const source = 'unknown_head clear_a()';
    const file = makeSourceFile(filePath, source);

    const parsed = parseAzmNativeTopLevel({
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
