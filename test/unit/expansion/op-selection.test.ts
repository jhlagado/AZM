import { describe, expect, it } from 'vitest';

import { formatOpSelectionDiagnostic, selectOpOverload } from '../../../src/expansion/op-selection.js';
import type { OpDecl } from '../../../src/expansion/op-expansion.js';
import type { OpMatcher, OpOperand } from '../../../src/expansion/op-operands.js';

function overload(name: string, matchers: readonly OpMatcher[], line = 1): OpDecl {
  return {
    name,
    params: matchers.map((matcher, index) => ({ name: `p${index}`, matcher })),
    body: [],
    sourceName: 'ops.asm',
    line,
  };
}

const reg8 = (register: string): OpOperand => ({
  kind: 'reg8',
  register,
  text: register.toUpperCase(),
});

const imm = (text: string, value: number): OpOperand => ({
  kind: 'imm',
  expression: { kind: 'number', value },
  text,
});

describe('op overload selection', () => {
  it('selects the single matching overload', () => {
    const candidate = overload('load', [{ kind: 'reg8' }, { kind: 'imm8' }]);
    expect(selectOpOverload([candidate], [reg8('a'), imm('$2A', 0x2a)])).toEqual({
      kind: 'selected',
      overload: candidate,
    });
  });

  it('prefers narrower immediate overloads when the value fits', () => {
    const imm16 = overload('load', [{ kind: 'imm16' }], 1);
    const imm8 = overload('load', [{ kind: 'imm8' }], 2);
    expect(selectOpOverload([imm16, imm8], [imm('$7F', 0x7f)])).toEqual({
      kind: 'selected',
      overload: imm8,
    });
  });

  it('leaves incomparable overloads ambiguous', () => {
    const fixedAThenImm16 = overload('load', [{ kind: 'fixed', token: 'A' }, { kind: 'imm16' }], 1);
    const reg8ThenImm8 = overload('load', [{ kind: 'reg8' }, { kind: 'imm8' }], 2);
    expect(selectOpOverload([fixedAThenImm16, reg8ThenImm8], [reg8('a'), imm('$7F', 0x7f)]))
      .toEqual({
        kind: 'ambiguous',
        candidates: [fixedAThenImm16, reg8ThenImm8],
      });
  });

  it('formats arity and mismatch diagnostics with available overloads', () => {
    const candidate = overload('load', [{ kind: 'reg8' }, { kind: 'imm8' }]);
    const arity = selectOpOverload([candidate], [reg8('a')]);
    expect(formatOpSelectionDiagnostic(arity as Exclude<typeof arity, { kind: 'selected' }>, [candidate], [reg8('a')]))
      .toContain('No op overload of "load" accepts 1 operand(s).');

    const mismatch = selectOpOverload([candidate], [imm('$100', 0x100), imm('$100', 0x100)]);
    expect(
      formatOpSelectionDiagnostic(
        mismatch as Exclude<typeof mismatch, { kind: 'selected' }>,
        [candidate],
        [imm('$100', 0x100), imm('$100', 0x100)],
      ),
    ).toContain('p0: expects reg8, got $100');
  });

  it('formats fixed-token mismatch diagnostics', () => {
    const candidate = overload('branch', [{ kind: 'fixed', token: 'NZ' }, { kind: 'imm16' }]);
    const mismatch = selectOpOverload([candidate], [reg8('a'), imm('$1234', 0x1234)]);
    expect(
      formatOpSelectionDiagnostic(
        mismatch as Exclude<typeof mismatch, { kind: 'selected' }>,
        [candidate],
        [reg8('a'), imm('$1234', 0x1234)],
      ),
    ).toContain('p0: expects NZ, got A');
  });
});
