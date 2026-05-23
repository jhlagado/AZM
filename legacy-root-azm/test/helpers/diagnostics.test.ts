import { describe, expect, it } from 'vitest';

import { DiagnosticIds, type Diagnostic } from '../../src/diagnosticTypes.js';
import {
  expectDiagnostic,
  expectNoDiagnostic,
  expectNoDiagnostics,
  expectNoErrors,
} from './diagnostics/index.js';

const sampleDiagnostics: Diagnostic[] = [
  {
    id: DiagnosticIds.TypeError,
    severity: 'error',
    message: 'Array length is required for type "byte[]".',
    file: 'layout.asm',
    line: 4,
  },
  {
    id: DiagnosticIds.EmitWarning,
    severity: 'warning',
    message: 'Example warning.',
    file: 'warn.asm',
    line: 7,
  },
];

describe('test/helpers/diagnostics', () => {
  it('matches diagnostics by id, severity, message fragment, file, and line', () => {
    expectDiagnostic(sampleDiagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      messageIncludes: 'Array length is required',
      file: 'layout.asm',
      line: 4,
    });
  });

  it('supports exact-message presence and absence checks', () => {
    expectDiagnostic(sampleDiagnostics, {
      id: DiagnosticIds.EmitWarning,
      severity: 'warning',
      message: 'Example warning.',
    });
    expect(sampleDiagnostics).toHaveDiagnostic({
      id: DiagnosticIds.EmitWarning,
      severity: 'warning',
      message: 'Example warning.',
    });
    expectNoDiagnostic(sampleDiagnostics, {
      id: DiagnosticIds.EmitWarning,
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
    expect(sampleDiagnostics).toHaveDiagnostic(DiagnosticIds.EmitWarning, 'warning');
  });
});
