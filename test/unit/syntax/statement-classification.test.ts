import { describe, expect, it } from 'vitest';

import {
  isChainedDirectiveOrDeclaration,
  isPotentialOpInvocationStatement,
} from '../../../src/syntax/statement-classification.js';

describe('statement classification', () => {
  it('identifies directives and declarations that cannot appear in instruction chains', () => {
    expect(isChainedDirectiveOrDeclaration('.db 1')).toBe(true);
    expect(isChainedDirectiveOrDeclaration('db 1')).toBe(true);
    expect(isChainedDirectiveOrDeclaration('COUNT .equ 1')).toBe(true);
    expect(isChainedDirectiveOrDeclaration('COUNT equ 1')).toBe(true);
    expect(isChainedDirectiveOrDeclaration('Colour .enum Red,Green')).toBe(true);
    expect(isChainedDirectiveOrDeclaration('Sprite .type')).toBe(true);
    expect(isChainedDirectiveOrDeclaration('ld a,b')).toBe(false);
    expect(isChainedDirectiveOrDeclaration('clear_a')).toBe(false);
  });

  it('identifies potential op invocations without treating declarations as calls', () => {
    expect(isPotentialOpInvocationStatement('clear_a')).toBe(true);
    expect(isPotentialOpInvocationStatement('clear a')).toBe(true);
    expect(isPotentialOpInvocationStatement('COUNT .equ 1')).toBe(false);
    expect(isPotentialOpInvocationStatement('COUNT equ 1')).toBe(false);
    expect(isPotentialOpInvocationStatement('Sprite .type')).toBe(false);
    expect(isPotentialOpInvocationStatement('op clear()')).toBe(false);
    expect(isPotentialOpInvocationStatement('.db 1')).toBe(false);
    expect(isPotentialOpInvocationStatement('Name.With.Dot')).toBe(false);
  });
});
