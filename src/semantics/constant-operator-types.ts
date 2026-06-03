import type { Expression } from '../model/expression.js';

export type UnaryOperator = Extract<Expression, { readonly kind: 'unary' }>['operator'];
export type BinaryOperator = Extract<Expression, { readonly kind: 'binary' }>['operator'];
export type ByteFunction = Extract<Expression, { readonly kind: 'byte-function' }>['function'];
