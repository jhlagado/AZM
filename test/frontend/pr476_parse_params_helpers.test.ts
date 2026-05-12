import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseOpParamsFromText, parseParamsFromText } from '../../src/frontend/parseParams.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { parseProgram } from '../../src/frontend/parser.js';
import { expectNoDiagnostics } from '../helpers/diagnostics.js';

describe('PR476 parameter parser extraction', () => {
  const file = makeSourceFile('pr476_parse_params_helpers.zax', '');
  const zeroSpan = span(file, 0, 0);
  const ctx = { isReservedTopLevelName: () => false };

  it('keeps func parameter parsing intact', () => {
    const diagnostics: Diagnostic[] = [];
    const params = parseParamsFromText(
      file.path,
      'lhs: word, rhs: byte[2]',
      zeroSpan,
      diagnostics,
      ctx,
    );

    expectNoDiagnostics(diagnostics);
    expect(params).toEqual([
      {
        kind: 'Param',
        span: zeroSpan,
        name: 'lhs',
        typeExpr: { kind: 'TypeName', span: zeroSpan, name: 'word' },
      },
      {
        kind: 'Param',
        span: zeroSpan,
        name: 'rhs',
        typeExpr: {
          kind: 'ArrayType',
          span: zeroSpan,
          element: { kind: 'TypeName', span: zeroSpan, name: 'byte' },
          length: 2,
        },
      },
    ]);
  });

  it('keeps op parameter parsing intact', () => {
    const diagnostics: Diagnostic[] = [];
    const params = parseOpParamsFromText(
      file.path,
      'dst: reg16, src: imm8',
      zeroSpan,
      diagnostics,
      ctx,
    );

    expectNoDiagnostics(diagnostics);
    expect(params).toEqual([
      {
        kind: 'OpParam',
        span: zeroSpan,
        name: 'dst',
        matcher: { kind: 'MatcherReg16', span: zeroSpan },
      },
      {
        kind: 'OpParam',
        span: zeroSpan,
        name: 'src',
        matcher: { kind: 'MatcherImm8', span: zeroSpan },
      },
    ]);
  });

  it('preserves top-level func/op parsing through parser.ts', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      file.path,
      'func add(lhs: word, rhs: word): HL\n  ret\nend\n\nop copy16(dst: reg16, src: reg16)\n  ld dst, src\nend\n',
      diagnostics,
    );

    expectNoDiagnostics(diagnostics);
    expect(program.files[0]?.items[0]).toMatchObject({ kind: 'FuncDecl', name: 'add' });
    expect(program.files[0]?.items[1]).toMatchObject({ kind: 'OpDecl', name: 'copy16' });
  });
});
