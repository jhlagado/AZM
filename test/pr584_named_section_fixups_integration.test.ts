import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BinArtifact } from '../src/formats/types.js';
import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR584 named section fixups integration', () => {
  it('resolves symbols and fixups against placed named-section ranges', async () => {
    const entry = join(__dirname, 'fixtures', 'pr584_named_section_fixups.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(bin?.bytes.slice(0, 4)).toEqual(Uint8Array.from([0xcd, 0x01, 0x10, 0xc9]));
    expect(bin?.bytes.slice(0x1000, 0x1005)).toEqual(Uint8Array.from([0xc9, 0xcd, 0x00, 0x10, 0xc9]));
  });
});
