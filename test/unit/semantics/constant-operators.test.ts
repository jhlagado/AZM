import { describe, expect, it } from 'vitest';

import {
  applyBinaryOperator,
  applyByteFunction,
  applyUnaryOperator,
} from '../../../src/semantics/constant-operators.js';

describe('constant operators', () => {
  it('applies unary operators', () => {
    expect(applyUnaryOperator('+', 3)).toBe(3);
    expect(applyUnaryOperator('-', 3)).toBe(-3);
    expect(applyUnaryOperator('~', 0x0f)).toBe(~0x0f);
  });

  it('applies byte functions', () => {
    expect(applyByteFunction('LSB', 0x1234)).toBe(0x34);
    expect(applyByteFunction('MSB', 0x1234)).toBe(0x12);
  });

  it('returns undefined for binary division by zero', () => {
    expect(applyBinaryOperator('/', 10, 0)).toBeUndefined();
    expect(applyBinaryOperator('%', 10, 0)).toBeUndefined();
  });
});
