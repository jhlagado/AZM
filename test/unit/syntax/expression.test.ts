import { describe, expect, it } from 'vitest';

import { parseExpression } from '../../../src/syntax/parse-expression.js';

describe('parseExpression', () => {
  it('parses AZM numeric literal forms proven by current tests', () => {
    expect(parseExpression('42')).toEqual({ kind: 'number', value: 42 });
    expect(parseExpression('$2A')).toEqual({ kind: 'number', value: 42 });
    expect(parseExpression('%101010')).toEqual({ kind: 'number', value: 42 });
    expect(parseExpression('0b101010')).toEqual({ kind: 'number', value: 42 });
    expect(parseExpression('0x2A')).toEqual({ kind: 'number', value: 42 });
    expect(parseExpression('02AH')).toEqual({ kind: 'number', value: 42 });
    expect(parseExpression('101010B')).toEqual({ kind: 'number', value: 42 });
  });

  it('keeps trailing hex ambiguity by parsing FFH as a symbol', () => {
    expect(parseExpression('FFH')).toEqual({ kind: 'symbol', name: 'FFH' });
    expect(parseExpression('0FFH')).toEqual({ kind: 'number', value: 0xff });
  });

  it('parses quoted one-character expressions', () => {
    expect(parseExpression("'A'")).toEqual({ kind: 'number', value: 65 });
    expect(parseExpression('"Y"')).toBeUndefined();
    expect(parseExpression('"NO"')).toBeUndefined();
    expect(parseExpression("'\\z'")).toBeUndefined();
  });

  it('parses unary, binary, current-location, and parenthesized expressions', () => {
    expect(parseExpression('($-BASE)/2')).toEqual({
      kind: 'binary',
      operator: '/',
      left: {
        kind: 'binary',
        operator: '-',
        left: { kind: 'current-location' },
        right: { kind: 'symbol', name: 'BASE' },
      },
      right: { kind: 'number', value: 2 },
    });
    expect(parseExpression('~1 & 0xff')).toEqual({
      kind: 'binary',
      operator: '&',
      left: { kind: 'unary', operator: '~', expression: { kind: 'number', value: 1 } },
      right: { kind: 'number', value: 0xff },
    });
    expect(parseExpression('$Label')).toBeUndefined();
    expect(parseExpression('?label')).toEqual({ kind: 'symbol', name: '?label' });
    expect(parseExpression('?')).toBeUndefined();
  });
});
