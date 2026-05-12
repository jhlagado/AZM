import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact, D8mArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR163 lowering: extern base-relative calls across imports', () => {
  it('resolves imported based extern symbols and patches call fixups', async () => {
    const entry = join(__dirname, 'fixtures', 'pr163_import_extern_base_main.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(bin).toBeDefined();
    expect(d8m).toBeDefined();

    const symbols = d8m!.json['symbols'] as Array<{ name: string; address: number; kind: string }>;
    const legacyPutc = symbols.find((s) => s.name === 'legacy_putc');
    expect(legacyPutc).toBeDefined();
    expect(legacyPutc!.address).toBe(0x0002);

    const bytes = Array.from(bin!.bytes);
    const lo = legacyPutc!.address & 0xff;
    const hi = (legacyPutc!.address >> 8) & 0xff;
    const hasCallToLegacy = bytes.some(
      (_, idx) => bytes[idx] === 0xcd && bytes[idx + 1] === lo && bytes[idx + 2] === hi,
    );
    expect(hasCallToLegacy).toBe(true);
  });
});
