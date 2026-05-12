import { expect } from 'vitest';

import type {
  Diagnostic,
  DiagnosticId,
  DiagnosticSeverity,
} from '../../../src/diagnosticTypes.js';

export type DiagnosticExpectation = {
  id?: DiagnosticId;
  severity?: DiagnosticSeverity;
  message?: string;
  messageIncludes?: string;
  file?: string;
  line?: number;
  column?: number;
};

export function makeDiagnosticMatcher(expected: DiagnosticExpectation) {
  if (expected.message !== undefined && expected.messageIncludes !== undefined) {
    throw new Error('DiagnosticExpectation cannot specify both message and messageIncludes.');
  }

  const shape: Record<string, unknown> = {};
  if (expected.id !== undefined) shape.id = expected.id;
  if (expected.severity !== undefined) shape.severity = expected.severity;
  if (expected.message !== undefined) shape.message = expected.message;
  if (expected.messageIncludes !== undefined) {
    shape.message = expect.stringContaining(expected.messageIncludes);
  }
  if (expected.file !== undefined) shape.file = expected.file;
  if (expected.line !== undefined) shape.line = expected.line;
  if (expected.column !== undefined) shape.column = expected.column;
  return expect.objectContaining(shape);
}

export function expectDiagnostic(
  diagnostics: readonly Diagnostic[],
  expected: DiagnosticExpectation,
): void {
  expect(diagnostics).toContainEqual(makeDiagnosticMatcher(expected));
}

export function expectNoDiagnostic(
  diagnostics: readonly Diagnostic[],
  expected: DiagnosticExpectation,
): void {
  expect(diagnostics).not.toContainEqual(makeDiagnosticMatcher(expected));
}

export function expectNoErrors(diagnostics: readonly Diagnostic[]): void {
  expect(diagnostics).not.toContainEqual(expect.objectContaining({ severity: 'error' }));
}

export function expectNoDiagnostics(diagnostics: readonly Diagnostic[]): void {
  expect(diagnostics).toEqual([]);
}
