import type { Expression } from '../model/expression.js';
import { parseLayoutExpression } from './parse-layout-expression.js';
import { tokenizeExpression } from './expression-tokenizer.js';
import { parseTokenExpression } from './parse-token-expression.js';

export { parseTypeExpr } from './parse-layout-expression.js';

export function parseExpression(text: string): Expression | undefined {
  const layoutExpression = parseLayoutExpression(text, parseExpression);
  if (layoutExpression) {
    return layoutExpression;
  }

  const tokens = tokenizeExpression(text, parseExpression);
  if (!tokens) {
    return undefined;
  }
  return parseTokenExpression(tokens);
}
