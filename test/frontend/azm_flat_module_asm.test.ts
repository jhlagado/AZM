import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { Asm80Artifact, BinArtifact } from '../../src/formats/types.js';

function writeTempAzm(source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'azm-flat-module-'));
  const entry = join(dir, 'entry.azm');
  writeFileSync(entry, source, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('AZM flat module assembly', () => {
  it('parses labels and instructions at module scope', async () => {
    const { entry, cleanup } = writeTempAzm(
      ['main:', '  xor a', '  ret', ''].join('\n'),
    );

    try {
      const res = await compile(
        entry,
        { emitBin: true, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
      expect(bin).toBeDefined();
      expect(Array.from(bin!.bytes)).toContain(0xaf);
    } finally {
      cleanup();
    }
  });

  it('emits native flat source without hidden function frame artifacts', async () => {
    const { entry, cleanup } = writeTempAzm(
      ['main:', '  ld a,1', '  call helper', '  ret', 'helper:', '  xor a', '  ret', ''].join('\n'),
    );

    try {
      const res = await compile(
        entry,
        { emitAsm80: true, emitBin: true, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
      const asm = res.artifacts.find((a): a is Asm80Artifact => a.kind === 'asm80');
      expect(bin).toBeDefined();
      expect(asm).toBeDefined();
      expect(Array.from(bin!.bytes)).toEqual([0x3e, 0x01, 0xcd, 0x06, 0x00, 0xc9, 0xaf, 0xc9]);
      expect(asm!.text).toContain('main:');
      expect(asm!.text).toContain('helper:');
      expect(asm!.text).not.toContain('__azm_native__');
      expect(asm!.text).not.toContain('__azm_native_unused_epilogue');
      expect(asm!.text).not.toContain('__zax_epilogue');
      expect(asm!.text.toLowerCase()).not.toContain('push ix');
      expect(asm!.text.toLowerCase()).not.toContain('ld ix');
      expect(asm!.text.toLowerCase()).not.toContain('ld sp,ix');
      expect(asm!.text.toLowerCase()).not.toContain('pop ix');
    } finally {
      cleanup();
    }
  });

  it('rejects function declarations in AZM-native source', async () => {
    const { entry, cleanup } = writeTempAzm(['func main()', '  ret', 'end', ''].join('\n'));

    try {
      const res = await compile(
        entry,
        { emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('Function declarations are not supported in AZM-native source'),
        }),
      );
    } finally {
      cleanup();
    }
  });

  it('assembles module-scope org and data directives', async () => {
    const { entry, cleanup } = writeTempAzm(
      [
        'type Sprite',
        '  x: byte',
        '  y: byte',
        '  flags: byte',
        'end',
        '',
        'org $2000',
        'SPRITES:',
        '  ds sizeof(Sprite[16])',
        '',
        'org $0100',
        'main:',
        '  ld a,(<Sprite[16]>SPRITES[0].flags)',
        '  ret',
        '',
      ].join('\n'),
    );

    try {
      const res = await compile(
        entry,
        { emitBin: true, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
      expect(bin).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it('assembles dot-prefixed and bare flat data directives after org', async () => {
    const { entry, cleanup } = writeTempAzm(
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
    );

    try {
      const res = await compile(
        entry,
        { emitBin: true, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
      expect(bin).toBeDefined();
      const bytes = Array.from(bin!.bytes);
      expect(bytes.slice(0, 4)).toEqual([0x21, 0x00, 0x80, 0xc9]);
      expect(bytes.slice(-10)).toEqual([1, 2, 3, 0x34, 0x12, 0, 0, 0, 0, 0xff]);
    } finally {
      cleanup();
    }
  });

  it('assembles equ constants and directive spellings in flat source', async () => {
    const { entry, cleanup } = writeTempAzm(
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
    );

    try {
      const res = await compile(
        entry,
        { emitBin: true, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
      expect(bin).toBeDefined();
      expect(Array.from(bin!.bytes)).toEqual([0x42, 0x00, 0x60, 0, 0, 0x99]);
    } finally {
      cleanup();
    }
  });

  it('parses included inc files using the parent AZM native surface', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-flat-include-'));
    const entry = join(dir, 'entry.azm');
    const child = join(dir, 'child.inc');
    writeFileSync(entry, ['include "child.inc"', 'main:', '  ld hl,Table', '  ret', ''].join('\n'), 'utf8');
    writeFileSync(child, ['Table:', '  DB 1,2,3', ''].join('\n'), 'utf8');

    try {
      const res = await compile(
        entry,
        { emitBin: true, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
      expect(bin).toBeDefined();
      const bytes = Array.from(bin!.bytes);
      expect(bytes).toEqual([1, 2, 3, 0x21, 0x00, 0x00, 0xc9]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses AZM native org placement for included inc files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-flat-include-org-'));
    const entry = join(dir, 'entry.azm');
    const child = join(dir, 'child.inc');
    writeFileSync(
      entry,
      ['include "child.inc"', 'org $4000', 'main:', '  ld hl,Table', '  ret', ''].join('\n'),
      'utf8',
    );
    writeFileSync(child, ['org $8000', 'Table:', '  db 1,2,3', ''].join('\n'), 'utf8');

    try {
      const res = await compile(
        entry,
        { emitBin: true, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
      expect(bin).toBeDefined();
      const bytes = Array.from(bin!.bytes);
      expect(bytes.slice(0, 4)).toEqual([0x21, 0x00, 0x80, 0xc9]);
      expect(bytes.slice(-3)).toEqual([1, 2, 3]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('applies project directive aliases in AZM native flat source', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-flat-aliases-'));
    const entry = join(dir, 'entry.azm');
    const aliases = join(dir, 'azm.aliases.json');
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
    writeFileSync(entry, ['STARTAT $5000', 'Table:', '  BYTE 4,5', 'FINISH', ''].join('\n'), 'utf8');

    try {
      const res = await compile(
        entry,
        {
          directiveAliasFiles: [aliases],
          emitBin: true,
          emitHex: false,
          emitD8m: false,
          emitListing: false,
        },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
      expect(bin).toBeDefined();
      expect(Array.from(bin!.bytes)).toEqual([4, 5]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats old section blocks as unsupported AZM-native syntax', async () => {
    const { entry, cleanup } = writeTempAzm(
      ['section code text at $0000', 'main:', '  ret', 'end', ''].join('\n'),
    );

    try {
      const res = await compile(
        entry,
        { emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('Unsupported operand: code text at $0000'),
        }),
      );
    } finally {
      cleanup();
    }
  });
});
