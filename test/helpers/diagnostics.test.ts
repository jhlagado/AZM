import { describe, expect, it } from 'vitest';

import { DiagnosticIds, type Diagnostic } from '../../src/model/diagnostic.js';
import {
  expectDiagnostic,
  expectNoDiagnostic,
  expectNoDiagnostics,
  expectNoErrors,
} from './diagnostics/index.js';

const sampleDiagnostics: Diagnostic[] = [
  {
    code: DiagnosticIds.TypeError,
    severity: 'error',
    message: 'Array length is required for type "byte[]".',
    sourceName: 'layout.asm',
    line: 4,
  },
  {
    code: DiagnosticIds.EmitWarning,
    severity: 'warning',
    message: 'Example warning.',
    sourceName: 'warn.asm',
    line: 7,
  },
];

describe('test/helpers/diagnostics', () => {
  it('matches diagnostics by code, severity, message fragment, sourceName, and line', () => {
    expectDiagnostic(sampleDiagnostics, {
      code: DiagnosticIds.TypeError,
      severity: 'error',
      messageIncludes: 'Array length is required',
      sourceName: 'layout.asm',
      line: 4,
    });
  });

  it('supports exact-message presence and absence checks', () => {
    expectDiagnostic(sampleDiagnostics, {
      code: DiagnosticIds.EmitWarning,
      severity: 'warning',
      message: 'Example warning.',
    });
    expect(sampleDiagnostics).toHaveDiagnostic({
      code: DiagnosticIds.EmitWarning,
      severity: 'warning',
      message: 'Example warning.',
    });
    expectNoDiagnostic(sampleDiagnostics, {
      code: DiagnosticIds.EmitWarning,
      severity: 'error',
    });
  });

  it('supports no-errors and no-diagnostics assertions', () => {
    expect(() => expectNoErrors(sampleDiagnostics)).toThrow();
    expectNoErrors(sampleDiagnostics.filter((d) => d.severity !== 'error'));
    expectNoDiagnostics([]);
  });

  it('supports positional toHaveDiagnostic(code, severity) from Vitest setup', () => {
    expect(sampleDiagnostics).toHaveDiagnostic(DiagnosticIds.TypeError, 'error');
    expect(sampleDiagnostics).toHaveDiagnostic(DiagnosticIds.EmitWarning, 'warning');
  });
});
