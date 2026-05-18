import { describe, expect, it } from 'vitest';

import { buildDirectiveAliasPolicy, resolveDirectiveAlias } from '../../src/frontend/directiveAliases.js';

describe('directive alias policy', () => {
  it('keeps AZM baseline directive heads reserved', () => {
    expect(() =>
      buildDirectiveAliasPolicy('azm', [{ directiveAliases: { DB: '.dw' } }]),
    ).toThrow('Directive alias "DB" conflicts with the AZM baseline');
  });

  it('rejects aliases that would rewrite instruction mnemonics', () => {
    expect(() =>
      buildDirectiveAliasPolicy('azm', [{ directiveAliases: { LD: '.db' } }]),
    ).toThrow('Directive alias "LD" conflicts with a Z80 instruction');
  });

  it('allows project-local non-baseline directive heads', () => {
    const policy = buildDirectiveAliasPolicy('azm', [{ directiveAliases: { BYTE: '.db' } }]);

    expect(resolveDirectiveAlias('BYTE', policy)).toBe('.db');
    expect(resolveDirectiveAlias('DB', policy)).toBe('.db');
  });

  it('lets later project alias profiles override earlier project aliases', () => {
    const policy = buildDirectiveAliasPolicy('azm', [
      { directiveAliases: { BYTE: '.db' } },
      { directiveAliases: { BYTE: '.dw' } },
    ]);

    expect(resolveDirectiveAlias('BYTE', policy)).toBe('.dw');
  });
});
