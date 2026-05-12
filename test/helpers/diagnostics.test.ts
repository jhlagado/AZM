import { describe, expect, it } from 'vitest';

import { DiagnosticIds, type Diagnostic } from '../../src/diagnosticTypes.js';
import {
  expectDiagnostic,
  expectNoDiagnostic,
  expectNoDiagnostics,
  expectNoErrors,
} from './diagnostics.js';

const sampleDiagnostics: Diagnostic[] = [
  {
    id: DiagnosticIds.TypeError,
    severity: 'error',
    message: 'Array length is required for type "byte[]".',
    file: 'layout.zax',
    line: 4,
  },
  {
    id: DiagnosticIds.RawCallTypedTargetWarning,
    severity: 'warning',
    message: 'Raw call targets typed callable "callee_typed".',
    file: 'warn.zax',
    line: 7,
  },
];

describe('test/helpers/diagnostics', () => {
  it('matches diagnostics by id, severity, message fragment, file, and line', () => {
    expectDiagnostic(sampleDiagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      messageIncludes: 'Array length is required',
      file: 'layout.zax',
      line: 4,
    });
  });

  it('supports exact-message presence and absence checks', () => {
    expectDiagnostic(sampleDiagnostics, {
      id: DiagnosticIds.RawCallTypedTargetWarning,
      severity: 'warning',
      message: 'Raw call targets typed callable "callee_typed".',
    });
    expect(sampleDiagnostics).toHaveDiagnostic({
      id: DiagnosticIds.RawCallTypedTargetWarning,
      severity: 'warning',
      message: 'Raw call targets typed callable "callee_typed".',
    });
    expectNoDiagnostic(sampleDiagnostics, {
      id: DiagnosticIds.RawCallTypedTargetWarning,
      severity: 'error',
    });
  });

  it('supports no-errors and no-diagnostics assertions', () => {
    expect(() => expectNoErrors(sampleDiagnostics)).toThrow();
    expectNoErrors(sampleDiagnostics.filter((d) => d.severity !== 'error'));
    expectNoDiagnostics([]);
  });

  it('supports positional toHaveDiagnostic(id, severity) from Vitest setup', () => {
    expect(sampleDiagnostics).toHaveDiagnostic(DiagnosticIds.TypeError, 'error');
    expect(sampleDiagnostics).toHaveDiagnostic(DiagnosticIds.RawCallTypedTargetWarning, 'warning');
  });
});
