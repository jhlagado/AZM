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

function expectLdHlImmediates(bin: BinArtifact | undefined, values: number[]): void {
  expect(bin).toBeDefined();
  if (!bin) throw new Error('missing bin artifact');
  const bytes = Array.from(bin.bytes);
  const actual: number[] = [];
  for (let index = 0; index < bytes.length - 2; index += 1) {
    if (bytes[index] === 0x21) {
      actual.push(bytes[index + 1]! | (bytes[index + 2]! << 8));
    }
  }
  expect(actual.slice(0, values.length)).toEqual(values);
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

  it('evaluates union size and zero-offset union fields in native AZM constants', async () => {
    const result = await compileSource('azm', [
      'type Pair',
      '  left: byte',
      '  right: byte',
      'end',
      '',
      'union Cell',
      '  raw: word',
      '  pair: Pair',
      '  tag: byte',
      'end',
      '',
      'const CELL_SIZE = sizeof(Cell)',
      'const RAW_OFFSET = offset(Cell, raw)',
      'const RIGHT_OFFSET = offset(Cell, pair.right)',
      '',
      'main:',
      '  ld hl,CELL_SIZE',
      '  ld hl,RAW_OFFSET',
      '  ld hl,RIGHT_OFFSET',
      '  ret',
      '',
    ]);

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expectLdHlImmediates(
      result.artifacts.find((a): a is BinArtifact => a.kind === 'bin'),
      [2, 0, 1],
    );
  });

  it('keeps non-power-of-two array element sizes exact in native AZM constants', async () => {
    const result = await compileSource('azm', [
      'type Tri',
      '  a: byte',
      '  b: byte',
      '  c: byte',
      'end',
      '',
      'type Row',
      '  cells: Tri[4]',
      '  tail: byte',
      'end',
      '',
      'const TRI_SIZE = sizeof(Tri)',
      'const THIRD_C = offset(Tri[4], [2].c)',
      'const TAIL = offset(Row, tail)',
      '',
      'main:',
      '  ld hl,TRI_SIZE',
      '  ld hl,THIRD_C',
      '  ld hl,TAIL',
      '  ret',
      '',
    ]);

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expectLdHlImmediates(
      result.artifacts.find((a): a is BinArtifact => a.kind === 'bin'),
      [3, 8, 12],
    );
  });

  it('evaluates native AZM constants from named constants and const expressions', async () => {
    const result = await compileSource('azm', [
      'const BASE = 4',
      'const STRIDE = 3',
      'const INDEX = BASE + 2',
      'const ADDRESS = $2000 + INDEX * STRIDE',
      '',
      'main:',
      '  ld hl,ADDRESS',
      '  ret',
      '',
    ]);

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expectLdHlImmediate(
      result.artifacts.find((a): a is BinArtifact => a.kind === 'bin'),
      0x2012,
    );
  });

  it('rejects legacy offsetof spelling in AZM-native source', async () => {
    const result = await compileSource('azm', [
      'type Sprite',
      '  x: byte',
      '  y: byte',
      'end',
      '',
      'const X = offsetof(Sprite, x)',
      '',
      'main:',
      '  ld hl,X',
      '  ret',
      '',
    ]);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/Invalid imm expression|Failed to evaluate const/i),
      }),
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
