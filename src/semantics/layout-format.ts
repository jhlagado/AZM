import type { Expression, OffsetPathPart, TypeExpr } from '../model/expression.js';

export function scalarSize(typeName: string): number | undefined {
  switch (typeName.toLowerCase()) {
    case 'byte':
      return 1;
    case 'word':
    case 'addr':
      return 2;
    default:
      return undefined;
  }
}

export function formatTypeExpr(typeExpr: TypeExpr): string {
  return typeExpr.length === undefined ? typeExpr.name : `${typeExpr.name}[${typeExpr.length}]`;
}

export function formatOffsetPath(path: readonly OffsetPathPart[]): string {
  return path.map((part) => (part.kind === 'field' ? part.name : `[${part.index}]`)).join('.');
}

export function registerIndexName(expression: Expression): string | undefined {
  switch (expression.kind) {
    case 'symbol':
      return /^(a|b|c|d|e|h|l|af|bc|de|hl|ix|iy|sp|i|r|ixh|ixl|iyh|iyl)$/i.test(expression.name)
        ? expression.name.toUpperCase()
        : undefined;
    case 'unary':
      return registerIndexName(expression.expression);
    case 'binary':
      return registerIndexName(expression.left) ?? registerIndexName(expression.right);
    default:
      return undefined;
  }
}
