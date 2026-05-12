import type { DiagnosticId, DiagnosticSeverity } from '../../src/diagnosticTypes.js';
import type { DiagnosticExpectation } from './diagnostics/index.js';

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveDiagnostic(expected: DiagnosticExpectation): T;
    toHaveDiagnostic(id: DiagnosticId, severity?: DiagnosticSeverity): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveDiagnostic(expected: DiagnosticExpectation): unknown;
    toHaveDiagnostic(id: DiagnosticId, severity?: DiagnosticSeverity): unknown;
  }
}
