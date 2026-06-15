import type { LogicalLine } from '../source/logical-lines.js';
import { parseLineError } from './parse-diagnostics.js';
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
      diagnostics: [parseLineError(line, `invalid .${kind} expression: ${expressionText}`)],
    };
  }
  if (kind === 'align') {
    return { items: [{ kind, alignment: expression, span }], diagnostics: [] };
  }
  return { items: [{ kind, expression, span }], diagnostics: [] };
}
