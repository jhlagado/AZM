import { expect } from 'vitest';

import type { DiagnosticId, DiagnosticSeverity } from '../../src/diagnosticTypes.js';
import type { DiagnosticExpectation } from './diagnostics/index.js';
import { makeDiagnosticMatcher } from './diagnostics/index.js';

function isDiagnosticIdString(value: unknown): value is DiagnosticId {
  return typeof value === 'string' && /^ZAX\d{3}$/.test(value);
}

function toHaveDiagnosticArgsToExpectation(args: unknown[]): DiagnosticExpectation {
  if (args.length === 0) {
    throw new Error('toHaveDiagnostic: expected at least one argument');
  }
  if (args.length === 1) {
    const a = args[0];
    if (isDiagnosticIdString(a)) {
      return { id: a, severity: 'error' };
    }
    return a as DiagnosticExpectation;
  }
  if (args.length === 2 && isDiagnosticIdString(args[0])) {
    return {
      id: args[0] as DiagnosticId,
      severity: args[1] as DiagnosticSeverity,
    };
  }
  throw new Error('toHaveDiagnostic: use (expectation: object) or (id: DiagnosticId, severity?: ...)');
}

expect.extend({
  toHaveDiagnostic(received: unknown, ...args: unknown[]) {
    const diagnostics = Array.isArray(received) ? received : [];
    const expected = toHaveDiagnosticArgsToExpectation(args);
    const matcher = makeDiagnosticMatcher(expected);
    const pass = diagnostics.some((diag) => matcher.asymmetricMatch(diag));
    return {
      pass,
      message: () =>
        pass
          ? 'Expected diagnostics not to contain a matching diagnostic.'
          : 'Expected diagnostics to contain a matching diagnostic.',
    };
  },
});
