import { describe, expect, it } from 'vitest';

import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseCallableHeader } from '../../src/frontend/parseCallableHeader.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';

describe('PR689 callable header parser primitive', () => {
  it('parses shared callable header shape and params', () => {
    const file = makeSourceFile('pr689_callable_header_parser.zax', 'func add(lhs: word, rhs: word): HL');
    const diagnostics: Diagnostic[] = [];
    const stmtSpan = span(file, 0, file.text.length);
    const parsed = parseCallableHeader({
      kind: 'func',
      header: 'add(lhs: word, rhs: word): HL',
      stmtText: 'func add(lhs: word, rhs: word): HL',
      stmtSpan,
      lineNo: 1,
      diagnostics,
      modulePath: file.path,
      expectedHeader: '<name>(...): <retType>',
      isReservedTopLevelName: () => false,
      parseParams: (paramsText) => paramsText.split(',').map((part) => part.trim()),
    });

    expect(diagnostics).toEqual([]);
    expect(parsed).toEqual({
      name: 'add',
      params: ['lhs: word', 'rhs: word'],
      trailing: ': HL',
    });
  });

  it('preserves callable-kind-specific diagnostics for invalid names', () => {
    const file = makeSourceFile('pr689_callable_header_invalid.zax', 'op 1bad()');
    const diagnostics: Diagnostic[] = [];
    const stmtSpan = span(file, 0, file.text.length);
    const parsed = parseCallableHeader({
      kind: 'op',
      header: '1bad()',
      stmtText: 'op 1bad()',
      stmtSpan,
      lineNo: 1,
      diagnostics,
      modulePath: file.path,
      expectedHeader: '<name>(...)',
      isReservedTopLevelName: () => false,
      parseParams: () => [],
    });

    expect(parsed).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: 'Invalid op name "1bad": expected <identifier>.',
      line: 1,
      column: 1,
    });
  });
});
