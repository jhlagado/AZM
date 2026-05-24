import { describe, expect, it } from 'vitest';

import { parseExpression } from '../../../src/syntax/parse-expression.js';

describe('PR769: layout cast expression parser', () => {
  it('parses layout casts with field paths', () => {
    expect(parseExpression('<Sprite>PLAYER.flags')).toEqual({
      kind: 'layout-cast',
      typeExpr: { name: 'Sprite' },
      base: { kind: 'symbol', name: 'PLAYER' },
      path: [{ kind: 'field', name: 'flags' }],
    });

    expect(parseExpression('<Header>ptr.checksum')).toEqual({
      kind: 'layout-cast',
      typeExpr: { name: 'Header' },
      base: { kind: 'symbol', name: 'ptr' },
      path: [{ kind: 'field', name: 'checksum' }],
    });
  });

  it('keeps additive tails outside the layout-cast path', () => {
    expect(parseExpression('<Sprite>PLAYER.flags + 2')).toEqual({
      kind: 'binary',
      operator: '+',
      left: {
        kind: 'layout-cast',
        typeExpr: { name: 'Sprite' },
        base: { kind: 'symbol', name: 'PLAYER' },
        path: [{ kind: 'field', name: 'flags' }],
      },
      right: { kind: 'number', value: 2 },
    });
  });

  it('rejects layout casts without a path', () => {
    expect(parseExpression('<Sprite>hl')).toBeUndefined();
  });
});
