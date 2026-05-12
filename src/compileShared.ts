import { resolve } from 'node:path';

import type { Diagnostic } from './diagnosticTypes.js';

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

export function normalizePath(p: string): string {
  return resolve(p);
}