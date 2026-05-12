import type { Diagnostic } from '../diagnosticTypes.js';
import { DiagnosticIds } from '../diagnosticTypes.js';

export function diagSemanticsError(diagnostics: Diagnostic[], file: string, message: string): void {
  diagnostics.push({ id: DiagnosticIds.SemanticsError, severity: 'error', message, file });
}
