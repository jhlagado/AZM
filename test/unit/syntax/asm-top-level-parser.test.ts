import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../../src/model/diagnostic.js';
import type { SourceItem } from '../../../src/model/source-item.js';
import {
  asmLine,
  azmDirectiveAliases,
  parseAsm80LineShape,
  parseAsm80Source,
} from './asm80-parse-helpers.js';
import { parseLogicalLine } from '../../../src/syntax/parse-line.js';

function parseAsmTopLevelLine(text: string): {
  readonly items: readonly SourceItem[];
  readonly diagnostics: readonly Diagnostic[];
} {
  return parseLogicalLine(asmLine(text), { directiveAliasPolicy: azmDirectiveAliases });
}

describe('ASM top-level line parser', () => {
  it('parses flat labels, data directives, and instructions in source order', () => {
    const table = parseAsmTopLevelLine('Table:');
    expect(table.diagnostics).toEqual([]);
    expect(table.items).toMatchObject([{ kind: 'label', name: 'Table' }]);

    const data = parseAsmTopLevelLine('  DB 1,2');
    expect(data.diagnostics).toEqual([]);
    expect(data.items).toMatchObject([
      {
        kind: 'db',
        values: [{ kind: 'number', value: 1 }, { kind: 'number', value: 2 }],
      },
    ]);

    const main = parseAsmTopLevelLine('main:');
    expect(main.diagnostics).toEqual([]);
    expect(main.items).toMatchObject([{ kind: 'label', name: 'main' }]);

    const xor = parseAsmTopLevelLine('  xor a');
    expect(xor.diagnostics).toEqual([]);
    expect(xor.items).toMatchObject([
      {
        kind: 'instruction',
        instruction: {
          mnemonic: 'xor',
          source: { kind: 'reg8', register: 'a' },
        },
      },
    ]);
  });

  it('reports unsupported assembler lines without partial instruction items', () => {
    const badOperand = parseAsmTopLevelLine('  hl ??? count');
    expect(badOperand.items).toEqual([]);
    expect(badOperand.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_PARSE',
        message: expect.stringMatching(/Unsupported operand: \?\?\? count|unsupported source line: hl \?\?\? count/),
      }),
    );

    const unknownHead = parseAsmTopLevelLine('unknown_head clear_a()');
    expect(unknownHead.items).toEqual([]);
    expect(unknownHead.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_PARSE',
        message: expect.stringMatching(
          /Unsupported operand: clear_a\(\)|unsupported source line: unknown_head clear_a\(\)/,
        ),
      }),
    );
  });

  it('maps the same surface through parseAsm80LineShape helpers', () => {
    expect(parseAsm80LineShape('Table:')).toEqual({ kind: 'label', name: 'Table' });
    expect(parseAsm80LineShape('  DB 1,2')).toEqual({
      kind: 'rawData',
      directive: 'db',
      valuesText: '1,2',
    });
    expect(parseAsm80LineShape('  xor a')).toEqual({
      kind: 'instruction',
      head: 'xor',
      operandText: 'a',
    });
  });

  it('keeps multi-line ASM80 sources ordered through parseNextSourceItems', () => {
    const { diagnostics, items } = parseAsm80Source(
      ['Table:', '  DB 1,2', 'main:', '  xor a', '  ret'].join('\n'),
    );

    expect(diagnostics).toEqual([]);
    expect(items.map((item) => item.kind)).toEqual([
      'label',
      'db',
      'label',
      'instruction',
      'instruction',
    ]);
    expect(items[0]).toMatchObject({ kind: 'label', name: 'Table' });
    expect(items[2]).toMatchObject({ kind: 'label', name: 'main' });
  });
});
