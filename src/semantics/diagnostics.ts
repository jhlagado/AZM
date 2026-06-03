import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceSpan } from '../source/source-span.js';

export function diagnostic(span: SourceSpan, message: string): Diagnostic {
  return {
    severity: 'error',
    code: 'AZMN_SYMBOL',
    message,
    sourceName: span.sourceName,
    line: span.line,
    column: span.column,
  };
}
