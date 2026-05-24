import { describe, expect, it } from 'vitest';

import {
  buildDirectiveAliasPolicy,
  normalizeDirectiveAlias,
  type DirectiveAliasPolicy,
} from '../../../src/syntax/directive-aliases.js';

function resolveDirectiveAlias(head: string, policy: DirectiveAliasPolicy): string | undefined {
  const normalized = normalizeDirectiveAlias(head, policy);
  if (normalized !== head) {
    return normalized;
  }
  const key = head.trim().replace(/^\./, '').toUpperCase();
  return policy.directiveAliases.get(key);
}

describe('directive alias policy', () => {
  it('keeps AZM baseline directive heads reserved', () => {
    expect(() =>
      buildDirectiveAliasPolicy([{ extends: 'azm', directiveAliases: { DB: '.dw' } }]),
    ).toThrow('Directive alias "DB" conflicts with the AZM baseline');
  });

  it('rejects aliases that would rewrite instruction mnemonics', () => {
    expect(() =>
      buildDirectiveAliasPolicy([{ extends: 'azm', directiveAliases: { LD: '.db' } }]),
    ).toThrow('Directive alias "LD" conflicts with a Z80 instruction');
  });

  it('rejects aliases that would rewrite AZM language keywords', () => {
    expect(() =>
      buildDirectiveAliasPolicy([{ extends: 'azm', directiveAliases: { OP: '.db' } }]),
    ).toThrow('Directive alias "OP" conflicts with an AZM language keyword');
  });

  it('rejects directive aliases that target instructions', () => {
    expect(() =>
      buildDirectiveAliasPolicy([{ extends: 'azm', directiveAliases: { FCB: 'ld' } }]),
    ).toThrow('Invalid directive alias target "ld" for "FCB"');
  });

  it('rejects directive aliases with operand text', () => {
    expect(() =>
      buildDirectiveAliasPolicy([{ extends: 'azm', directiveAliases: { FCB: '.db 0' } }]),
    ).toThrow('Invalid directive alias target ".db 0" for "FCB"');
  });

  it('requires project alias profiles to extend azm', () => {
    expect(() => buildDirectiveAliasPolicy([{ directiveAliases: { BYTE: '.db' } }])).toThrow(
      'Project directive alias files must extend "azm"',
    );
  });

  it('allows project-local non-baseline directive heads', () => {
    const policy = buildDirectiveAliasPolicy([
      { extends: 'azm', directiveAliases: { BYTES: '.db' } },
    ]);

    expect(resolveDirectiveAlias('BYTES', policy)).toBe('.db');
    expect(resolveDirectiveAlias('DB', policy)).toBe('.db');
  });

  it('accepts project-local data directive aliases', () => {
    const policy = buildDirectiveAliasPolicy([
      { extends: 'azm', directiveAliases: { FCB: '.db', FDB: '.dw', RMB: '.ds' } },
    ]);

    expect(resolveDirectiveAlias('FCB', policy)).toBe('.db');
    expect(resolveDirectiveAlias('FDB', policy)).toBe('.dw');
    expect(resolveDirectiveAlias('RMB', policy)).toBe('.ds');
  });

  it('lets later project alias profiles override earlier project aliases', () => {
    const policy = buildDirectiveAliasPolicy([
      { extends: 'azm', directiveAliases: { BYTES: '.db' } },
      { extends: 'azm', directiveAliases: { BYTES: '.dw' } },
    ]);

    expect(resolveDirectiveAlias('BYTES', policy)).toBe('.dw');
  });

  it('normalizes labeled lines and equate heads through the policy', () => {
    const policy = buildDirectiveAliasPolicy([
      { extends: 'azm', directiveAliases: { BYTES: '.db' } },
    ]);

    expect(normalizeDirectiveAlias('msg: BYTES 1,2', policy)).toBe('msg: .db 1,2');
    expect(normalizeDirectiveAlias('COUNT EQU 0', policy)).toBe('COUNT .equ 0');
  });

  it('rejects BYTE as a project alias head (reserved layout keyword)', () => {
    expect(() =>
      buildDirectiveAliasPolicy([{ extends: 'azm', directiveAliases: { BYTE: '.db' } }]),
    ).toThrow('Directive alias "BYTE" conflicts with an AZM language keyword');
  });
});
