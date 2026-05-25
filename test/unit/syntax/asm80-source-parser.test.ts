import { describe, expect, it } from 'vitest';

import type { SourceItem } from '../../../src/model/source-item.js';
import {
  azmDirectiveAliases,
  parseAsm80Source,
  sourceItemKinds,
  sourceItemNames,
} from './asm80-parse-helpers.js';

describe('ASM80 source parser', () => {
  it('maps ASM lines into source-ordered items and stops at .end', () => {
    const { diagnostics, items } = parseAsm80Source(
      [
        'BASE .equ 0C000H',
        '.org BASE',
        'start:',
        '  ld a, 0FFH',
        '  jp start',
        'table:',
        '  .db "OK",0',
        '  .dw start',
        '.end',
        'after: nop',
      ].join('\n'),
    );

    expect(diagnostics).toEqual([]);
    expect(sourceItemKinds(items)).toEqual([
      'equ',
      'org',
      'label',
      'instruction',
      'instruction',
      'label',
      'db',
      'dw',
      'end',
    ]);
    expect(sourceItemNames(items)).toEqual([
      'BASE',
      undefined,
      'start',
      undefined,
      undefined,
      'table',
      undefined,
      undefined,
      undefined,
    ]);
    expect(items[3]).toMatchObject({
      kind: 'instruction',
      instruction: {
        mnemonic: 'ld',
        target: { kind: 'reg8', register: 'a' },
        source: { kind: 'imm', expression: { kind: 'number', value: 0xff } },
      },
    });
    expect(items[6]).toMatchObject({
      kind: 'db',
      values: [
        { kind: 'string-fragment', value: 'OK' },
        { kind: 'number', value: 0 },
      ],
    });
    expect(items[7]).toMatchObject({
      kind: 'dw',
      values: [{ kind: 'symbol', name: 'start' }],
    });
  });

  it('keeps commas inside quoted db strings', () => {
    const { diagnostics, items } = parseAsm80Source('.db "A,B",0\n');

    expect(diagnostics).toEqual([]);
    expect(items[0]).toMatchObject({
      kind: 'db',
      values: [
        { kind: 'string-fragment', value: 'A,B' },
        { kind: 'number', value: 0 },
      ],
    });
  });

  it('parses single-quoted raw data characters as immediates', () => {
    const { diagnostics, items } = parseAsm80Source(".dw 'A'\n");

    expect(diagnostics).toEqual([]);
    expect(items[0]).toMatchObject({
      kind: 'dw',
      values: [{ kind: 'number', value: 0x41 }],
    });
  });

  it('keeps post-end binary range directives while ignoring ordinary post-end source', () => {
    const { diagnostics, items } = parseAsm80Source(
      ['.org 0100H', '.db 1', '.end', 'after: nop', '.binfrom 0100H', '.binto 0101H'].join('\n'),
    );

    expect(diagnostics).toEqual([]);
    expect(sourceItemKinds(items)).toEqual(['org', 'db', 'end', 'binfrom', 'binto']);
  });

  it('parses ASM ds size and optional fill values', () => {
    const { diagnostics, items } = parseAsm80Source(['buf: DS 2,0FFH', 'tail: .ds 1'].join('\n'));

    expect(diagnostics).toEqual([]);
    expect(sourceItemKinds(items)).toEqual(['label', 'ds', 'label', 'ds']);
    expect(items.filter((item): item is Extract<SourceItem, { kind: 'ds' }> => item.kind === 'ds')).toMatchObject([
      {
        kind: 'ds',
        size: { kind: 'number', value: 2 },
        fill: { kind: 'number', value: 0xff },
      },
      {
        kind: 'ds',
        size: { kind: 'number', value: 1 },
      },
    ]);
  });

  it('rejects non-baseline dialect aliases instead of treating them as instructions', () => {
    const { diagnostics, items } = parseAsm80Source(
      ['DEFB_LABEL: DEFB 1,2', 'DEFW_LABEL: defw 1234H', 'RMB_LABEL: RMB 8'].join('\n'),
    );

    expect(items).toMatchObject([
      { kind: 'label', name: 'DEFB_LABEL' },
      { kind: 'label', name: 'DEFW_LABEL' },
      { kind: 'label', name: 'RMB_LABEL' },
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'unsupported source line: DEFB 1,2',
      'unsupported source line: defw 1234H',
      'unsupported source line: RMB 8',
    ]);
  });

  it('rejects unsupported dotted ASM80 directives before instruction encoding', () => {
    const { diagnostics, items } = parseAsm80Source(
      ['.macro FOO', 'incbin_label: .incbin "data.bin"', 'pragma_label: .pragma anything'].join('\n'),
    );

    expect(items).toMatchObject([
      { kind: 'label', name: 'incbin_label' },
      { kind: 'label', name: 'pragma_label' },
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'unsupported source line: .macro FOO',
      'unsupported source line: .incbin "data.bin"',
      'unsupported source line: .pragma anything',
    ]);
    expect(diagnostics.map((diagnostic) => [diagnostic.line, diagnostic.column])).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
  });

  it('does not let post-end string equates affect pre-end raw data', () => {
    const { diagnostics, items } = parseAsm80Source(['.db MSG', '.end', 'MSG .equ "XY"'].join('\n'));

    expect(diagnostics).toEqual([]);
    expect(items[0]).toMatchObject({
      kind: 'db',
      values: [{ kind: 'symbol', name: 'MSG' }],
    });
  });

  it('parses MON3 db string fragments without splitting quoted contents', () => {
    const { diagnostics, items } = parseAsm80Source(
      [
        '.db "Enter ",0',
        '.db "<_>?)!@#$%^&*( : +|\'"',
        '.db "2025.16"',
        '.db "A,B",0',
        ".db 'a' - 'A'",
      ].join('\n'),
    );

    expect(diagnostics).toEqual([]);
    expect(items).toMatchObject([
      {
        kind: 'db',
        values: [
          { kind: 'string-fragment', value: 'Enter ' },
          { kind: 'number', value: 0 },
        ],
      },
      {
        kind: 'db',
        values: [{ kind: 'string-fragment', value: "<_>?)!@#$%^&*( : +|'" }],
      },
      {
        kind: 'db',
        values: [{ kind: 'string-fragment', value: '2025.16' }],
      },
      {
        kind: 'db',
        values: [
          { kind: 'string-fragment', value: 'A,B' },
          { kind: 'number', value: 0 },
        ],
      },
      {
        kind: 'db',
        values: [
          {
            kind: 'binary',
            operator: '-',
            left: { kind: 'number', value: 97 },
            right: { kind: 'number', value: 65 },
          },
        ],
      },
    ]);
  });

  it('keeps forward string equate references as symbols at parse time', () => {
    const { diagnostics, items } = parseAsm80Source(
      ['.db REL_TXT,0', 'REL_TXT .equ "2025.16"'].join('\n'),
      azmDirectiveAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(items).toMatchObject([
      {
        kind: 'db',
        values: [{ kind: 'symbol', name: 'REL_TXT' }, { kind: 'number', value: 0 }],
      },
      {
        kind: 'equ',
        name: 'REL_TXT',
        stringValue: '2025.16',
      },
    ]);
  });
});
