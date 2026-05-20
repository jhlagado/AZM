import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';
import { expectNoErrors } from '../helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR57: ISA im/rst/reti/retn', () => {
  it('encodes im, rst, reti, and retn', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr57_isa_im_rst.asm');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    expect(Array.from(bin?.bytes ?? [])).toEqual([0xed, 0x56, 0xc7, 0xcf, 0xff, 0xed, 0x4d, 0xed, 0x45]);
  });
});
