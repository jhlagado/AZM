import { describe, expect, it } from 'vitest';

import { writeAsm80 } from '../../src/formats/writeAsm80.js';
import type { LoweredAsmProgram, LoweredEaExpr } from '../../src/lowering/loweredAsmTypes.js';

describe('writeAsm80', () => {
  it('formats lowered asm programs across expression and item variants', () => {
    const program: LoweredAsmProgram = {
      blocks: [
        {
          kind: 'absolute',
          origin: 0x1234,
          items: [
            { kind: 'label', name: 'start' },
            { kind: 'const', name: 'SYM0', value: { kind: 'symbol', name: 'BASE', addend: 0 } },
            { kind: 'const', name: 'SYMPLUS', value: { kind: 'symbol', name: 'BASE', addend: 2 } },
            {
              kind: 'const',
              name: 'SYMMINUS',
              value: { kind: 'symbol', name: 'BASE', addend: -0x100 },
            },
            {
              kind: 'const',
              name: 'NEGATED',
              value: { kind: 'unary', op: '~', expr: { kind: 'literal', value: 3 } },
            },
            {
              kind: 'const',
              name: 'COMPUTED',
              value: {
                kind: 'binary',
                op: '+',
                left: { kind: 'literal', value: 1 },
                right: { kind: 'literal', value: 0x200 },
              },
            },
            { kind: 'const', name: 'OPAQUE', value: { kind: 'opaque', text: 'HIGH(symbol)' } },
            { kind: 'comment', text: '   ', origin: 'user' },
            { kind: 'comment', text: 'keep this note', origin: 'user' },
            { kind: 'comment', text: 'generated note', origin: 'zax' },
            {
              kind: 'db',
              values: [
                { kind: 'literal', value: -2 },
                { kind: 'literal', value: -0x1234 },
                { kind: 'opaque', text: 'LOW(symbol)' },
              ],
            },
            {
              kind: 'dw',
              values: [
                {
                  kind: 'binary',
                  op: '<<',
                  left: { kind: 'literal', value: 1 },
                  right: { kind: 'literal', value: 8 },
                },
              ],
            },
            { kind: 'ds', size: { kind: 'literal', value: 4 } },
            {
              kind: 'ds',
              size: { kind: 'literal', value: 2 },
              fill: { kind: 'literal', value: 0xaa },
            },
            { kind: 'instr', head: '@raw', operands: [] },
            { kind: 'instr', head: '@raw', operands: [], bytes: [0x12, 0xab] },
            { kind: 'instr', head: 'RET', operands: [] },
            {
              kind: 'instr',
              head: 'MIXED',
              operands: [
                { kind: 'reg', name: 'A' },
                { kind: 'imm', expr: { kind: 'symbol', name: 'BASE', addend: 2 } },
                {
                  kind: 'ea',
                  expr: {
                    kind: 'add',
                    base: { kind: 'name', name: 'table' },
                    offset: { kind: 'literal', value: 1 },
                  },
                },
                {
                  kind: 'mem',
                  expr: {
                    kind: 'sub',
                    base: { kind: 'name', name: 'table' },
                    offset: { kind: 'literal', value: 2 },
                  },
                },
                {
                  kind: 'ea',
                  expr: { kind: 'imm', expr: { kind: 'literal', value: 0x20 } },
                },
                {
                  kind: 'portImm8',
                  expr: { kind: 'unary', op: '+', expr: { kind: 'literal', value: 7 } },
                },
                { kind: 'portC' },
              ],
            },
          ],
        },
      ],
    };

    const artifact = writeAsm80(program, { lineEnding: '\r\n' });

    expect(artifact.kind).toBe('asm80');
    expect(artifact.text).toBe(
      [
        '; ZAX lowered ASM80 output',
        '',
        'ORG $1234',
        'start:',
        'SYM0 EQU BASE',
        'SYMPLUS EQU BASE+$02',
        'SYMMINUS EQU BASE-$0100',
        'NEGATED EQU ~$03',
        'COMPUTED EQU ($01 + $0200)',
        'OPAQUE EQU HIGH(symbol)',
        '; keep this note',
        '; ZAX: generated note',
        'DB -$02, -$1234, LOW(symbol)',
        'DW ($01 << $08)',
        'DS $04',
        'DS $02, $AA',
        'DB $12, $AB',
        'ret',
        'mixed a, BASE+$02, table+$01, (table-$02), $20, (+$07), (c)',
        '',
      ].join('\r\n'),
    );
  });

  it('rejects unsupported effective-address shapes', () => {
    const baseProgram = (expr: LoweredEaExpr): LoweredAsmProgram => ({
      blocks: [
        {
          kind: 'absolute',
          origin: 0,
          items: [{ kind: 'instr', head: 'LD', operands: [{ kind: 'ea', expr }] }],
        },
      ],
    });

    expect(() =>
      writeAsm80(
        baseProgram({
          kind: 'field',
          base: { kind: 'name', name: 'record' },
          field: 'value',
        }),
      ),
    ).toThrow('ASM80 emitter cannot format lowered EA kind "field".');

    expect(() =>
      writeAsm80(
        baseProgram({
          kind: 'index',
          base: { kind: 'name', name: 'array' },
          index: { kind: 'reg8', reg: 'b' },
        }),
      ),
    ).toThrow('ASM80 emitter cannot format lowered EA kind "index".');

    expect(() =>
      writeAsm80(
        baseProgram({
          kind: 'reinterpret',
          typeName: 'byte',
          base: { kind: 'name', name: 'ptr' },
        }),
      ),
    ).toThrow('ASM80 emitter cannot format lowered EA kind "reinterpret".');
  });
});
