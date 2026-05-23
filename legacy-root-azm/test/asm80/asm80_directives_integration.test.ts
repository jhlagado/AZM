import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { writeBin } from '../../src/formats/writeBin.js';
import { parseSourceFile } from '../../src/frontend/parser.js';
import type { ImmExprNode, ProgramNode, SourceSpan } from '../../src/frontend/ast.js';
import { emitProgram } from '../../src/lowering/emit.js';
import { buildEnv } from '../../src/semantics/env.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';
import type { Asm80Artifact } from '../../src/formats/types.js';
import type { CompilerOptions } from '../../src/pipeline.js';

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

async function compileAsmLines(
  tempPrefix: string,
  fileName: string,
  lines: string[] | string,
  options: CompilerOptions = {},
) {
  const dir = mkdtempSync(join(tmpdir(), tempPrefix));
  const entry = join(dir, fileName);
  writeFileSync(entry, Array.isArray(lines) ? lines.join('\n') : lines, 'utf8');
  return compile(entry, options, { formats: defaultFormatWriters });
}

function expectNoCompileErrors(diagnostics: Diagnostic[]): void {
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
}

function expectBinBytes(artifact: BinArtifact | undefined, bytes: number[]): void {
  expect(artifact).toBeDefined();
  if (!artifact) throw new Error('missing bin artifact');
  expect([...artifact.bytes]).toEqual(bytes);
}

function binArtifact(
  artifacts: Awaited<ReturnType<typeof compile>>['artifacts'],
): BinArtifact | undefined {
  return artifacts.find((a): a is BinArtifact => a.kind === 'bin');
}

describe('asm80 directive lowering integration', () => {
  it('compiles EX AF,AF prime with a trailing comment', async () => {
    const res = await compileAsmLines(
      'azm-asm80-af-prime-',
      'af-prime.z80',
      ['.org 0100H', "ex af,af'           ;start saving registers"].join('\n'),
    );

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(binArtifact(res.artifacts), [0x08]);
  });

  it('lowers equ, org, db strings, dw labels, and binfrom into a flat binary', () => {
    const { bytes, diagnostics } = emitBytes([
      { kind: 'AsmEqu', span: span(1), name: 'BASE', value: lit(0x0100, 1) },
      { kind: 'AsmOrg', span: span(2), value: name('base', 2) },
      { kind: 'AsmLabel', span: span(3), name: 'start' },
      {
        kind: 'AsmInstruction',
        span: span(4),
        head: 'jp',
        operands: [{ kind: 'Imm', span: span(4), expr: name('start', 4) }],
      },
      { kind: 'AsmLabel', span: span(5), name: 'msg' },
      {
        kind: 'AsmRawData',
        span: span(6),
        directive: 'db',
        values: [{ kind: 'AsmString', value: 'A' }, lit(0, 6)],
      },
      { kind: 'AsmLabel', span: span(7), name: 'ptr' },
      {
        kind: 'AsmRawData',
        span: span(8),
        directive: 'dw',
        values: [name('start', 8)],
      },
      { kind: 'AsmBinFrom', span: span(9), value: name('BASE', 9) },
      { kind: 'AsmEnd', span: span(10) },
    ]);

    expect(diagnostics).toEqual([]);
    expect(bytes).toEqual([0xc3, 0x00, 0x01, 0x41, 0x00, 0x00, 0x01]);
  });

  it('honors post-end binfrom while ignoring ordinary post-end data', () => {
    const { bytes, diagnostics } = emitBytes([
      { kind: 'AsmOrg', span: span(1), value: lit(0x0082, 1) },
      {
        kind: 'AsmRawData',
        span: span(2),
        directive: 'db',
        values: [lit(0x7e, 2)],
      },
      { kind: 'AsmEnd', span: span(3) },
      {
        kind: 'AsmRawData',
        span: span(4),
        directive: 'db',
        values: [lit(0xff, 4)],
      },
      { kind: 'AsmBinFrom', span: span(5), value: lit(0x0080, 5) },
    ]);

    expect(diagnostics).toEqual([]);
    expect(bytes).toEqual([0x00, 0x00, 0x7e]);
  });

  it('honors post-end binto as an inclusive binary upper bound', () => {
    const { bytes, diagnostics } = emitBytes([
      { kind: 'AsmOrg', span: span(1), value: lit(0x4000, 1) },
      {
        kind: 'AsmRawData',
        span: span(2),
        directive: 'db',
        values: [lit(1, 2), lit(2, 2), lit(3, 2), lit(4, 2)],
      },
      { kind: 'AsmEnd', span: span(3) },
      { kind: 'AsmBinFrom', span: span(4), value: lit(0x4001, 4) },
      { kind: 'AsmBinTo', span: span(5), value: lit(0x4002, 5) },
    ]);

    expect(diagnostics).toEqual([]);
    expect(bytes).toEqual([2, 3]);
  });

  it('pads through binto when the upper bound extends past written bytes', () => {
    const { bytes, diagnostics } = emitBytes([
      { kind: 'AsmOrg', span: span(1), value: lit(0x4000, 1) },
      {
        kind: 'AsmRawData',
        span: span(2),
        directive: 'db',
        values: [lit(1, 2)],
      },
      { kind: 'AsmBinFrom', span: span(3), value: lit(0x4000, 3) },
      { kind: 'AsmBinTo', span: span(4), value: lit(0x4003, 4) },
    ]);

    expect(diagnostics).toEqual([]);
    expect(bytes).toEqual([1, 0, 0, 0]);
  });

  it('compiles undotted directives, 0x literals, and binto from AZM source', async () => {
    const res = await compileAsmLines(
      'azm-asm80-tec1g-directives-',
      'tec1g-directives.z80',
      [
        'ORG 4000H',
        'API: EQU 0x10',
        'DB API',
        'DS 2',
        'DB 4',
        'END',
        '.binfrom 4000H',
        '.binto 4002H',
      ].join('\n'),
    );

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(binArtifact(res.artifacts), [0x10, 0x00, 0x00]);
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
      ['STARTAT 4000H', 'BYTE 1', 'SPACE 1', 'BYTE 2', 'FROM 4000H', 'FINISH'].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      { directiveAliasFiles: [aliases] },
      { formats: defaultFormatWriters },
    );

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(binArtifact(res.artifacts), [1, 0, 2]);
  });

  it('compiles source without org from address zero', async () => {
    const res = await compileAsmLines('azm-asm80-no-org-', 'no-org.z80', [
      'xor a',
      'jr done',
      'done:',
      'ret',
      '.binto 0003H',
    ]);

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(binArtifact(res.artifacts), [0xaf, 0x18, 0x00, 0xc9]);
  });

  it('compiles ASM dollar-prefixed hex and RST trailing-H operands', async () => {
    const res = await compileAsmLines(
      'azm-asm80-hex-rst-',
      'hex-rst.z80',
      ['.org 0100H', 'cp $FE', 'rst 20H', '.binfrom 0100H', '.end'].join('\n'),
    );

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(binArtifact(res.artifacts), [0xfe, 0xfe, 0xe7]);
  });

  it('compiles single-quoted character literals in raw words', async () => {
    const res = await compileAsmLines('azm-asm80-word-char-', 'word-char.z80', [
      '.org 0100H',
      ".dw 'A'",
      '.binfrom 0100H',
      '.end',
    ]);

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(binArtifact(res.artifacts), [0x41, 0x00]);
  });

  it('compiles ASM IX/IY indexed memory operands', async () => {
    const res = await compileAsmLines(
      'azm-asm80-ixiy-indexed-',
      'ixiy-indexed.z80',
      ['.org 0100H', 'ld a,(ix+0)', 'ld a,(iy+12)', '.binfrom 0100H', '.end'].join('\n'),
    );

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(binArtifact(res.artifacts), [0xdd, 0x7e, 0x00, 0xfd, 0x7e, 0x0c]);
  });

  it('compiles ASM absolute 16-bit register stores', async () => {
    const res = await compileAsmLines(
      'azm-asm80-ld-mem-reg16-',
      'ld-mem-reg16.z80',
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
    );

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(
      binArtifact(res.artifacts),
      [
        0x22, 0x00, 0x09, 0xed, 0x43, 0x00, 0x09, 0xed, 0x53, 0x00, 0x09, 0xed, 0x73, 0x00, 0x09,
        0xdd, 0x22, 0x00, 0x09, 0xfd, 0x22, 0x00, 0x09,
      ],
    );
  });

  it('does not include trailing reserve-only ASM DS in the loadable binary', async () => {
    const res = await compileAsmLines(
      'azm-asm80-trailing-ds-',
      'trailing-ds.asm',
      ['org 4000H', 'db 0AAH', 'RAM_START:', 'ds 4', 'RAM_END:', 'end'].join('\n'),
    );

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(binArtifact(res.artifacts), [0xaa]);
  });

  it('preserves reserve-only ASM DS in emitted asm80', async () => {
    const res = await compileAsmLines(
      'azm-asm80-reserve-ds-asm80-',
      'reserve-ds-asm80.asm',
      ['org 4000H', 'db 0AAH', 'RESERVE:', 'ds 2', 'db 055H', 'binfrom 4000H', 'end'].join('\n'),
      { emitAsm80: true },
    );

    expectNoCompileErrors(res.diagnostics);
    const bin = binArtifact(res.artifacts);
    const asm80 = res.artifacts.find((a): a is Asm80Artifact => a.kind === 'asm80');
    expect(asm80).toBeDefined();
    if (!asm80) throw new Error('missing asm80 artifact');
    expectBinBytes(bin, [0xaa, 0x00, 0x00, 0x55]);
    expect(asm80.text).toContain('DS $02');
  });

  it('compiles ASM SRA A', async () => {
    const res = await compileAsmLines('azm-asm80-sra-a-', 'sra-a.z80', [
      'org 0100H',
      'SRA A',
      'binfrom 0100H',
      'end',
    ]);

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(binArtifact(res.artifacts), [0xcb, 0x2f]);
  });

  it('reports diagnostics from ASM80 includes at the included file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-include-diag-'));
    const entry = join(dir, 'entry.z80');
    const child = join(dir, 'child.z80');
    writeFileSync(
      entry,
      ['.org 0100H', '.include "child.z80"', '.binfrom 0100H'].join('\n'),
      'utf8',
    );
    writeFileSync(child, ['.db 1', '.db BAD+'].join('\n'), 'utf8');

    const res = await compile(entry, {}, { formats: defaultFormatWriters });

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
    const sourceFile = parseSourceFile(
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
      files: [sourceFile],
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
