import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { writeBin } from '../../src/formats/writeBin.js';
import { parseClassicSourceFile } from '../../src/frontend/asm80/parseClassicSource.js';
import type { ImmExprNode, ProgramNode, SourceSpan } from '../../src/frontend/ast.js';
import { emitProgram } from '../../src/lowering/emit.js';
import { buildEnv } from '../../src/semantics/env.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';
import type { Asm80Artifact } from '../../src/formats/types.js';

const file = '/fixtures/asm80/directives.z80';

function span(line: number): SourceSpan {
  return {
    file,
    start: { line, column: 1, offset: line - 1 },
    end: { line, column: 1, offset: line - 1 },
  };
}

function lit(value: number, line = 1): ImmExprNode {
  return { kind: 'ImmLiteral', span: span(line), value };
}

function name(value: string, line = 1): ImmExprNode {
  return { kind: 'ImmName', span: span(line), name: value };
}

function current(line = 1): ImmExprNode {
  return { kind: 'ImmCurrentLocation', span: span(line) };
}

function binary(
  op: Extract<ImmExprNode, { kind: 'ImmBinary' }>['op'],
  left: ImmExprNode,
  right: ImmExprNode,
  line = 1,
): ImmExprNode {
  return { kind: 'ImmBinary', span: span(line), op, left, right };
}

function program(items: unknown[]): ProgramNode {
  return {
    kind: 'Program',
    span: span(1),
    entryFile: file,
    files: [
      {
        kind: 'SourceFile',
        span: span(1),
        path: file,
        items: items as ProgramNode['files'][number]['items'],
      },
    ],
  };
}

function emitBytes(items: unknown[]): { bytes: number[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const ast = program(items);
  const env = buildEnv(ast, diagnostics);
  const emitted = emitProgram(ast, env, diagnostics);
  const bin = writeBin(emitted.map, emitted.symbols);
  return { bytes: [...bin.bytes], diagnostics };
}

describe('asm80 directive lowering integration', () => {
  it('compiles EX AF,AF prime with a trailing comment', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-af-prime-'));
    const entry = join(dir, 'af-prime.z80');
    writeFileSync(
      entry,
      ['.org 0100H', "ex af,af'           ;start saving registers"].join('\n'),
      'utf8',
    );

    const res = await compile(entry, { sourceMode: 'asm80' }, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0x08]);
  });

  it('lowers equ, org, db strings, dw labels, and binfrom into a flat binary', () => {
    const { bytes, diagnostics } = emitBytes([
      { kind: 'ClassicEqu', span: span(1), name: 'BASE', value: lit(0x0100, 1) },
      { kind: 'ClassicOrg', span: span(2), value: name('base', 2) },
      { kind: 'AsmLabel', span: span(3), name: 'start' },
      {
        kind: 'AsmInstruction',
        span: span(4),
        head: 'jp',
        operands: [{ kind: 'Imm', span: span(4), expr: name('start', 4) }],
      },
      { kind: 'AsmLabel', span: span(5), name: 'msg' },
      {
        kind: 'ClassicRawData',
        span: span(6),
        directive: 'db',
        values: [{ kind: 'ClassicString', value: 'A' }, lit(0, 6)],
      },
      { kind: 'AsmLabel', span: span(7), name: 'ptr' },
      {
        kind: 'ClassicRawData',
        span: span(8),
        directive: 'dw',
        values: [name('start', 8)],
      },
      { kind: 'ClassicBinFrom', span: span(9), value: name('BASE', 9) },
      { kind: 'ClassicEnd', span: span(10) },
    ]);

    expect(diagnostics).toEqual([]);
    expect(bytes).toEqual([0xc3, 0x00, 0x01, 0x41, 0x00, 0x00, 0x01]);
  });

  it('honors post-end binfrom while ignoring ordinary post-end data', () => {
    const { bytes, diagnostics } = emitBytes([
      { kind: 'ClassicOrg', span: span(1), value: lit(0x0082, 1) },
      {
        kind: 'ClassicRawData',
        span: span(2),
        directive: 'db',
        values: [lit(0x7e, 2)],
      },
      { kind: 'ClassicEnd', span: span(3) },
      {
        kind: 'ClassicRawData',
        span: span(4),
        directive: 'db',
        values: [lit(0xff, 4)],
      },
      { kind: 'ClassicBinFrom', span: span(5), value: lit(0x0080, 5) },
    ]);

    expect(diagnostics).toEqual([]);
    expect(bytes).toEqual([0x00, 0x00, 0x7e]);
  });

  it('honors post-end binto as an inclusive binary upper bound', () => {
    const { bytes, diagnostics } = emitBytes([
      { kind: 'ClassicOrg', span: span(1), value: lit(0x4000, 1) },
      {
        kind: 'ClassicRawData',
        span: span(2),
        directive: 'db',
        values: [lit(1, 2), lit(2, 2), lit(3, 2), lit(4, 2)],
      },
      { kind: 'ClassicEnd', span: span(3) },
      { kind: 'ClassicBinFrom', span: span(4), value: lit(0x4001, 4) },
      { kind: 'ClassicBinTo', span: span(5), value: lit(0x4002, 5) },
    ]);

    expect(diagnostics).toEqual([]);
    expect(bytes).toEqual([2, 3]);
  });

  it('pads through binto when the upper bound extends past written bytes', () => {
    const { bytes, diagnostics } = emitBytes([
      { kind: 'ClassicOrg', span: span(1), value: lit(0x4000, 1) },
      {
        kind: 'ClassicRawData',
        span: span(2),
        directive: 'db',
        values: [lit(1, 2)],
      },
      { kind: 'ClassicBinFrom', span: span(3), value: lit(0x4000, 3) },
      { kind: 'ClassicBinTo', span: span(4), value: lit(0x4003, 4) },
    ]);

    expect(diagnostics).toEqual([]);
    expect(bytes).toEqual([1, 0, 0, 0]);
  });

  it('compiles undotted directives, ds fill, 0x literals, and binto from classic source', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-tec1g-directives-'));
    const entry = join(dir, 'tec1g-directives.z80');
    writeFileSync(
      entry,
      [
        'ORG 4000H',
        'API: EQU 0x10',
        'DB API',
        'DS 2,0FFH',
        'DB 4',
        'END',
        '.binfrom 4000H',
        '.binto 4002H',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(entry, { sourceMode: 'asm80' }, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0x10, 0xff, 0xff]);
  });

  it('loads project directive aliases without adding them to the canonical parser', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-project-directive-aliases-'));
    const entry = join(dir, 'project-aliases.z80');
    const aliases = join(dir, 'azm.aliases.json');
    writeFileSync(
      aliases,
      JSON.stringify(
        {
          extends: 'azm',
          directiveAliases: {
            BYTE: '.db',
            SPACE: '.ds',
            STARTAT: '.org',
            FINISH: '.end',
            FROM: '.binfrom',
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    writeFileSync(
      entry,
      ['STARTAT 4000H', 'BYTE 1', 'SPACE 1,0FEH', 'BYTE 2', 'FROM 4000H', 'FINISH'].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      { directiveAliasFiles: [aliases] },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([1, 0xfe, 2]);
  });

  it('compiles classic source without org from address zero', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-no-org-'));
    const entry = join(dir, 'no-org.z80');
    writeFileSync(entry, ['xor a', 'jr $', '.binto 0003H'].join('\n'), 'utf8');

    const res = await compile(entry, { sourceMode: 'asm80' }, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0xaf, 0x18, 0xfe, 0x00]);
  });

  it('resolves ASM80 current-location expressions in relative branches and raw words', () => {
    const { bytes, diagnostics } = emitBytes([
      { kind: 'ClassicOrg', span: span(1), value: lit(0x0100, 1) },
      {
        kind: 'AsmInstruction',
        span: span(2),
        head: 'jr',
        operands: [
          { kind: 'Imm', span: span(2), expr: name('z', 2) },
          { kind: 'Imm', span: span(2), expr: binary('+', current(2), lit(5, 2), 2) },
        ],
      },
      {
        kind: 'AsmInstruction',
        span: span(3),
        head: 'djnz',
        operands: [{ kind: 'Imm', span: span(3), expr: current(3) }],
      },
      {
        kind: 'ClassicRawData',
        span: span(4),
        directive: 'dw',
        values: [current(4)],
      },
      { kind: 'ClassicBinFrom', span: span(5), value: lit(0x0100, 5) },
    ]);

    expect(diagnostics).toEqual([]);
    expect(bytes).toEqual([0x28, 0x03, 0x10, 0xfe, 0x04, 0x01]);
  });

  it('compiles classic source current-location expressions in branches and raw words', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-current-location-'));
    const entry = join(dir, 'current-location.z80');
    writeFileSync(
      entry,
      ['.org 0100H', 'jr z,$+5', 'djnz $', '.dw $', '.binfrom 0100H', '.end'].join('\n'),
      'utf8',
    );

    const res = await compile(entry, { sourceMode: 'asm80' }, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0x28, 0x03, 0x10, 0xfe, 0x04, 0x01]);
  });

  it('treats classic JR and DJNZ numeric operands as absolute targets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-absolute-branches-'));
    const entry = join(dir, 'absolute-branches.z80');
    writeFileSync(
      entry,
      ['.org 0100H', 'jr 0104H', 'djnz 0106H', 'jr z,0108H', '.binfrom 0100H', '.end'].join('\n'),
      'utf8',
    );

    const res = await compile(entry, { sourceMode: 'asm80' }, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0x18, 0x02, 0x10, 0x02, 0x28, 0x02]);
  });

  it('rejects out-of-range classic numeric relative branch targets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-absolute-branch-oob-'));
    const entry = join(dir, 'absolute-branch-oob.z80');
    writeFileSync(entry, ['.org 0100H', 'jr 2', 'djnz 2', '.binfrom 0100H', '.end'].join('\n'), 'utf8');

    const res = await compile(entry, { sourceMode: 'asm80' }, { formats: defaultFormatWriters });

    expect(res.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('jr relative branch displacement out of range'),
        }),
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('djnz relative branch displacement out of range'),
        }),
      ]),
    );
  });

  it('compiles classic dollar-prefixed hex and RST trailing-H operands', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-hex-rst-'));
    const entry = join(dir, 'hex-rst.z80');
    writeFileSync(
      entry,
      ['.org 0100H', 'cp $FE', 'rst 20H', '.binfrom 0100H', '.end'].join('\n'),
      'utf8',
    );

    const res = await compile(entry, { sourceMode: 'asm80' }, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0xfe, 0xfe, 0xe7]);
  });

  it('compiles single-quoted character literals in raw words', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-word-char-'));
    const entry = join(dir, 'word-char.z80');
    writeFileSync(entry, ['.org 0100H', ".dw 'A'", '.binfrom 0100H', '.end'].join('\n'), 'utf8');

    const res = await compile(entry, { sourceMode: 'asm80' }, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0x41, 0x00]);
  });

  it('compiles classic IX/IY indexed memory operands', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-ixiy-indexed-'));
    const entry = join(dir, 'ixiy-indexed.z80');
    writeFileSync(
      entry,
      ['.org 0100H', 'ld a,(ix+0)', 'ld a,(iy+12)', '.binfrom 0100H', '.end'].join('\n'),
      'utf8',
    );

    const res = await compile(entry, { sourceMode: 'asm80' }, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0xdd, 0x7e, 0x00, 0xfd, 0x7e, 0x0c]);
  });

  it('compiles classic absolute 16-bit register stores', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-ld-mem-reg16-'));
    const entry = join(dir, 'ld-mem-reg16.z80');
    writeFileSync(
      entry,
      [
        'org 0100H',
        'PTR: equ 0900H',
        'ld (PTR),hl',
        'ld (PTR),bc',
        'ld (PTR),de',
        'ld (PTR),sp',
        'ld (PTR),ix',
        'ld (PTR),iy',
        'binfrom 0100H',
        'end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(entry, { sourceMode: 'asm80' }, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([
      0x22, 0x00, 0x09, 0xed, 0x43, 0x00, 0x09, 0xed, 0x53, 0x00, 0x09, 0xed, 0x73, 0x00, 0x09,
      0xdd, 0x22, 0x00, 0x09, 0xfd, 0x22, 0x00, 0x09,
    ]);
  });

  it('does not include trailing reserve-only classic DS in the loadable binary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-trailing-ds-'));
    const entry = join(dir, 'trailing-ds.asm');
    writeFileSync(
      entry,
      ['org 4000H', 'db 0AAH', 'RAM_START:', 'ds 4', 'RAM_END:', 'end'].join('\n'),
      'utf8',
    );

    const res = await compile(entry, { sourceMode: 'asm80' }, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0xaa]);
  });

  it('preserves reserve-only classic DS in emitted asm80', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-reserve-ds-asm80-'));
    const entry = join(dir, 'reserve-ds-asm80.asm');
    writeFileSync(
      entry,
      ['org 4000H', 'db 0AAH', 'RESERVE:', 'ds 2', 'db 055H', 'binfrom 4000H', 'end'].join('\n'),
      'utf8',
    );

    const res = await compile(entry, { sourceMode: 'asm80', emitAsm80: true }, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const asm80 = res.artifacts.find((a): a is Asm80Artifact => a.kind === 'asm80');
    expect(bin).toBeDefined();
    expect(asm80).toBeDefined();
    if (!bin || !asm80) throw new Error('missing artifacts');
    expect([...bin.bytes]).toEqual([0xaa, 0x00, 0x00, 0x55]);
    expect(asm80.text).toContain('DS $02');
  });

  it('compiles classic SRA A', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-sra-a-'));
    const entry = join(dir, 'sra-a.z80');
    writeFileSync(entry, ['org 0100H', 'SRA A', 'binfrom 0100H', 'end'].join('\n'), 'utf8');

    const res = await compile(entry, { sourceMode: 'asm80' }, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0xcb, 0x2f]);
  });

  it('reports diagnostics from classic ASM80 includes at the included file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-include-diag-'));
    const entry = join(dir, 'entry.z80');
    const child = join(dir, 'child.z80');
    writeFileSync(
      entry,
      ['.org 0100H', '.include "child.z80"', '.binfrom 0100H'].join('\n'),
      'utf8',
    );
    writeFileSync(child, ['.db 1', '.db BAD+'].join('\n'), 'utf8');

    const res = await compile(entry, { sourceMode: 'asm80' }, { formats: defaultFormatWriters });

    expect(res.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: child,
          line: 2,
        }),
      ]),
    );
  });

  it('emits parsed db string fragments and string-character expressions', () => {
    const diagnostics: Diagnostic[] = [];
    const module = parseClassicSourceFile(
      file,
      [
        '.org 0100H',
        '.db "Enter ",0',
        ".db '<_>?)!@#$%^&*( : +|'",
        '.db "2025.16"',
        '.db "A,B",0',
        '.db "a"-"A"',
        '.binfrom 0100H',
        '.end',
      ].join('\n'),
      diagnostics,
    );
    const ast: ProgramNode = {
      kind: 'Program',
      span: span(1),
      entryFile: file,
      files: [module],
    };
    const env = buildEnv(ast, diagnostics);
    const emitted = emitProgram(ast, env, diagnostics);
    const bin = writeBin(emitted.map, emitted.symbols);

    expect(diagnostics).toEqual([]);
    expect([...bin.bytes]).toEqual([
      ...Buffer.from('Enter ', 'ascii'),
      0,
      ...Buffer.from('<_>?)!@#$%^&*( : +|', 'ascii'),
      ...Buffer.from('2025.16', 'ascii'),
      ...Buffer.from('A,B', 'ascii'),
      0,
      0x20,
    ]);
  });
});
