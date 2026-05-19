import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';

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

  it('rejects named section blocks in AZM-native source', async () => {
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
          message: expect.stringContaining('Named section blocks are not supported in AZM-native source'),
        }),
      );
    } finally {
      cleanup();
    }
  });
});
