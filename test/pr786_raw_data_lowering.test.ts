import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact, D8mArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getSymbolAddress = (d8m: D8mArtifact, name: string): number => {
  const symbols = d8m.json.symbols as Array<{ name: string; address?: number }>;
  const found = symbols.find((s) => s.name === name);
  if (!found || found.address === undefined) {
    throw new Error(`Missing symbol ${name}`);
  }
  return found.address;
};

const getBinBase = (d8m: D8mArtifact): number => {
  const segments = d8m.json.segments as Array<{ start: number; end: number }>;
  return Math.min(...segments.map((s) => s.start));
};

describe('PR786 raw data lowering', () => {
  it('emits raw bytes/words/space and resolves fixups', async () => {
    const entry = join(__dirname, 'fixtures', 'pr786_raw_data_lowering.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(d8m).toBeDefined();
    expect(bin).toBeDefined();
    if (!d8m || !bin) throw new Error('missing artifacts');

    const table = getSymbolAddress(d8m, 'table');
    const words = getSymbolAddress(d8m, 'words');
    const gap = getSymbolAddress(d8m, 'gap');
    const ptrs = getSymbolAddress(d8m, 'ptrs');
    const handlerA = getSymbolAddress(d8m, 'handler_a');
    const handlerB = getSymbolAddress(d8m, 'handler_b');

    expect(table).toBe(0x0100);
    expect(words).toBe(0x0103);
    expect(gap).toBe(0x0107);
    expect(ptrs).toBe(0x0109);

    const base = getBinBase(d8m);
    const byteAt = (addr: number): number => bin.bytes[addr - base] ?? 0;
    const wordAt = (addr: number): number => byteAt(addr) | (byteAt(addr + 1) << 8);

    expect([byteAt(table), byteAt(table + 1), byteAt(table + 2)]).toEqual([1, 2, 3]);
    expect([byteAt(words), byteAt(words + 1), byteAt(words + 2), byteAt(words + 3)]).toEqual([
      0x34,
      0x12,
      0x78,
      0x56,
    ]);
    expect([byteAt(gap), byteAt(gap + 1)]).toEqual([0, 0]);
    expect(wordAt(ptrs)).toBe(handlerA & 0xffff);
    expect(wordAt(ptrs + 2)).toBe(handlerB & 0xffff);
  });
});
