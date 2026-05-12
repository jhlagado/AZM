import type { Diagnostic, DiagnosticId, DiagnosticSeverity } from '../diagnosticTypes.js';
import { DiagnosticIds } from '../diagnosticTypes.js';

export type ParseDiagLocation = {
  line: number;
  column: number;
};

export function parseDiag(
  diagnostics: Diagnostic[],
  file: string,
  message: string,
  where?: ParseDiagLocation,
): void {
  parseDiagAtWithId(diagnostics, file, DiagnosticIds.ParseError, 'error', message, where);
}

export function parseDiagAt(
  diagnostics: Diagnostic[],
  file: string,
  message: string,
  line: number,
  column: number,
): void {
  parseDiag(diagnostics, file, message, { line, column });
}

export function parseDiagAtWithId(
  diagnostics: Diagnostic[],
  file: string,
  id: DiagnosticId,
  severity: DiagnosticSeverity,
  message: string,
  where?: ParseDiagLocation,
): void {
  diagnostics.push({
    id,
    severity,
    message,
    file,
    ...(where ? { line: where.line, column: where.column } : {}),
  });
}
