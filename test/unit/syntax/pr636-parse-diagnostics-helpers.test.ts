import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../../src/model/diagnostic.js';
import { DiagnosticIds } from '../../../src/model/diagnostic.js';
import {
  parseDiag,
  parseDiagAt,
  parseDiagAtWithId,
} from '../../../src/syntax/parse-diagnostics.js';

describe('PR636 parser diagnostics helpers', () => {
  it('emits parse errors with default parse code/severity', () => {
    const diagnostics: Diagnostic[] = [];
    parseDiag(diagnostics, 'pr636.asm', 'broken thing');

    expect(diagnostics).toEqual([
      {
        code: 'AZMN_PARSE',
        severity: 'error',
        message: 'broken thing',
        sourceName: 'pr636.asm',
      },
    ]);
  });

  it('emits parse errors at explicit locations', () => {
    const diagnostics: Diagnostic[] = [];
    parseDiagAt(diagnostics, 'pr636.asm', 'broken thing', 12, 7);

    expect(diagnostics).toEqual([
      {
        code: 'AZMN_PARSE',
        severity: 'error',
        message: 'broken thing',
        sourceName: 'pr636.asm',
        line: 12,
        column: 7,
      },
    ]);
  });

  it('supports explicit codes and severities', () => {
    const diagnostics: Diagnostic[] = [];
    parseDiagAtWithId(
      diagnostics,
      'pr636.asm',
      DiagnosticIds.IndexParenRedundant,
      'warning',
      'redundant parens',
      { line: 3, column: 9 },
    );

    expect(diagnostics).toEqual([
      {
        code: DiagnosticIds.IndexParenRedundant,
        severity: 'warning',
        message: 'redundant parens',
        sourceName: 'pr636.asm',
        line: 3,
        column: 9,
      },
    ]);
  });
});
