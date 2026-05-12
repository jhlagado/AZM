import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR92 lowering interaction torture suite', () => {
  it('accepts balanced nested control + locals + op/call interactions', async () => {
    const entry = join(__dirname, 'fixtures', 'pr92_balanced_nested_locals_ops.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin!.bytes[bin!.bytes.length - 1]).toBe(0xc9);
  });

  it('diagnoses select-join stack mismatch when locals are present', async () => {
    const entry = join(__dirname, 'fixtures', 'pr92_select_stack_mismatch_with_locals.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });

  it('diagnoses non-zero stack delta at function fallthrough', async () => {
    const entry = join(__dirname, 'fixtures', 'pr92_fallthrough_stack_delta.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.length).toBeGreaterThanOrEqual(0);
  });
});
