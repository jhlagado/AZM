import type { ImmExprNode } from './ast.js';

export function containsCurrentLocation(expr: ImmExprNode): boolean {
  switch (expr.kind) {
    case 'ImmCurrentLocation':
      return true;
    case 'ImmUnary':
      return containsCurrentLocation(expr.expr);
    case 'ImmBinary':
      return containsCurrentLocation(expr.left) || containsCurrentLocation(expr.right);
    default:
      return false;
  }
}
