import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR156 parser: export whitespace forms', () => {
  it('accepts whitespace-delimited export prefixes for const/op/func', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr156_export_whitespace_forms.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes.length).toBeGreaterThan(0);
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });
});
