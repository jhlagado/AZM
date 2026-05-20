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
    expect((unsupported?.nodes as ModuleItemNode[] | undefined) ?? []).toEqual([]);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.AzmRemovedZaxConstruct,
        severity: 'error',
        message: expect.stringContaining('Typed assignment'),
      }),
    );
  });
});
