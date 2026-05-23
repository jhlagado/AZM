import { describe, expect, it } from 'vitest';

import { stripLineComment } from '../../src/source/strip-line-comment.js';

describe('stripLineComment', () => {
  it('removes trailing comments', () => {
    expect(stripLineComment('ld a, 1 ; load')).toBe('ld a, 1 ');
  });

  it('preserves semicolons inside double-quoted strings', () => {
    expect(stripLineComment('.db "a;b" ; tail')).toBe('.db "a;b" ');
  });

  it('preserves semicolons inside single-quoted character literals', () => {
    expect(stripLineComment(".db ';' ; tail")).toBe(".db ';' ");
  });
});
