import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/api-compile.js';
import type { Diagnostic } from '../../src/model/diagnostic.js';
import type { BinArtifact } from '../../src/outputs/types.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import { requireAsm80Artifact } from './asm80-artifact-helper.js';
import { requireBinArtifact } from './bin-artifact-helper.js';
import { compileAsm80Fixture } from './compile-fixture.js';

async function compileAsmLines(
  tempPrefix: string,
  fileName: string,
  lines: string[] | string,
  options: { emitAsm80?: boolean } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), tempPrefix));
  const entry = join(dir, fileName);
  writeFileSync(entry, Array.isArray(lines) ? lines.join('\n') : lines, 'utf8');
  return compile(
    entry,
    { emitBin: true, emitAsm80: options.emitAsm80 === true },
    { formats: defaultFormatWriters },
  );
}

function expectNoCompileErrors(diagnostics: readonly Diagnostic[]): void {
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
      ['.org 0100H', "ex af,af'           ;start saving registers", '.binfrom 0100H'].join('\n'),
    );

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(binArtifact(res.artifacts), [0x08]);
  });

  it('honors post-end binfrom while ignoring ordinary post-end data', async () => {
    const res = await compileAsmLines(
      'azm-asm80-post-end-binfrom-',
      'post-end-binfrom.z80',
      ['.org 0082H', '.db 07EH', '.end', '.db 0FFH', '.binfrom 0080H'].join('\n'),
    );

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(binArtifact(res.artifacts), [0x00, 0x00, 0x7e]);
  });

  it('honors post-end binto as an inclusive binary upper bound', async () => {
    const res = await compileAsmLines(
      'azm-asm80-post-end-binto-',
      'post-end-binto.z80',
      ['.org 4000H', '.db 1,2,3,4', '.end', '.binfrom 4001H', '.binto 4002H'].join('\n'),
    );

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(binArtifact(res.artifacts), [2, 3]);
  });

  it('compiles undotted directives, 0x literals, and binto from AZM source', async () => {
    const res = await compileAsmLines(
      'azm-asm80-tec1g-directives-',
      'tec1g-directives.z80',
      [
        'ORG 4000H',
        'API EQU 0x10',
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
            MYDB: '.db',
            MYDS: '.ds',
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
      ['STARTAT 4000H', 'MYDB 1', 'MYDS 1', 'MYDB 2', 'FROM 4000H', 'FINISH'].join('\n'),
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
        'ORG 0100H',
        'PTR EQU 0900H',
        'ld (PTR),hl',
        'ld (PTR),bc',
        'ld (PTR),de',
        'ld (PTR),sp',
        'ld (PTR),ix',
        'ld (PTR),iy',
        'BINFROM 0100H',
        'END',
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
      ['ORG 4000H', 'DB 0AAH', 'RAM_START:', 'DS 4', 'RAM_END:', 'END'].join('\n'),
    );

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(binArtifact(res.artifacts), [0xaa]);
  });

  it('preserves reserve-only ASM DS in emitted asm80', async () => {
    const artifacts = await compileAsm80Fixture(
      'azm-asm80-reserve-ds-asm80-',
      'reserve-ds-asm80.asm',
      ['ORG 4000H', 'DB 0AAH', 'RESERVE:', 'DS 2', 'DB 055H', 'BINFROM 4000H', 'END'],
    );
    const bin = requireBinArtifact(artifacts);
    const asm80 = requireAsm80Artifact(artifacts);
    expect([...bin.bytes]).toEqual([0xaa, 0x00, 0x00, 0x55]);
    expect(asm80.text).toContain('DS $02');
  });

  it('compiles ASM SRA A', async () => {
    const res = await compileAsmLines('azm-asm80-sra-a-', 'sra-a.z80', [
      'ORG 0100H',
      'SRA A',
      'BINFROM 0100H',
      'END',
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
          sourceName: child,
          line: 2,
        }),
      ]),
    );
  });

  it('emits parsed db string fragments and string-character expressions', async () => {
    const res = await compileAsmLines(
      'azm-asm80-db-strings-',
      'db-strings.z80',
      [
        '.org 0100H',
        '.db "Enter ",0',
        '.db "<_>?)!@#$%^&*( : +|\'"',
        '.db "2025.16"',
        '.db "A,B",0',
        ".db 'a' - 'A'",
        '.binfrom 0100H',
        '.end',
      ].join('\n'),
    );

    expectNoCompileErrors(res.diagnostics);
    expectBinBytes(binArtifact(res.artifacts), [
      ...Buffer.from('Enter ', 'ascii'),
      0,
      ...Buffer.from("<_>?)!@#$%^&*( : +|'", 'ascii'),
      ...Buffer.from('2025.16', 'ascii'),
      ...Buffer.from('A,B', 'ascii'),
      0,
      0x20,
    ]);
  });
});
