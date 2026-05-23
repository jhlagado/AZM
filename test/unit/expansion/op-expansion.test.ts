import { describe, expect, it } from 'vitest';

import { collectOps, expandOpInvocation, parseOpInvocation } from '../../../src/expansion/op-expansion.js';
import type { Diagnostic } from '../../../src/model/diagnostic.js';

function line(text: string, lineNumber = 1) {
  return { sourceName: 'test.asm', line: lineNumber, text };
}

describe('op expansion unit surface', () => {
  it('collects zero-operand op declarations before top-level end', () => {
    const diagnostics: Diagnostic[] = [];
    const lines = [
      line('op nop()'),
      line('  nop'),
      line('end'),
      line('main:'),
      line('  nop'),
    ];
    const { ops, opLineIndexes } = collectOps(lines, diagnostics);

    expect(diagnostics).toEqual([]);
    expect([...opLineIndexes]).toEqual([0, 1, 2]);
    expect(ops.get('nop')).toMatchObject([
      {
        name: 'nop',
        params: [],
        body: [{ kind: 'source-items' }],
      },
    ]);
  });

  it('reports missing end for op declarations', () => {
    const diagnostics: Diagnostic[] = [];
    collectOps([line('op bad()'), line('  nop')], diagnostics);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'AZMN_PARSE',
        message: 'op bad missing end',
      }),
    ]);
  });

  it('parses op invocations with register and immediate operands', () => {
    expect(parseOpInvocation(line('swap A'))).toEqual({
      name: 'swap',
      operands: [{ kind: 'reg8', register: 'a', text: 'A' }],
    });
    expect(parseOpInvocation(line('load HL,1234H'))).toEqual({
      name: 'load',
      operands: [
        { kind: 'reg16', register: 'hl', text: 'HL' },
        { kind: 'imm', expression: { kind: 'number', value: 0x1234 }, text: '1234H' },
      ],
    });
  });

  it('expands a zero-operand op into instruction items', () => {
    const diagnostics: Diagnostic[] = [];
    const lines = [line('op halt()'), line('  halt'), line('end')];
    const { ops } = collectOps(lines, diagnostics);
    const invocation = parseOpInvocation(line('halt'));
    expect(invocation).toBeDefined();

    const expanded = expandOpInvocation(ops, ops.get('halt') ?? [], invocation!.operands, line('halt', 4), diagnostics);

    expect(diagnostics).toEqual([]);
    expect(expanded).toHaveLength(1);
    expect(expanded[0]).toMatchObject({
      kind: 'instruction',
      instruction: { mnemonic: 'halt' },
    });
  });
});
