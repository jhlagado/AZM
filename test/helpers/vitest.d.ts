import type { DiagnosticId, DiagnosticSeverity } from '../../src/model/diagnostic.js';
import type { DiagnosticExpectation } from './diagnostics/index.js';

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveDiagnostic(expected: DiagnosticExpectation): T;
    toHaveDiagnostic(code: DiagnosticId, severity?: DiagnosticSeverity): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveDiagnostic(expected: DiagnosticExpectation): unknown;
    toHaveDiagnostic(code: DiagnosticId, severity?: DiagnosticSeverity): unknown;
  }
}

export {};
