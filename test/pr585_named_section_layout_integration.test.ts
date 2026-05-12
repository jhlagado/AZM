import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BinArtifact } from '../src/formats/types.js';
import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR585 named section layout integration', () => {
  it('merges contributions in root-first order across imports', async () => {
    const entry = join(__dirname, 'fixtures', 'pr585_named_section_order_root.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin?.bytes[0]).toBe(0xc9);
    expect(Array.from(bin?.bytes.slice(0x1000, 0x1004) ?? [])).toEqual([0x00, 0xc9, 0x3c, 0xc9]);
  });

  it('reports duplicate and missing anchors through full compile', async () => {
    const duplicate = await compile(join(__dirname, 'fixtures', 'pr585_duplicate_anchor.zax'), {}, { formats: defaultFormatWriters });
    expect(duplicate.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'Duplicate anchor for section "code boot".',
      }),
    ]);
    expect(duplicate.artifacts).toEqual([]);

    const missing = await compile(join(__dirname, 'fixtures', 'pr585_missing_anchor.zax'), {}, { formats: defaultFormatWriters });
    expect(missing.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'Missing anchor for section "code boot".',
      }),
    ]);
    expect(missing.artifacts).toEqual([]);
  });

  it('emits empty-anchor warnings through full compile', async () => {
    const res = await compile(join(__dirname, 'fixtures', 'pr585_empty_anchor.zax'), {}, { formats: defaultFormatWriters });

    expect(res.diagnostics).toEqual([
      expect.objectContaining({
        id: 'ZAX301',
        severity: 'warning',
        message: 'Anchor for section "code boot" has no contributions.',
      }),
    ]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin?.bytes[0]).toBe(0xc9);
  });

  it('supports top-level code alongside named sections during transition', async () => {
    const res = await compile(join(__dirname, 'fixtures', 'pr585_legacy_named_coexistence.zax'), {}, { formats: defaultFormatWriters });

    expect(res.diagnostics).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin?.bytes[0]).toBe(0xc9);
    expect(bin?.bytes[0x1000]).toBe(0xc9);
    expect(Array.from(bin?.bytes.slice(0x2000, 0x2003) ?? [])).toEqual([0x12, 0x34, 0x56]);
  });
});
