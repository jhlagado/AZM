import { describe, expect, it } from 'vitest';

import { extractLineComment, stripLineComment } from '../../src/source/strip-line-comment.js';

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

describe('extractLineComment', () => {
  it('returns trailing comment text', () => {
    expect(extractLineComment('ld a, 1 ; load')).toBe('load');
    expect(extractLineComment('loop: ; loop top')).toBe('loop top');
  });

  it('ignores semicolons inside quoted strings', () => {
    expect(extractLineComment('.db "a;b" ; tail')).toBe('tail');
  });
});
