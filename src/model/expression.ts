export type Expression =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'symbol'; readonly name: string }
  | { readonly kind: 'current-location' }
  | { readonly kind: 'type-size'; readonly typeExpr: TypeExpr }
  | { readonly kind: 'sizeof'; readonly typeExpr: TypeExpr }
  | { readonly kind: 'byte-function'; readonly function: 'LSB' | 'MSB'; readonly expression: Expression }
  | {
      readonly kind: 'offset';
      readonly typeExpr: TypeExpr;
      readonly path: readonly OffsetPathPart[];
    }
  | {
      readonly kind: 'layout-cast';
      readonly typeExpr: TypeExpr;
      readonly base: Expression;
      readonly path: readonly LayoutCastPathPart[];
    }
  | { readonly kind: 'unary'; readonly operator: '+' | '-' | '~'; readonly expression: Expression }
  | {
      readonly kind: 'binary';
      readonly operator: '*' | '/' | '%' | '+' | '-' | '&' | '^' | '|' | '<<' | '>>';
      readonly left: Expression;
      readonly right: Expression;
    };

export interface TypeExpr {
  readonly name: string;
  readonly length?: number;
}

export type OffsetPathPart =
  | { readonly kind: 'field'; readonly name: string }
  | { readonly kind: 'index'; readonly index: number };

export type LayoutCastPathPart =
  | { readonly kind: 'field'; readonly name: string }
  | { readonly kind: 'index'; readonly expression: Expression };
