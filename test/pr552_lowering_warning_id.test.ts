import { describe, expect, it } from 'vitest';

import { DiagnosticIds } from '../src/diagnosticTypes.js';
import type { Diagnostic } from '../src/diagnosticTypes.js';
import { warnAt } from '../src/lowering/loweringDiagnostics.js';

describe('PR552 lowering warning diagnostic id', () => {
  it('uses EmitWarning for generic lowering warnings', () => {
    const diagnostics: Diagnostic[] = [];

    warnAt(
      diagnostics,
      {
        file: 'test.zax',
        start: { offset: 0, line: 3, column: 5 },
        end: { offset: 1, line: 3, column: 6 },
      },
      'warning text',
    );

    expect(diagnostics).toEqual([
      {
        id: DiagnosticIds.EmitWarning,
        severity: 'warning',
        message: 'warning text',
        file: 'test.zax',
        line: 3,
        column: 5,
      },
    ]);
  });
});
