export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly sourceName?: string;
  readonly line?: number;
  readonly column?: number;
}
