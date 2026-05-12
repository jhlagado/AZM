import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR52: addr as 16-bit scalar in codegen', () => {
  it('allows addr locals/args as 16-bit slots', async () => {
    const entry = join(__dirname, 'fixtures', 'pr52_ptr_scalar_slots.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    // stack-local word store sequence: ld (hl),lo; inc hl; ld (hl),hi
    expect([...bin!.bytes]).toContain(0x36);
    expect([...bin!.bytes]).toContain(0x23);
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });
});
