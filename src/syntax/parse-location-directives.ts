import type { Diagnostic } from '../model/diagnostic.js';
import type { LogicalLine } from '../source/logical-lines.js';
import { parseExpression } from './parse-expression.js';
import type { ParseLineResult } from './parse-line.js';

export function parseExpressionDirective(
  line: LogicalLine,
  kind: 'align' | 'binfrom' | 'binto' | 'org',
  expressionText: string,
  span: { readonly sourceName: string; readonly line: number; readonly column: number },
): ParseLineResult {
  const expression = parseExpression(expressionText);
  if (!expression) {
    return {
      items: [],
      diagnostics: [parseError(line, `invalid .${kind} expression: ${expressionText}`)],
    };
  }
  if (kind === 'align') {
    return { items: [{ kind, alignment: expression, span }], diagnostics: [] };
  }
  return { items: [{ kind, expression, span }], diagnostics: [] };
}

function firstColumn(text: string): number {
  const match = /\S/.exec(text);
  return match ? match.index + 1 : 1;
}

function parseError(line: LogicalLine, message: string): Diagnostic {
  return {
    severity: 'error',
    code: 'AZMN_PARSE',
    message,
    sourceName: line.sourceName,
    line: line.line,
    column: firstColumn(line.text),
  };
}
