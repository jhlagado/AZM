import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { Asm80Artifact, BinArtifact } from '../../src/formats/types.js';
import type { CompileResult, CompilerOptions } from '../../src/pipeline.js';
import { compileTempSource, withTempSource } from '../helpers/temp_source.js';

const binOnlyOptions = {
  emitBin: true,
  emitHex: false,
  emitD8m: false,
  emitListing: false,
} satisfies CompilerOptions;

const noArtifactOptions = {
  emitBin: false,
  emitHex: false,
  emitD8m: false,
  emitListing: false,
} satisfies CompilerOptions;

async function compileAsmSource(source: string, options: CompilerOptions): Promise<CompileResult> {
  return compileTempSource('asm-flat-source-', 'asm', source, options);
}

function expectNoErrorDiagnostics(result: CompileResult): void {
  expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
}

function binArtifact(result: CompileResult): BinArtifact | undefined {
  return result.artifacts.find((artifact): artifact is BinArtifact => artifact.kind === 'bin');
}

function asm80Artifact(result: CompileResult): Asm80Artifact | undefined {
  return result.artifacts.find((artifact): artifact is Asm80Artifact => artifact.kind === 'asm80');
}

describe('.asm source assembly', () => {
  it('parses labels and instructions at source-file top level', async () => {
    const res = await compileAsmSource(
      ['main:', '  xor a', '  ret', ''].join('\n'),
      binOnlyOptions,
    );

    expectNoErrorDiagnostics(res);
    const bin = binArtifact(res);
    expect(bin).toBeDefined();
    expect(Array.from(bin!.bytes)).toContain(0xaf);
  });

  it('emits .asm source as explicit labels and instructions', async () => {
    const res = await compileAsmSource(
      ['main:', '  ld a,1', '  call helper', '  ret', 'helper:', '  xor a', '  ret', ''].join('\n'),
      { ...binOnlyOptions, emitAsm80: true },
    );

    expectNoErrorDiagnostics(res);
    const bin = binArtifact(res);
    const asm = asm80Artifact(res);
    expect(bin).toBeDefined();
    expect(asm).toBeDefined();
    expect(Array.from(bin!.bytes)).toEqual([0x3e, 0x01, 0xcd, 0x06, 0x00, 0xc9, 0xaf, 0xc9]);
    expect(asm!.text).toContain('main:');
    expect(asm!.text).toContain('helper:');
    expect(asm!.text.toLowerCase()).not.toContain('push ix');
    expect(asm!.text.toLowerCase()).not.toContain('ld ix');
    expect(asm!.text.toLowerCase()).not.toContain('ld sp,ix');
    expect(asm!.text.toLowerCase()).not.toContain('pop ix');
  });

  it('treats unknown top-level text as unsupported assembler syntax', async () => {
    const res = await compileAsmSource(
      ['not_an_instruction %%%', 'main:', '  ret', ''].join('\n'),
      noArtifactOptions,
    );

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Unsupported operand: %%%'),
      }),
    );
  });

  it('assembles top-level org and data directives', async () => {
    const res = await compileAsmSource(
      [
        '.type Sprite',
        'x     .byte',
        'y     .byte',
        'flags .byte',
        '.endtype',
        '',
        'org $2000',
        'SPRITES:',
        '  ds Sprite[16]',
        '',
        'org $0100',
        'main:',
        '  ld a,(<Sprite[16]>SPRITES[0].flags)',
        '  ret',
        '',
      ].join('\n'),
      binOnlyOptions,
    );

    expectNoErrorDiagnostics(res);
    expect(binArtifact(res)).toBeDefined();
  });

  it('assembles dot-prefixed and bare flat data directives after org', async () => {
    const res = await compileAsmSource(
      [
        'org $8000',
        'TableA:',
        '  .db 1,2,3',
        'TableB:',
        '  dw $1234',
        'Space:',
        '  ds 4',
        '  db $ff',
        '',
        'org $4000',
        'main:',
        '  ld hl,TableA',
        '  ret',
        '',
      ].join('\n'),
      binOnlyOptions,
    );

    expectNoErrorDiagnostics(res);
    const bin = binArtifact(res);
    expect(bin).toBeDefined();
    const bytes = Array.from(bin!.bytes);
    expect(bytes.slice(0, 4)).toEqual([0x21, 0x00, 0x80, 0xc9]);
    expect(bytes.slice(-10)).toEqual([1, 2, 3, 0x34, 0x12, 0, 0, 0, 0, 0xff]);
  });

  it('assembles equ constants and directive spellings in flat source', async () => {
    const res = await compileAsmSource(
      [
        '.org $6000',
        'BASE: equ $42',
        'Table:',
        '  DB BASE',
        '  DW Table',
        '  DS 2',
        '  DB $99',
        '',
      ].join('\n'),
      binOnlyOptions,
    );

    expectNoErrorDiagnostics(res);
    const bin = binArtifact(res);
    expect(bin).toBeDefined();
    expect(Array.from(bin!.bytes)).toEqual([0x42, 0x00, 0x60, 0, 0, 0x99]);
  });

  it('parses included inc files using the parent assembler surface', async () => {
    await withTempSource(
      'asm-flat-include-',
      'asm',
      ['include "child.inc"', 'main:', '  ld hl,Table', '  ret', ''].join('\n'),
      async (entry) => {
        writeFileSync(
          join(dirname(entry), 'child.inc'),
          ['Table:', '  DB 1,2,3', ''].join('\n'),
          'utf8',
        );
        const res = await compile(entry, binOnlyOptions, { formats: defaultFormatWriters });
        expectNoErrorDiagnostics(res);
        const bin = binArtifact(res);
        expect(bin).toBeDefined();
        const bytes = Array.from(bin!.bytes);
        expect(bytes).toEqual([1, 2, 3, 0x21, 0x00, 0x00, 0xc9]);
      },
    );
  });

  it('uses assembler org placement for included inc files', async () => {
    await withTempSource(
      'asm-flat-include-org-',
      'asm',
      ['include "child.inc"', 'org $4000', 'main:', '  ld hl,Table', '  ret', ''].join('\n'),
      async (entry) => {
        writeFileSync(
          join(dirname(entry), 'child.inc'),
          ['org $8000', 'Table:', '  db 1,2,3', ''].join('\n'),
          'utf8',
        );
        const res = await compile(entry, binOnlyOptions, { formats: defaultFormatWriters });
        expectNoErrorDiagnostics(res);
        const bin = binArtifact(res);
        expect(bin).toBeDefined();
        const bytes = Array.from(bin!.bytes);
        expect(bytes.slice(0, 4)).toEqual([0x21, 0x00, 0x80, 0xc9]);
        expect(bytes.slice(-3)).toEqual([1, 2, 3]);
      },
    );
  });

  it('applies project directive aliases in AZM .asm source', async () => {
    await withTempSource(
      'asm-flat-aliases-',
      'asm',
      ['STARTAT $5000', 'Table:', '  BYTE 4,5', 'FINISH', ''].join('\n'),
      async (entry) => {
        const aliases = join(dirname(entry), 'azm.aliases.json');
        writeFileSync(
          aliases,
          JSON.stringify(
            {
              directiveAliases: {
                BYTE: '.db',
                STARTAT: '.org',
                FINISH: '.end',
              },
            },
            null,
            2,
          ),
          'utf8',
        );
        const res = await compile(
          entry,
          {
            directiveAliasFiles: [aliases],
            ...binOnlyOptions,
          },
          { formats: defaultFormatWriters },
        );
        expectNoErrorDiagnostics(res);
        const bin = binArtifact(res);
        expect(bin).toBeDefined();
        expect(Array.from(bin!.bytes)).toEqual([4, 5]);
      },
    );
  });

  it('treats unknown directive-shaped text as unsupported assembler syntax', async () => {
    const res = await compileAsmSource(
      ['unknown_block text at $0000', 'main:', '  ret', ''].join('\n'),
      noArtifactOptions,
    );

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Unsupported operand: text at $0000'),
      }),
    );
  });
});
