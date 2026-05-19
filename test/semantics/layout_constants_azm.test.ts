import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';

function writeTempSource(ext: string, source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'azm-layout-constants-'));
  const entry = join(dir, `entry.${ext}`);
  writeFileSync(entry, source, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

async function compileSource(ext: string, lines: string[]) {
  const { entry, cleanup } = writeTempSource(ext, `${lines.join('\n')}\n`);
  try {
    return await compile(entry, {}, { formats: defaultFormatWriters });
  } finally {
    cleanup();
  }
}

function expectLdHlImmediate(bin: BinArtifact | undefined, value: number): void {
  expect(bin).toBeDefined();
  if (!bin) throw new Error('missing bin artifact');
  const bytes = Array.from(bin.bytes);
  const expected = [0x21, value & 0xff, (value >> 8) & 0xff];
  expect(bytes.some((_, index) => expected.every((byte, offset) => bytes[index + offset] === byte))).toBe(true);
}

describe('AZM layout constant subset', () => {
  it('evaluates exact sizeof for arrays of records', async () => {
    const result = await compileSource('azm', [
      'type Sprite',
      '  x: byte',
      '  y: byte',
      '  tile: byte',
      '  flags: byte',
      'end',
      '',
      'const SIZE = sizeof(Sprite[16])',
      '',
      'main:',
      '  ld hl,SIZE',
      '  ret',
      '',
    ]);

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expectLdHlImmediate(
      result.artifacts.find((a): a is BinArtifact => a.kind === 'bin'),
      64,
    );
  });

  it('evaluates offset for array element field paths', async () => {
    const result = await compileSource('azm', [
      'type Sprite',
      '  x: byte',
      '  y: byte',
      '  tile: byte',
      '  flags: byte',
      'end',
      '',
      'const OFFSET = offset(Sprite[16], [2].flags)',
      '',
      'main:',
      '  ld hl,OFFSET',
      '  ret',
      '',
    ]);

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expectLdHlImmediate(
      result.artifacts.find((a): a is BinArtifact => a.kind === 'bin'),
      11,
    );
  });

  it('rejects runtime registers in layout constant paths', async () => {
    const result = await compileSource('azm', [
      'type Sprite',
      '  x: byte',
      '  y: byte',
      'end',
      '',
      'const SPRITES = $2000',
      '',
      'main:',
      '  ld hl,<Sprite[16]>SPRITES[HL].x',
      '  ret',
      '',
    ]);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/runtime|not supported in AZM-native/i),
      }),
    );
  });
});
