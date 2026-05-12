import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR135 ZAX-mode JR/DJNZ displacement operands', () => {
  it('keeps numeric JR and DJNZ operands as rel8 displacements in ZAX mode', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr135_isa_jr_djnz.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((artifact): artifact is BinArtifact => artifact.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes].slice(12, 28)).toEqual([
      0x18,
      0x00,
      0x18,
      0xfe,
      0x20,
      0x05,
      0x28,
      0xfb,
      0x30,
      0x7f,
      0x38,
      0x80,
      0x10,
      0x01,
      0x10,
      0xff,
    ]);
  });
});
