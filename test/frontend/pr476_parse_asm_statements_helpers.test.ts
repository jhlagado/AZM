import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import {
  appendParsedAsmStatement,
  isRecoverOnlyControlFrame,
  parseAsmStatement,
  type AsmControlFrame,
} from '../../src/frontend/parseAsmStatements.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';

describe('PR476 asm statement parsing extraction', () => {
  const file = makeSourceFile('pr476_parse_asm_statements_helpers.zax', '');
  const zeroSpan = span(file, 0, 0);

  it('keeps structured control parsing behavior intact', () => {
    const diagnostics: Diagnostic[] = [];
    const controlStack: AsmControlFrame[] = [];

    expect(
      parseAsmStatement(file.path, 'select a', zeroSpan, diagnostics, controlStack),
    ).toMatchObject({
      kind: 'Select',
      selector: { kind: 'Reg', name: 'A' },
    });
    expect(controlStack).toHaveLength(1);

    const parsed = parseAsmStatement(file.path, 'case 1, 2', zeroSpan, diagnostics, controlStack);
    const out: any[] = [];
    appendParsedAsmStatement(out, parsed);

    expect(out).toEqual([
      { kind: 'Case', span: zeroSpan, value: { kind: 'ImmLiteral', span: zeroSpan, value: 1 } },
      { kind: 'Case', span: zeroSpan, value: { kind: 'ImmLiteral', span: zeroSpan, value: 2 } },
    ]);
    expectNoDiagnostics(diagnostics);
  });

  it('parses grouped range case items without flattening the ranges away', () => {
    const diagnostics: Diagnostic[] = [];
    const controlStack: AsmControlFrame[] = [{ kind: 'Select', elseSeen: false, armSeen: false, openSpan: zeroSpan }];

    const parsed = parseAsmStatement(file.path, "case 'A'..'Z', '_'", zeroSpan, diagnostics, controlStack);
    const out: any[] = [];
    appendParsedAsmStatement(out, parsed);

    expect(out).toEqual([
      {
        kind: 'Case',
        span: zeroSpan,
        value: { kind: 'ImmLiteral', span: zeroSpan, value: 65 },
        end: { kind: 'ImmLiteral', span: zeroSpan, value: 90 },
      },
      { kind: 'Case', span: zeroSpan, value: { kind: 'ImmLiteral', span: zeroSpan, value: 95 } },
    ]);
    expectNoDiagnostics(diagnostics);
  });

  it('keeps recovery markers intact', () => {
    const diagnostics: Diagnostic[] = [];
    const controlStack: AsmControlFrame[] = [];

    const parsed = parseAsmStatement(
      file.path,
      'if nonsense extra',
      zeroSpan,
      diagnostics,
      controlStack,
    );
    expect(parsed).toMatchObject({ kind: 'If', cc: '__missing__' });
    expect(controlStack).toHaveLength(1);
    expect(isRecoverOnlyControlFrame(controlStack[0]!)).toBe(true);
    expectDiagnostic(diagnostics, { messageIncludes: '"if" expects a condition code' });
  });

  it('validates structured-control condition codes at parse time', () => {
    const diagnostics: Diagnostic[] = [];
    const repeatStack: AsmControlFrame[] = [{ kind: 'Repeat', openSpan: zeroSpan }];

    expect(parseAsmStatement(file.path, 'if nope', zeroSpan, diagnostics, [])).toMatchObject({
      kind: 'If',
      cc: '__missing__',
    });
    expect(
      parseAsmStatement(file.path, 'while nope', zeroSpan, diagnostics, []),
    ).toMatchObject({
      kind: 'While',
      cc: '__missing__',
    });
    expect(
      parseAsmStatement(file.path, 'until nope', zeroSpan, diagnostics, repeatStack),
    ).toMatchObject({
      kind: 'Until',
      cc: '__missing__',
    });
    expect(repeatStack).toHaveLength(0);
    expect(diagnostics).toHaveLength(3);
    expectDiagnostic(diagnostics, {
      message: 'Invalid if condition code "nope": expected z, nz, c, nc, pe, po, m, p.',
    });
    expectDiagnostic(diagnostics, {
      message: 'Invalid while condition code "nope": expected z, nz, c, nc, pe, po, m, p.',
    });
    expectDiagnostic(diagnostics, {
      message: 'Invalid until condition code "nope": expected z, nz, c, nc, pe, po, m, p.',
    });
  });

  it('allows symbolic condition placeholders when explicitly permitted', () => {
    const diagnostics: Diagnostic[] = [];
    const controlStack: AsmControlFrame[] = [];

    const parsed = parseAsmStatement(file.path, 'if cond', zeroSpan, diagnostics, controlStack, {
      allowedConditionIdentifiers: new Set(['cond']),
    });

    expect(parsed).toMatchObject({ kind: 'If', cc: 'cond' });
    expectNoDiagnostics(diagnostics);
  });

  it('falls back to instruction parsing for plain asm lines', () => {
    const diagnostics: Diagnostic[] = [];
    const parsed = parseAsmStatement(file.path, 'ld a, $12', zeroSpan, diagnostics, []);

    expect(parsed).toEqual({
      kind: 'AsmInstruction',
      span: zeroSpan,
      head: 'ld',
      operands: [
        { kind: 'Reg', span: zeroSpan, name: 'A' },
        { kind: 'Imm', span: zeroSpan, expr: { kind: 'ImmLiteral', span: zeroSpan, value: 18 } },
      ],
    });
    expectNoDiagnostics(diagnostics);
  });

  it('parses break and continue only when enclosed by a loop', () => {
    const diagnostics: Diagnostic[] = [];

    expect(
      parseAsmStatement(
        file.path,
        'break',
        zeroSpan,
        diagnostics,
        [{ kind: 'While', openSpan: zeroSpan }, { kind: 'If', elseSeen: false, openSpan: zeroSpan }],
      ),
    ).toEqual({ kind: 'Break', span: zeroSpan });
    expect(
      parseAsmStatement(
        file.path,
        'continue',
        zeroSpan,
        diagnostics,
        [{ kind: 'Repeat', openSpan: zeroSpan }],
      ),
    ).toEqual({ kind: 'Continue', span: zeroSpan });
    expectNoDiagnostics(diagnostics);
  });

  it('diagnoses out-of-loop or malformed break and continue', () => {
    const diagnostics: Diagnostic[] = [];

    expect(parseAsmStatement(file.path, 'break', zeroSpan, diagnostics, [])).toBeUndefined();
    expect(parseAsmStatement(file.path, 'continue extra', zeroSpan, diagnostics, [])).toBeUndefined();
    expect(diagnostics).toHaveLength(2);
    expectDiagnostic(diagnostics, {
      message: '"break" is only valid inside "while" or "repeat"',
    });
    expectDiagnostic(diagnostics, {
      message: '"continue" does not take operands',
    });
  });
});
