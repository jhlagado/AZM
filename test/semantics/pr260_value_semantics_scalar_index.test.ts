import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';
import { expectNoDiagnostics } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR260: scalar variable indices in array access', () => {
  it('lowers byte/word scalar indices in ld array forms', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr260_value_semantics_scalar_index.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoDiagnostics(res.diagnostics);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes.length).toBeGreaterThan(0);
  });
});
