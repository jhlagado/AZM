import type { Diagnostic, DiagnosticId, DiagnosticSeverity } from '../model/diagnostic.js';

type ParseDiagLocation = {
  line: number;
  column: number;
};

type ParseDiagLine = {
  readonly sourceName: string;
  readonly line: number;
  readonly text: string;
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

/** Return a parse diagnostic at the first non-whitespace column of a source line. */
export function parseLineError(line: ParseDiagLine, message: string): Diagnostic {
  return {
    code: 'AZMN_PARSE',
    severity: 'error',
    message,
    sourceName: line.sourceName,
    line: line.line,
    column: firstNonWhitespaceColumn(line.text),
  };
}

export function firstNonWhitespaceColumn(text: string): number {
  const match = /\S/.exec(text);
  return match ? match.index + 1 : 1;
}
