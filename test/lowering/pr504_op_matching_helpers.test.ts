import { describe, expect, it } from 'vitest';

import type { AsmOperandNode, OpDeclNode, SourceSpan } from '../../src/frontend/ast.js';
import { createOpMatchingHelpers } from '../../src/lowering/opMatching.js';

const span: SourceSpan = {
  file: 'test.zax',
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
};

const reg = (name: string): AsmOperandNode => ({ kind: 'Reg', span, name });

describe('#504 op matching helpers', () => {
  it('keeps fixed-token matching and overload selection stable', () => {
    const helpers = createOpMatchingHelpers({
      reg8: new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']),
      isIxIyIndexedMem: () => false,
      flattenEaDottedName: () => undefined,
      isEnumName: () => false,
      normalizeFixedToken: (operand) => (operand.kind === 'Reg' ? operand.name.toUpperCase() : undefined),
      conditionOpcodeFromName: (name) => (name === 'NZ' ? 0xc2 : undefined),
      evalImmNoDiag: () => undefined,
      inferMemWidth: () => undefined,
    });

    const general = {
      kind: 'OpDecl',
      span,
      name: 'my_op',
      params: [{ name: 'arg', matcher: { kind: 'MatcherReg8', span } }],
      body: { kind: 'AsmBlock', span, items: [] },
      stackPolicy: 'default',
    } as unknown as OpDeclNode;
    const fixed = {
      kind: 'OpDecl',
      span,
      name: 'my_op',
      params: [{ name: 'arg', matcher: { kind: 'MatcherFixed', span, token: 'A' } }],
      body: { kind: 'AsmBlock', span, items: [] },
      stackPolicy: 'default',
    } as unknown as OpDeclNode;

    expect(helpers.matcherMatchesOperand(fixed.params[0]!.matcher, reg('A'))).toBe(true);
    expect(helpers.selectMostSpecificOpOverload([general, fixed], [reg('A')])).toBe(fixed);
    expect(helpers.selectOpOverload([general, fixed], [reg('A')])).toEqual({
      kind: 'selected',
      overload: fixed,
    });
    expect(helpers.formatOpSignature(fixed)).toBe('my_op(arg: A)');
    expect(helpers.firstOpOverloadMismatchReason(fixed, [reg('B')])).toBe('arg: expects A, got B');
  });

  it('reports mismatch details through the shared overload selection result', () => {
    const helpers = createOpMatchingHelpers({
      reg8: new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']),
      isIxIyIndexedMem: () => false,
      flattenEaDottedName: () => undefined,
      isEnumName: () => false,
      normalizeFixedToken: (operand) => (operand.kind === 'Reg' ? operand.name.toUpperCase() : undefined),
      conditionOpcodeFromName: () => undefined,
      evalImmNoDiag: () => undefined,
      inferMemWidth: () => undefined,
    });

    const fixed = {
      kind: 'OpDecl',
      span,
      name: 'my_op',
      params: [{ name: 'arg', matcher: { kind: 'MatcherFixed', span, token: 'A' } }],
      body: { kind: 'AsmBlock', span, items: [] },
      stackPolicy: 'default',
    } as unknown as OpDeclNode;

    expect(helpers.selectOpOverload([fixed], [reg('B')])).toEqual({
      kind: 'no_match',
      overloads: [fixed],
      mismatchDetails: ['my_op(arg: A) (test.zax:1) ; arg: expects A, got B'],
    });
  });
});
