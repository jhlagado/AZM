export type Expression =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'symbol'; readonly name: string }
  | { readonly kind: 'current-location' }
  | { readonly kind: 'unary'; readonly operator: '+' | '-' | '~'; readonly expression: Expression }
  | {
      readonly kind: 'binary';
      readonly operator: '*' | '/' | '%' | '+' | '-' | '&' | '^' | '|' | '<<' | '>>';
      readonly left: Expression;
      readonly right: Expression;
    };
