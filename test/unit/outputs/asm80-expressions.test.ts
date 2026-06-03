import { describe, expect, it } from 'vitest';

import type { Expression } from '../../../src/model/expression.js';
import type { LayoutRecord } from '../../../src/semantics/expression-evaluation.js';
import {
  evaluateLoweredConstant,
  formatExpression,
  formatLoweredNumber,
  type LoweredEvalContext,
} from '../../../src/outputs/asm80-expressions.js';

const span = { sourceName: 'test.asm', line: 1, column: 1 };

function context(input: {
  constants?: readonly (readonly [string, number])[];
  symbols?: readonly (readonly [string, number])[];
  layouts?: readonly (readonly [string, LayoutRecord])[];
}): LoweredEvalContext {
  return {
    constants: new Map(input.constants ?? []),
    symbols: new Map(input.symbols ?? []),
    layouts: new Map(input.layouts ?? []),
  };
}

describe('ASM80 expression lowering', () => {
  it('formats numbers with byte, word, auto, and negative widths', () => {
    expect(formatLoweredNumber(0x2a, 'byte')).toBe('$2A');
    expect(formatLoweredNumber(0x2a, 'word')).toBe('$002A');
    expect(formatLoweredNumber(0x1234, 'auto')).toBe('$1234');
    expect(formatLoweredNumber(-1, 'word')).toBe('$FFFF');
  });

  it('keeps unresolved symbolic expressions in ASM80-compatible form', () => {
    const expression: Expression = {
      kind: 'binary',
      operator: '+',
      left: { kind: 'symbol', name: 'TARGET' },
      right: { kind: 'number', value: 2 },
    };

    expect(formatExpression(expression, context({}), 'word')).toBe('TARGET+$0002');
  });

  it('evaluates constants, layout sizes, and offsets before formatting', () => {
    const layouts: readonly (readonly [string, LayoutRecord])[] = [
      [
        'Sprite',
        {
          kind: 'record',
          fields: [
            { name: 'x', size: 1, typeExpr: { name: 'byte' } },
            { name: 'addr', size: 2, typeExpr: { name: 'word' } },
          ],
          span,
        },
      ],
    ];
    const evalContext = context({
      constants: [['VALUE', 0x20]],
      layouts,
    });

    expect(
      formatExpression(
        {
          kind: 'binary',
          operator: '+',
          left: { kind: 'symbol', name: 'VALUE' },
          right: { kind: 'sizeof', typeExpr: { name: 'Sprite' } },
        },
        evalContext,
        'byte',
      ),
    ).toBe('$23');
    expect(
      evaluateLoweredConstant(
        {
          kind: 'offset',
          typeExpr: { name: 'Sprite' },
          path: [{ kind: 'field', name: 'addr' }],
        },
        evalContext,
      ),
    ).toBe(1);
  });

  it('uses resolved labels for LSB and MSB byte functions', () => {
    const evalContext = context({
      constants: [['VALUE', 0xabcd]],
      symbols: [['target', 0x1234]],
    });

    expect(
      formatExpression(
        { kind: 'byte-function', function: 'LSB', expression: { kind: 'symbol', name: 'VALUE' } },
        evalContext,
        'byte',
      ),
    ).toBe('$CD');
    expect(
      formatExpression(
        { kind: 'byte-function', function: 'MSB', expression: { kind: 'symbol', name: 'target' } },
        evalContext,
        'byte',
      ),
    ).toBe('$12');
  });
});
