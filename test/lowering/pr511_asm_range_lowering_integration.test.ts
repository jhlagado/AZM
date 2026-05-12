import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('#511 asm range lowering integration', () => {
  it('keeps structured if/else lowering stable through the extracted asm-range helper', async () => {
    const res = await compile(
      join(__dirname, '..', 'fixtures', 'pr15_if_else.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    const bytes = Array.from(bin!.bytes);
    expect(bytes.slice(0, 3)).toEqual([0xdd, 0xe5, 0xdd]);
    expect(bytes).toContain(0xca);
    expect(bytes).toContain(0xc3);
    expect(bytes.at(-1)).toBe(0xc9);
  });

  it('keeps structured select lowering stable through the extracted asm-range helper', async () => {
    const res = await compile(
      join(__dirname, '..', 'fixtures', 'pr15_select_cases.zax'),
      {},
      { formats: defaultFormatWriters },
    );
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    const bytes = Array.from(bin!.bytes);
    expect(bytes.slice(0, 3)).toEqual([0xdd, 0xe5, 0xdd]);
    expect(bytes).toContain(0xc3);
    expect(bytes).toContain(0xfe);
    expect(bytes.at(-1)).toBe(0xc9);
  });
});
