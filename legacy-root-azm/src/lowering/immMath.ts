export function evalUnaryImmOp(op: '+' | '-' | '~', value: number): number {
  switch (op) {
    case '+':
      return +value;
    case '-':
      return -value;
    case '~':
      return ~value;
  }
}

export function evalBinaryImmOp(
  op: '*' | '/' | '%' | '+' | '-' | '&' | '^' | '|' | '<<' | '>>',
  left: number,
  right: number,
): number | undefined {
  switch (op) {
    case '*':
      return left * right;
    case '/':
      return right === 0 ? undefined : Math.trunc(left / right);
    case '%':
      return right === 0 ? undefined : left % right;
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '&':
      return left & right;
    case '^':
      return left ^ right;
    case '|':
      return left | right;
    case '<<':
      return left << right;
    case '>>':
      return left >> right;
  }
}
