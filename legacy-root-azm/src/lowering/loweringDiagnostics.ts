import { DiagnosticIds } from '../diagnosticTypes.js';
import type { Diagnostic, DiagnosticId } from '../diagnosticTypes.js';
import type { SourceSpan } from '../frontend/ast.js';

export function diag(diagnostics: Diagnostic[], file: string, message: string): void {
  diagnostics.push({ id: DiagnosticIds.EmitError, severity: 'error', message, file });
}

/** Encoder-time diagnostic with stable {@link DiagnosticIds.EncodeError} id and source span. */
export function diagEncodeAt(diagnostics: Diagnostic[], span: SourceSpan, message: string): void {
  diagnostics.push({
    id: DiagnosticIds.EncodeError,
    severity: 'error',
    message,
    file: span.file,
    line: span.start.line,
    column: span.start.column,
  });
}

export function diagAt(diagnostics: Diagnostic[], span: SourceSpan, message: string): void {
  diagnostics.push({
    id: DiagnosticIds.EmitError,
    severity: 'error',
    message,
    file: span.file,
    line: span.start.line,
    column: span.start.column,
  });
}

export function diagAtWithId(
  diagnostics: Diagnostic[],
  span: SourceSpan,
  id: DiagnosticId,
  message: string,
): void {
  diagnostics.push({
    id,
    severity: 'error',
    message,
    file: span.file,
    line: span.start.line,
    column: span.start.column,
  });
}

export function diagAtWithSeverityAndId(
  diagnostics: Diagnostic[],
  span: SourceSpan,
  id: DiagnosticId,
  severity: 'error' | 'warning',
  message: string,
): void {
  diagnostics.push({
    id,
    severity,
    message,
    file: span.file,
    line: span.start.line,
    column: span.start.column,
  });
}

export function warnAt(diagnostics: Diagnostic[], span: SourceSpan, message: string): void {
  diagnostics.push({
    id: DiagnosticIds.EmitWarning,
    severity: 'warning',
    message,
    file: span.file,
    line: span.start.line,
    column: span.start.column,
  });
}
