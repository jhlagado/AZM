import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { parseDiag, parseDiagAt, parseDiagAtWithId } from '../../src/frontend/parseDiagnostics.js';

describe('PR636 parser diagnostics helpers', () => {
  it('emits parse errors with default parse ID/severity', () => {
    const diagnostics: Diagnostic[] = [];
    parseDiag(diagnostics, 'pr636.zax', 'broken thing');

    expect(diagnostics).toEqual([
      {
        id: DiagnosticIds.ParseError,
        severity: 'error',
        message: 'broken thing',
        file: 'pr636.zax',
      },
    ]);
  });

  it('emits parse errors at explicit locations', () => {
    const diagnostics: Diagnostic[] = [];
    parseDiagAt(diagnostics, 'pr636.zax', 'broken thing', 12, 7);

    expect(diagnostics).toEqual([
      {
        id: DiagnosticIds.ParseError,
        severity: 'error',
        message: 'broken thing',
        file: 'pr636.zax',
        line: 12,
        column: 7,
      },
    ]);
  });

  it('supports explicit IDs and severities', () => {
    const diagnostics: Diagnostic[] = [];
    parseDiagAtWithId(
      diagnostics,
      'pr636.zax',
      DiagnosticIds.IndexParenRedundant,
      'warning',
      'redundant parens',
      { line: 3, column: 9 },
    );

    expect(diagnostics).toEqual([
      {
        id: DiagnosticIds.IndexParenRedundant,
        severity: 'warning',
        message: 'redundant parens',
        file: 'pr636.zax',
        line: 3,
        column: 9,
      },
    ]);
  });
});
