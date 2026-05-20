import { describe, expect, it } from 'vitest';

import { parseClassicSource } from '../../src/frontend/asm80/parseClassicSource.js';
import type { ClassicItemNode } from '../../src/frontend/ast.js';
import { buildDirectiveAliasPolicy } from '../../src/frontend/directiveAliases.js';

const azmAliases = buildDirectiveAliasPolicy('azm');

describe('classic ASM80 source parser', () => {
  it('maps classic lines into source-ordered AST items and stops at .end', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseClassicSource(
      '/classic.z80',
      [
        'BASE: .equ 0C000H',
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
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(sourceFile.items.map((item: ClassicItemNode) => item.kind)).toEqual([
      'ClassicEqu',
      'ClassicOrg',
      'AsmLabel',
      'AsmInstruction',
      'AsmInstruction',
      'ClassicRawData',
      'ClassicRawData',
      'ClassicEnd',
    ]);
    expect(sourceFile.items.map((item: ClassicItemNode) => ('name' in item ? item.name : undefined))).toEqual([
      'BASE',
      undefined,
      'start',
      undefined,
      undefined,
      'table',
      '',
      undefined,
    ]);
    expect(sourceFile.items[3]).toMatchObject({ kind: 'AsmInstruction', head: 'ld', operandText: 'a, 0FFH' });
    expect(sourceFile.items[5]).toMatchObject({
      kind: 'ClassicRawData',
      name: 'table',
      directive: 'db',
      valuesText: '"OK",0',
    });
    expect(sourceFile.items[6]).toMatchObject({
      kind: 'ClassicRawData',
      name: '',
      directive: 'dw',
      valuesText: 'start',
    });
  });

  it('keeps commas inside quoted db strings', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseClassicSource(
      '/classic.z80',
      '.db "A,B",0\n',
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(sourceFile.items[0]).toMatchObject({
      kind: 'ClassicRawData',
      directive: 'db',
      valuesText: '"A,B",0',
      values: [{ kind: 'ClassicString', value: 'A,B' }, { kind: 'ImmLiteral', value: 0 }],
    });
  });

  it('parses single-quoted raw data characters as immediates', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseClassicSource(
      '/classic.z80',
      ".dw 'A'\n",
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(sourceFile.items[0]).toMatchObject({
      kind: 'ClassicRawData',
      directive: 'dw',
      valuesText: "'A'",
      values: [{ kind: 'ImmLiteral', value: 0x41 }],
    });
  });

  it('keeps post-end binary range directives while ignoring ordinary post-end source', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseClassicSource(
      '/classic.z80',
      ['.org 0100H', '.db 1', '.end', 'after: nop', '.binfrom 0100H', '.binto 0101H'].join('\n'),
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(sourceFile.items.map((item: ClassicItemNode) => item.kind)).toEqual([
      'ClassicOrg',
      'ClassicRawData',
      'ClassicEnd',
      'ClassicBinFrom',
      'ClassicBinTo',
    ]);
  });

  it('parses classic ds size and optional fill values', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseClassicSource(
      '/classic.z80',
      ['buf: ds 2,0FFH', 'tail: .ds 1'].join('\n'),
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(sourceFile.items.filter((item) => (item as { kind: string }).kind === 'ClassicRawData')).toMatchObject([
      {
        kind: 'ClassicRawData',
        name: 'buf',
        directive: 'ds',
        size: { kind: 'ImmLiteral', value: 2 },
        fill: { kind: 'ImmLiteral', value: 0xff },
      },
      {
        kind: 'ClassicRawData',
        name: 'tail',
        directive: 'ds',
        size: { kind: 'ImmLiteral', value: 1 },
      },
    ]);
  });

  it('rejects non-baseline dialect aliases with canonical directive guidance', () => {
    const diagnostics: { message: string; line?: number; column?: number }[] = [];
    const sourceFile = parseClassicSource(
      '/classic.z80',
      ['DEFB_LABEL: DEFB 1,2', 'DEFW_LABEL: defw 1234H', 'RMB_LABEL: RMB 8'].join('\n'),
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(sourceFile.items).toMatchObject([
      { kind: 'AsmLabel', name: 'DEFB_LABEL' },
      { kind: 'AsmLabel', name: 'DEFW_LABEL' },
      { kind: 'AsmLabel', name: 'RMB_LABEL' },
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'DEFB is not part of the supported ASM80 baseline; use DB.',
      'DEFW is not part of the supported ASM80 baseline; use DW.',
      'RMB is not part of the supported ASM80 baseline; use DS.',
    ]);
    expect(diagnostics.map((diagnostic) => [diagnostic.line, diagnostic.column])).toEqual([
      [1, 13],
      [2, 13],
      [3, 12],
    ]);
  });

  it('rejects unsupported ASM80 directives before they reach instruction encoding', () => {
    const diagnostics: { message: string; line?: number; column?: number }[] = [];
    const sourceFile = parseClassicSource(
      '/classic.z80',
      ['.macro FOO', 'incbin_label: .incbin "data.bin"', 'pragma_label: .pragma anything'].join('\n'),
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(sourceFile.items).toMatchObject([
      { kind: 'AsmLabel', name: 'incbin_label' },
      { kind: 'AsmLabel', name: 'pragma_label' },
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'Unsupported ASM80 directive ".macro". The supported baseline intentionally excludes macros and non-corpus directives.',
      'Unsupported ASM80 directive ".incbin". The supported baseline intentionally excludes macros and non-corpus directives.',
      'Unsupported ASM80 directive ".pragma". The supported baseline intentionally excludes macros and non-corpus directives.',
    ]);
    expect(diagnostics.map((diagnostic) => [diagnostic.line, diagnostic.column])).toEqual([
      [1, 2],
      [2, 16],
      [3, 16],
    ]);
  });

  it('does not let post-end string equates affect pre-end raw data', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseClassicSource(
      '/classic.z80',
      ['.db MSG', '.end', 'MSG: .equ "XY"'].join('\n'),
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(sourceFile.items[0]).toMatchObject({
      kind: 'ClassicRawData',
      directive: 'db',
      values: [{ kind: 'ImmName', name: 'MSG' }],
    });
  });

  it('parses MON3 db string fragments without splitting quoted contents', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseClassicSource(
      '/classic.z80',
      [
        '.db "Enter ",0',
        ".db '<_>?)!@#$%^&*( : +|'",
        '.db "2025.16"',
        '.db "A,B",0',
        '.db "a"-"A"',
      ].join('\n'),
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(sourceFile.items).toMatchObject([
      {
        kind: 'ClassicRawData',
        directive: 'db',
        valuesText: '"Enter ",0',
        values: [{ kind: 'ClassicString', value: 'Enter ' }, { kind: 'ImmLiteral', value: 0 }],
      },
      {
        kind: 'ClassicRawData',
        directive: 'db',
        valuesText: "'<_>?)!@#$%^&*( : +|'",
        values: [{ kind: 'ClassicString', value: '<_>?)!@#$%^&*( : +|' }],
      },
      {
        kind: 'ClassicRawData',
        directive: 'db',
        valuesText: '"2025.16"',
        values: [{ kind: 'ClassicString', value: '2025.16' }],
      },
      {
        kind: 'ClassicRawData',
        directive: 'db',
        valuesText: '"A,B",0',
        values: [{ kind: 'ClassicString', value: 'A,B' }, { kind: 'ImmLiteral', value: 0 }],
      },
      {
        kind: 'ClassicRawData',
        directive: 'db',
        valuesText: '"a"-"A"',
        values: [
          {
            kind: 'ImmBinary',
            op: '-',
            left: { kind: 'ImmLiteral', value: 97 },
            right: { kind: 'ImmLiteral', value: 65 },
          },
        ],
      },
    ]);
  });

  it('expands multi-character string equates in db values', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseClassicSource(
      '/classic.z80',
      ['.db REL_TXT,0', 'REL_TXT: .equ "2025.16"'].join('\n'),
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(sourceFile.items).toMatchObject([
      {
        kind: 'ClassicRawData',
        directive: 'db',
        values: [{ kind: 'ClassicString', value: '2025.16' }, { kind: 'ImmLiteral', value: 0 }],
      },
      {
        kind: 'ClassicEqu',
        name: 'REL_TXT',
        exprText: '"2025.16"',
      },
    ]);
  });
});
