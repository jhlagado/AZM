import { describe, expect, it } from 'vitest';

import { parseSourceFile } from '../../src/frontend/parser.js';
import type { SourceItemNode } from '../../src/frontend/ast.js';
import { buildDirectiveAliasPolicy } from '../../src/frontend/directiveAliases.js';

const azmAliases = buildDirectiveAliasPolicy('azm');

function parseAsmFile(
  path: string,
  source: string,
  diagnostics: never[],
  _sourceFile?: unknown,
  _aliasPolicy = azmAliases,
) {
  return parseSourceFile(path, source, diagnostics, undefined, azmAliases);
}

describe('ASM80 source parser', () => {
  it('maps ASM lines into source-ordered AST items and stops at .end', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseAsmFile(
      '/asm.z80',
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
    expect(sourceFile.items.map((item: SourceItemNode) => item.kind)).toEqual([
      'AsmEqu',
      'AsmOrg',
      'AsmLabel',
      'AsmInstruction',
      'AsmInstruction',
      'AsmLabel',
      'AsmRawData',
      'AsmRawData',
      'AsmEnd',
    ]);
    expect(sourceFile.items.map((item: SourceItemNode) => ('name' in item ? item.name : undefined))).toEqual([
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
    expect(sourceFile.items[3]).toMatchObject({ kind: 'AsmInstruction', head: 'ld' });
    expect(sourceFile.items[6]).toMatchObject({
      kind: 'AsmRawData',
      name: undefined,
      directive: 'db',
      valuesText: '"OK",0',
    });
    expect(sourceFile.items[7]).toMatchObject({
      kind: 'AsmRawData',
      name: undefined,
      directive: 'dw',
      valuesText: 'start',
    });
  });

  it('keeps commas inside quoted db strings', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseAsmFile(
      '/asm.z80',
      '.db "A,B",0\n',
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(sourceFile.items[0]).toMatchObject({
      kind: 'AsmRawData',
      directive: 'db',
      valuesText: '"A,B",0',
      values: [{ kind: 'AsmString', value: 'A,B' }, { kind: 'ImmLiteral', value: 0 }],
    });
  });

  it('parses single-quoted raw data characters as immediates', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseAsmFile(
      '/asm.z80',
      ".dw 'A'\n",
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(sourceFile.items[0]).toMatchObject({
      kind: 'AsmRawData',
      directive: 'dw',
      valuesText: "'A'",
      values: [{ kind: 'ImmLiteral', value: 0x41 }],
    });
  });

  it('keeps post-end binary range directives while ignoring ordinary post-end source', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseAsmFile(
      '/asm.z80',
      ['.org 0100H', '.db 1', '.end', 'after: nop', '.binfrom 0100H', '.binto 0101H'].join('\n'),
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(sourceFile.items.map((item: SourceItemNode) => item.kind)).toEqual([
      'AsmOrg',
      'AsmRawData',
      'AsmEnd',
      'AsmBinFrom',
      'AsmBinTo',
    ]);
  });

  it('parses ASM ds size and optional fill values', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseAsmFile(
      '/asm.z80',
      ['buf: ds 2,0FFH', 'tail: .ds 1'].join('\n'),
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(sourceFile.items.filter((item) => (item as { kind: string }).kind === 'AsmRawData')).toMatchObject([
      {
        kind: 'AsmRawData',
        name: 'buf',
        directive: 'ds',
        size: { kind: 'ImmLiteral', value: 2 },
        fill: { kind: 'ImmLiteral', value: 0xff },
      },
      {
        kind: 'AsmRawData',
        name: 'tail',
        directive: 'ds',
        size: { kind: 'ImmLiteral', value: 1 },
      },
    ]);
  });

  it('rejects non-baseline dialect aliases with canonical directive guidance', () => {
    const diagnostics: { message: string; line?: number; column?: number }[] = [];
    const sourceFile = parseAsmFile(
      '/asm.z80',
      ['DEFB_LABEL: DEFB 1,2', 'DEFW_LABEL: defw 1234H', 'RMB_LABEL: RMB 8'].join('\n'),
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(sourceFile.items).toEqual([]);
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
    const sourceFile = parseAsmFile(
      '/asm.z80',
      ['.macro FOO', 'incbin_label: .incbin "data.bin"', 'pragma_label: .pragma anything'].join('\n'),
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(sourceFile.items).toEqual([]);
    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'Unsupported ASM80 directive ".macro".',
      'Unsupported ASM80 directive ".incbin".',
      'Unsupported ASM80 directive ".pragma".',
    ]);
    expect(diagnostics.map((diagnostic) => [diagnostic.line, diagnostic.column])).toEqual([
      [1, 2],
      [2, 1],
      [3, 1],
    ]);
  });

  it('does not let post-end string equates affect pre-end raw data', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseAsmFile(
      '/asm.z80',
      ['.db MSG', '.end', 'MSG: .equ "XY"'].join('\n'),
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(sourceFile.items[0]).toMatchObject({
      kind: 'AsmRawData',
      directive: 'db',
      values: [{ kind: 'ImmName', name: 'MSG' }],
    });
  });

  it('parses MON3 db string fragments without splitting quoted contents', () => {
    const diagnostics: unknown[] = [];
    const sourceFile = parseAsmFile(
      '/asm.z80',
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
        kind: 'AsmRawData',
        directive: 'db',
        valuesText: '"Enter ",0',
        values: [{ kind: 'AsmString', value: 'Enter ' }, { kind: 'ImmLiteral', value: 0 }],
      },
      {
        kind: 'AsmRawData',
        directive: 'db',
        valuesText: "'<_>?)!@#$%^&*( : +|'",
        values: [{ kind: 'AsmString', value: '<_>?)!@#$%^&*( : +|' }],
      },
      {
        kind: 'AsmRawData',
        directive: 'db',
        valuesText: '"2025.16"',
        values: [{ kind: 'AsmString', value: '2025.16' }],
      },
      {
        kind: 'AsmRawData',
        directive: 'db',
        valuesText: '"A,B",0',
        values: [{ kind: 'AsmString', value: 'A,B' }, { kind: 'ImmLiteral', value: 0 }],
      },
      {
        kind: 'AsmRawData',
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
    const sourceFile = parseAsmFile(
      '/asm.z80',
      ['.db REL_TXT,0', 'REL_TXT: .equ "2025.16"'].join('\n'),
      diagnostics as never[],
      undefined,
      azmAliases,
    );

    expect(diagnostics).toEqual([]);
    expect(sourceFile.items).toMatchObject([
      {
        kind: 'AsmRawData',
        directive: 'db',
        values: [{ kind: 'AsmString', value: '2025.16' }, { kind: 'ImmLiteral', value: 0 }],
      },
      {
        kind: 'AsmEqu',
        name: 'REL_TXT',
        exprText: '"2025.16"',
      },
    ]);
  });
});
