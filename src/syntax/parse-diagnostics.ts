import type { Diagnostic, DiagnosticId, DiagnosticSeverity } from '../model/diagnostic.js';

type ParseDiagLocation = {
  line: number;
  column: number;
};

/** Push a parse diagnostic with Next default code/severity (`AZMN_PARSE` / error). */
export function parseDiag(
  diagnostics: Diagnostic[],
  sourceName: string,
  message: string,
  where?: ParseDiagLocation,
): void {
  parseDiagAtWithId(diagnostics, sourceName, 'AZMN_PARSE', 'error', message, where);
}

/** Push a parse diagnostic at an explicit 1-based line/column. */
export function parseDiagAt(
  diagnostics: Diagnostic[],
  sourceName: string,
  message: string,
  line: number,
  column: number,
): void {
  parseDiag(diagnostics, sourceName, message, { line, column });
}

/** Push a diagnostic with explicit code, severity, and optional location. */
export function parseDiagAtWithId(
  diagnostics: Diagnostic[],
  sourceName: string,
  code: DiagnosticId | string,
  severity: DiagnosticSeverity,
  message: string,
  where?: ParseDiagLocation,
): void {
  diagnostics.push({
    code,
    severity,
    message,
    sourceName,
    ...(where ? { line: where.line, column: where.column } : {}),
  });
}
