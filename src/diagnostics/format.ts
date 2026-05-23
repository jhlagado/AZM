import type { Diagnostic } from '../model/diagnostic.js';

export function formatNextDiagnostic(diagnostic: Diagnostic): string {
  const location =
    diagnostic.sourceName && diagnostic.line !== undefined && diagnostic.column !== undefined
      ? `${diagnostic.sourceName}:${diagnostic.line}:${diagnostic.column}`
      : diagnostic.sourceName;

  const message = `${diagnostic.severity}: [${diagnostic.code}] ${diagnostic.message}`;
  return location ? `${location}: ${message}` : message;
}
