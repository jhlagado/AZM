import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';
import { expectNoDiagnostics } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR278: nested runtime-index store matrix (one atom)', () => {
  it('accepts one-atom nested load/store paths across byte and word elements', async () => {
    const entry = join(__dirname, 'fixtures', 'pr278_nested_runtime_store_matrix.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expectNoDiagnostics(res.diagnostics);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes.length).toBeGreaterThan(0);
  });
});
