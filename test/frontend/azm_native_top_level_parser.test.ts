import { describe, expect, it } from 'vitest';

import { DiagnosticIds, type Diagnostic } from '../../src/diagnosticTypes.js';
import type { ModuleItemNode } from '../../src/frontend/ast.js';
import {
  parseAzmNativeTopLevel,
  type ParseAzmNativeTopLevelInput,
} from '../../src/frontend/parseAzmNativeTopLevel.js';
import type { ParseItemContext } from '../../src/frontend/parseModuleItemDispatch.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';

function parseNativeLine(
  rest: string,
  ctx: Extract<ParseItemContext, { scope: 'module' }>,
  diagnostics: Diagnostic[],
): ReturnType<typeof parseAzmNativeTopLevel> {
  const filePath = 'native.azm';
  const file = makeSourceFile(filePath, rest);
  const input: ParseAzmNativeTopLevelInput = {
    index: 0,
    filePath,
    lineNo: 1,
    rest,
    stmtSpan: span(file, 0, rest.length),
    diagnostics,
    ctx,
    lineCount: 1,
    getRawLine: () => ({ raw: rest }),
  };
  return parseAzmNativeTopLevel(input);
}

describe('parseAzmNativeTopLevel', () => {
  it('owns native flat label/directive, instruction, and unsupported high-level parsing order', () => {
    const ctx: Extract<ParseItemContext, { scope: 'module' }> = {
      scope: 'module',
      asmControlStack: [],
    };
    const diagnostics: Diagnostic[] = [];

    expect(parseNativeLine('Table:', ctx, diagnostics)).toMatchObject({
      nextIndex: 1,
      nodes: [{ kind: 'AsmLabel', name: 'Table' }],
    });
    expect(parseNativeLine('  db 1,2', ctx, diagnostics)?.nodes).toMatchObject([
      { kind: 'ClassicRawData', directive: 'db' },
    ]);
    expect(parseNativeLine('main:', ctx, diagnostics)?.nodes).toMatchObject([
      { kind: 'AsmLabel', name: 'main' },
    ]);
    expect(parseNativeLine('  xor a', ctx, diagnostics)?.nodes).toMatchObject([
      { kind: 'AsmInstruction', head: 'xor' },
    ]);

    const unsupported = parseNativeLine('  hl := count', ctx, diagnostics);
    expect(unsupported).toMatchObject({ nextIndex: 1 });
    expect((unsupported?.nodes as ModuleItemNode[] | undefined) ?? []).toMatchObject([
      { kind: 'AsmInstruction', head: 'hl' },
    ]);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.ParseError,
        severity: 'error',
        message: expect.stringContaining('Unsupported operand: := count'),
      }),
    );
  });

  it('owns exported native block rejection and skips the rejected body', () => {
    const ctx: Extract<ParseItemContext, { scope: 'module' }> = {
      scope: 'module',
      asmControlStack: [],
    };
    const diagnostics: Diagnostic[] = [];
    const filePath = 'native.azm';
    const source = ['export op clear_a()', '  xor a', 'end', 'after:', '  ret'].join('\n');
    const file = makeSourceFile(filePath, source);
    const lines = source.split('\n');

    const parsed = parseAzmNativeTopLevel({
      index: 0,
      filePath,
      lineNo: 1,
      rest: 'op clear_a()',
      stmtSpan: span(file, 0, lines[0]!.length),
      diagnostics,
      ctx,
      lineCount: lines.length,
      getRawLine: (lineIndex) => ({ raw: lines[lineIndex] ?? '' }),
      hasExportPrefix: true,
    });

    expect(parsed).toEqual({ nextIndex: 3 });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.AzmRemovedZaxConstruct,
        severity: 'error',
        message: expect.stringContaining('Export declarations'),
      }),
    );
  });
});
