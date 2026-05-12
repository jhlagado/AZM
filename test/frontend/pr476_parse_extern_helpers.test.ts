import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseExternFuncFromTail } from '../../src/frontend/parseExtern.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { parseProgram } from '../../src/frontend/parser.js';
import { expectNoDiagnostics } from '../helpers/diagnostics.js';

describe('PR476 extern parser extraction', () => {
  const file = makeSourceFile('pr476_parse_extern_helpers.zax', '');
  const zeroSpan = span(file, 0, 0);

  it('keeps extern func header parsing intact', () => {
    const diagnostics: Diagnostic[] = [];
    const parsed = parseExternFuncFromTail('sink(arg: word): HL at $1234', zeroSpan, 1, {
      diagnostics,
      modulePath: file.path,
      isReservedTopLevelName: () => false,
      parseParamsFromText: (_filePath, paramsText, paramsSpan) => [
        {
          kind: 'Param',
          span: paramsSpan,
          name: 'arg',
          typeExpr: { kind: 'TypeName', span: paramsSpan, name: 'word' },
        },
      ],
    });

    expectNoDiagnostics(diagnostics);
    expect(parsed).toMatchObject({
      kind: 'ExternFunc',
      name: 'sink',
      returnRegs: ['HL'],
      at: { kind: 'ImmLiteral', value: 0x1234 },
    });
  });

  it('preserves top-level extern parsing behavior through parser.ts', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      file.path,
      'extern func sink(arg: word): HL at $1234\n',
      diagnostics,
    );

    expectNoDiagnostics(diagnostics);
    expect(program.files[0]?.items[0]).toMatchObject({
      kind: 'ExternDecl',
      funcs: [{ kind: 'ExternFunc', name: 'sink', returnRegs: ['HL'] }],
    });
  });
});
